import os
import re
from typing import List
from app.schemas.snippet import SnippetCreate

class ScriptAnalyzerService:
    def analyze_folder(self, folder_path: str) -> List[SnippetCreate]:
        snippets = []
        if not os.path.exists(folder_path):
            return snippets

        for root, _, files in os.walk(folder_path):
            for file in files:
                if file.endswith(".ps1"):
                    full_path = os.path.join(root, file)
                    try:
                        with open(full_path, "r", encoding="utf-8") as f:
                            content = f.read()
                            extracted = self._extract_functions(content, file)
                            snippets.extend(extracted)
                    except Exception as e:
                        print(f"Error reading {file}: {e}")
        return snippets

    def _extract_functions(self, content: str, source: str) -> List[SnippetCreate]:
        found_snippets = []
        
        # Regex to find functions: function Name { ... }
        # Note: This is a simplified parser and might not handle nested braces correctly without a full parser.
        # For this MVP, we will try to match simple top-level functions or just capture the whole file if no function is found.
        
        function_pattern = re.compile(r"function\s+([\w-]+)\s*\{", re.IGNORECASE)
        
        for match in function_pattern.finditer(content):
            func_name = match.group(1)
            # A naive extraction of body would be hard with regex due to nested braces.
            # For now, we will create a snippet that points to the file, but ideally we want the content.
            # Let's improve this by assuming standard formatting or using a simple brace counter if possible.
            # OR, strictly for this MVP, we treat the whole file as a potential snippet source 
            # and just identify that functions exist.
            
            # Let's try to grab a block of text.
            start = match.start()
            # We'll just take the whole file content for now but tag it with the function name
            # Real parsing requires a ton of logic or PSScriptAnalyzer.
            
            found_snippets.append(SnippetCreate(
                name=func_name,
                content=content, # Storing full file content for context, in real world we'd slice
                source=source,
                tags=["function", "auto-discovered"]
            ))

        if not found_snippets:
            # If no functions found, treat the script as one snippet
            found_snippets.append(SnippetCreate(
                name=source,
                content=content,
                source=source,
                tags=["script", "auto-discovered"]
            ))
            
        return found_snippets
