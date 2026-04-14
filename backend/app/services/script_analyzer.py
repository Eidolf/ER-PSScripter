import hashlib
import os
import re

from app.schemas.snippet import SnippetCreate

# ...

class ScriptAnalyzerService:
    def _compute_hash(self, content: str) -> str:
        return hashlib.sha256(content.encode('utf-8')).hexdigest()

    def analyze_folder(self, folder_path: str) -> list[SnippetCreate]:
        snippets: list[SnippetCreate] = []
        if not os.path.exists(folder_path):
            return snippets

        for root, _, files in os.walk(folder_path):
            for file in files:
                if file.lower().endswith(".ps1"):
                    full_path = os.path.join(root, file)
                    try:
                        with open(full_path, encoding="utf-8") as f:
                            content = f.read()
                            extracted = self.analyze_content(content, file)
                            snippets.extend(extracted)
                    except Exception as e:
                        print(f"Error reading {file}: {e}")
        return snippets

    def analyze_content(self, content: str, filename: str, split_functions: bool = False) -> list[SnippetCreate]:
        return self._extract_functions(content, filename, split_functions)

    def _extract_functions(self, content: str, source: str, split_functions: bool = False) -> list[SnippetCreate]:
        found_snippets = []
        
        # Regex to find function definitions start: function Name {
        # We use this to find the starting point, then we use brace counting for the body.
        function_start_pattern = re.compile(r"function\s+([\w-]+)\s*\{", re.IGNORECASE)
        
        matches = list(function_start_pattern.finditer(content))
        
        # IF splitting is disabled OR no functions found, treat as whole file
        if not split_functions or not matches:
            # No functions found, treat entire file as script
            help_info = self._extract_help_info(content, 0)
            description_val = help_info.get("description", "")
            description = description_val if isinstance(description_val, str) else ""
            
            # Append parameters if found distinct from description
            parameters_val = help_info.get("parameters")
            if isinstance(parameters_val, list) and parameters_val:
                params_str = ", ".join([str(p) for p in parameters_val])
                description += f"\n\nParameters: {params_str}"

            tags_val = help_info.get("tags", [])
            tags = tags_val if isinstance(tags_val, list) else []

            found_snippets.append(SnippetCreate(
                name=source,
                content=content.strip(),
                source=source,
                description=description.strip() or None,
                tags=sorted(list(set([str(t) for t in tags] + ["script", "auto-discovered"]))),
                content_hash=self._compute_hash(content.strip())
            ))
            return found_snippets

        for match in matches:
            func_name = match.group(1)
            start_index = match.end() - 1 # This is the opening brace '{'
            
            # Extract body using brace counting
            end_index = self._find_matching_brace(content, start_index)
            
            if end_index != -1:
                # We have the full function body including braces
                # But typically we want the whole definition including "function Name"
                # So we take from match.start() to end_index + 1
                full_function_text = content[match.start():end_index+1]
                
                # Look for help immediately before the function
                help_info = self._extract_help_info(content, match.start())
                
                description_val = help_info.get("description", "")
                description = description_val if isinstance(description_val, str) else ""
                
                 # Append parameters if found
                parameters_val = help_info.get("parameters")
                if isinstance(parameters_val, list) and parameters_val:
                    params_str = ", ".join([str(p) for p in parameters_val])
                    description += f"\n\nParameters: {params_str}"
                
                tags_val = help_info.get("tags", [])
                tags = tags_val if isinstance(tags_val, list) else []

                found_snippets.append(SnippetCreate(
                    name=func_name,
                    content=full_function_text,
                    source=source,
                    description=description.strip() or None,
                    tags=sorted(list(set([str(t) for t in tags] + ["function", "auto-discovered"]))),
                    content_hash=self._compute_hash(full_function_text)
                ))

        return found_snippets


    def _find_matching_brace(self, content: str, start_index: int) -> int:
        """
        Find the index of the closing brace '}' corresponding to the '{' at start_index.
        Returns -1 if not found.
        """
        if start_index >= len(content) or content[start_index] != '{':
            return -1

        balance = 1
        in_single_quote = False
        in_double_quote = False
        escape = False
        
        i = start_index + 1
        while i < len(content):
            char = content[i]
            
            if escape:
                escape = False
                i += 1
                continue
                
            if char == '`': # PowerShell escape character
                escape = True
                i += 1
                continue

            if char == "'" and not in_double_quote:
                in_single_quote = not in_single_quote
            elif char == '"' and not in_single_quote:
                in_double_quote = not in_double_quote
            
            if not in_single_quote and not in_double_quote:
                if char == '{':
                    balance += 1
                elif char == '}':
                    balance -= 1
                    if balance == 0:
                        return i
            i += 1
            
        return -1

    def _extract_help_info(self, content: str, end_pos: int) -> dict[str, list[str] | str]:
        """
        Scans backwards from end_pos to find a Comment-Based Help block (<# ... #>).
        Parses .SYNOPSIS, .DESCRIPTION, .PARAMETER.
        """
        # Look backwards for the *end* of a block comment: #>
        # We limit the search to avoid scanning the whole file unnecessarily
        search_limit = max(0, end_pos - 2000) 
        preceding_text = content[search_limit:end_pos].rstrip()
        
        if not preceding_text.endswith("#>"):
            return {}

        # Find the start of the comment block <#
        # We need to find the last occurrence of <# before the #> we just found
        block_end_idx = preceding_text.rfind("#>")
        block_start_idx = preceding_text.rfind("<#", 0, block_end_idx)
        
        if block_start_idx == -1:
            return {}
            
        comment_block = preceding_text[block_start_idx+2 : block_end_idx]
        
        # Parse standard keywords
        info: dict[str, list[str] | str] = {
            "tags": [],
            "parameters": []
        }
        
        # Simple line-by-line parser for keywords
        lines = comment_block.split('\n')
        current_section: str | None = None
        current_param_name: str | None = None
        current_text: list[str] = []

        def save_section() -> None:
            if current_section:
                text = " ".join([line.strip() for line in current_text if line.strip()])
                if current_section == "SYNOPSIS" and text:
                    info["synopsis"] = text
                elif current_section == "DESCRIPTION" and text:
                    info["description"] = text
                elif current_section == "PARAMETER" and current_param_name and isinstance(info["parameters"], list):
                    info["parameters"].append(current_param_name)

        for line in lines:
            line_stripped = line.strip()
            upper_line = line_stripped.upper()
            
            if upper_line.startswith(".SYNOPSIS"):
                save_section()
                current_section = "SYNOPSIS"
                current_text = []
            elif upper_line.startswith(".DESCRIPTION"):
                save_section()
                current_section = "DESCRIPTION"
                current_text = []
            elif upper_line.startswith(".PARAMETER"):
                save_section()
                current_section = "PARAMETER"
                # Parse name from original line to preserve case
                parts = line_stripped.split(" ", 1)
                current_param_name = parts[1] if len(parts) > 1 else "Unknown"
                current_text = []
            elif upper_line.startswith(".") and len(upper_line) > 1:
                # Other sections
                save_section()
                current_section = "OTHER"
                current_text = []
            else:
                if current_section in ["SYNOPSIS", "DESCRIPTION"]:
                    current_text.append(line_stripped)
        
        save_section()
        
        # Construct final description
        desc_parts: list[str] = []
        synopsis = info.get("synopsis")
        if isinstance(synopsis, str):
            desc_parts.append(synopsis)
        
        description = info.get("description")
        if isinstance(description, str):
            desc_parts.append(description)
            
        info["description"] = "\n\n".join(desc_parts)
        
        return info
