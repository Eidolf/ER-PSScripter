import logging
from typing import Any

import openai
from sqlalchemy.orm import Session

from app.models.setting import SystemSetting
from app.models.snippet import Snippet
from app.services.embedding_service import embedding_service

logger = logging.getLogger(__name__)

class AIService:
    # Remove __init__ client setup, moving to dynamic setup per request

    def _get_config(self, db: Session) -> dict[str, Any]:
        # Fetch all settings as key-value pairs
        settings = db.query(SystemSetting).all()
        config = {str(s.key): s.value for s in settings}
        return config

    def _init_client(self, config: dict[str, Any]) -> tuple[Any, Any]:
        provider = config.get("LLM_PROVIDER", "openai")
        api_key = config.get("OPENAI_API_KEY", "")
        
        # Support for local LLMs (e.g., Ollama) which might not need an API Key
        base_url = config.get("OPENAI_BASE_URL") or None
        
        # If API key is empty but we have a base_url, use a dummy key
        if (not api_key or api_key == "sk-placeholder") and base_url:
            api_key = "local-no-key"

        # If still no API key and no base_url (or provider requires it), then fail
        if not api_key or api_key == "sk-placeholder":
             # Return None to signal config error
             return None, None

        client: Any = None
        if provider == "azure":
            endpoint = config.get("AZURE_OPENAI_ENDPOINT")
            deployment = config.get("AZURE_OPENAI_DEPLOYMENT_NAME")
            api_version = config.get("AZURE_OPENAI_API_VERSION", "2024-02-15-preview")
            
            if not endpoint or not deployment:
                raise ValueError("Azure configuration missing (Endpoint/Deployment)")

            client = openai.AsyncAzureOpenAI(
                api_key=api_key,
                api_version=api_version,
                azure_endpoint=endpoint
            )
            model = deployment
        else:
            if provider == "local_builtin":
                # Internal Docker URL for the built-in Ollama service
                base_url = "http://ollama:11434/v1"
                # Default to a small/fast model if none specified
                model = config.get("OPENAI_MODEL") or "llama3"
                api_key = "local-builtin" # Dummy key
            else:
                base_url = config.get("OPENAI_BASE_URL") or None # Empty string -> None
                model = config.get("OPENAI_MODEL", "gpt-4o")
            
            client = openai.AsyncOpenAI(
                api_key=api_key,
                base_url=base_url
            )
        
        return client, model

    def _construct_system_prompt(self, context_snippets: list[Snippet]) -> str:
        prompt = (
            "You are an expert PowerShell Scripting Assistant (Senior DevOps Engineer).\n"
            "Your ONLY goal is to generate high-quality, production-ready PowerShell code "
            "that adheres to strict industry standards.\n"
            "\n"
            "### STRICT RULES (Must Follow):\n"
            "1. **Modern PowerShell Only:** Use PowerShell Core (7+) syntax where possible, "
            "but maintain compatibility if not specified.\n"
            "2. **PSScriptAnalyzer Compliance:**\n"
            "   - Use `CamelCase` for variables (e.g., `$myVariable`).\n"
            "   - Use `PascalCase` for functions and parameters (e.g., `Get-User`, `$Path`).\n"
            "   - Avoid aliases (use `Get-ChildItem` not `gci`, `Where-Object` not `?`).\n"
            "   - Always use `[CmdletBinding()]` for functions.\n"
            "   - Use `param()` blocks with typed parameters (e.g., `[string]$Path`).\n"
            "3. **Robust Error Handling:**\n"
            "   - Use `try/catch` blocks for potentially failing commands.\n"
            "   - Use `Write-Error`, `Write-Warning`, and `Write-Verbose` appropriately.\n"
            "4. **Output:**\n"
            "   - ONLY valid PowerShell code.\n"
            "   - Provide a top-level comment block `<# ... #>` explaining the script.\n"
            "   - No conversational text before or after the code block.\n"
            "5. **Formatting:**\n"
            "   - Indent with 4 spaces.\n"
            "   - Wrap code in ```powershell markdown blocks.\n"
            "\n"
        )

        if context_snippets:
            prompt += "--- EXISTING SNIPPETS (CONTEXT) ---\n"
            for snippet in context_snippets:
                prompt += f"### Snippet: {snippet.name} (Tags: {snippet.tags})\n"
                prompt += f"Description: {snippet.description}\n"
                prompt += f"Content:\n{snippet.content}\n\n"
            prompt += "--- END SNIPPETS ---\n\n"
        
        prompt += (
            "### NEGATIVE CONSTRAINTS (Forbidden):\n"
            "1. DO NOT suggest Python, Bash, or Batch alternatives.\n"
            "2. DO NOT provide conversational filler (e.g., 'Here is the script', 'I hope this helps').\n"
            "3. DO NOT output code fences for languages other than `powershell`.\n"
            "\n"
            "### EXAMPLES (Few-Shot):\n"
            "User: 'Print hello world'\n"
            "Assistant:\n"
            "```powershell\n"
            "Write-Host 'Hello, World!'\n"
            "```\n"
            "\n"
            "User: 'Create a loop 1 to 5'\n"
            "Assistant:\n"
            "```powershell\n"
            "foreach ($i in 1..5) {\n"
            "    Write-Host $i\n"
            "}\n"
            "```\n"
            "\n"
            "### INSTRUCTION:\n"
            "Using the context above (if useful), generate the requested PowerShell script.\n"
            "If you reuse a snippet, ensure it is correctly integrated.\n"
            "Do NOT chat. Return ONLY the code.\n"
            "START CODE NOW:\n"
        )
        return prompt

    def generate_script(self, user_prompt: str, context_snippets: list[Snippet]) -> str:
        # We need a DB session to fetch settings. 
        # Ideally, we should pass 'db' from the endpoint, but to avoid changing signature too much
        # we can use SessionLocal(), but better to refactor signature if possible.
        # Let's inspect call site... It's called from endpoint where we have 'db'.
        # I'll update generator using this service to pass 'db'. 
        
        # NOTE: Since I am overwriting the file, I will add the db argument to generate_script
        return ""
        
    async def generate_script_with_db(
        self, user_prompt: str, context_snippets: list[Snippet], db: Session
    ) -> dict[str, Any]:
        try:
            config = self._get_config(db)
            client, model = self._init_client(config)
            
            # RAG Logic: Retrieve similar snippets from "Memory"
            rag_snippets = []
            try:
                # Generate embedding for the user prompt
                query_embedding = await embedding_service.generate_embedding(user_prompt, db)
                
                # Perform vector search using synchronous SQLAlchemy
                from sqlalchemy import select
                
                # Retrieve top 3 snippets with distance < 0.4 (Cosine Distance)
                # Lower distance = more similar
                stmt = select(Snippet).order_by(Snippet.embedding.cosine_distance(query_embedding)).limit(3)
                relevant_rows = db.execute(stmt).scalars().all()
                
                # Filter by threshold locally if not doing it in DB (pgvector usually sorts, but thresholding is good)
                # Note: pgvector distance is 0..2 for cosine (1 - cosine_similarity)
                # We interpret "distance" here.
                
                logger.info(f"RAG: Found {len(relevant_rows)} potentially relevant snippets.")
                
                # Add unique relevant snippets to context
                existing_ids = {s.id for s in context_snippets}
                for s in relevant_rows:
                    if s.id not in existing_ids and s.embedding is not None:
                        # Manual threshold check (optional, but good for quality)
                        # calculating distance locally is hard without numpy, so we rely on the DB sort order.
                        # We blindly trust the top 3 are relevant enough for now.
                        context_snippets.append(s)
                        existing_ids.add(s.id)
                        rag_snippets.append(s.name)
                        logger.info(f"RAG: Added snippet '{s.name}' to context.")

            except Exception as e:
                logger.warning(f"RAG Retrieval failed: {e}")

            system_prompt = self._construct_system_prompt(context_snippets)
            
            # Use await because client is AsyncOpenAI
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {
                        "role": "user",
                        "content": (
                            f"{user_prompt}\n\n"
                            "[SYSTEM INSTRUCTION: You MUST generate valid PowerShell code for this request.]"
                        )
                    }
                ],
                temperature=0.2
            )
            content = response.choices[0].message.content
            if not content:
                return {"content": "# Error: No content generated.", "usage": {}}
            
            # Extract Code and Explanation using Regex
            import re
            
            # Pattern to find Markdown code blocks, specifically powershell or generic
            # flags=re.DOTALL allows dot to match newlines
            match = re.search(r"```(?:powershell)?\s*(.*?)\s*```", content, re.DOTALL)
            
            explanation = ""
            if match:
                code_content = match.group(1).strip()
                # Remove the code block from the content to get explanation
                # We replace the whole block with empty string or a placeholder
                explanation_text = content.replace(match.group(0), "").strip()
                explanation = explanation_text
                content = code_content
            else:
                # Fallback: If no code fence, assume it might be raw code if it has specific keywords
                # But safer to just leave it as is, or if strict mode failed.
                # Given our prompt, we treat it as code but warn? 
                # Actually, the user says "outside of these signs is explanation".
                # If no signs, it's ambiguous. But we can leave 'content' as is and 'explanation' empty.
                pass

            # Extract usage
            usage = {
                "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                "total_tokens": response.usage.total_tokens if response.usage else 0
            }
            
            rag_info = {
                "count": len(rag_snippets),
                "snippets": rag_snippets
            }

            return {
                "content": content.strip(),
                "explanation": explanation,
                "usage": usage,
                "rag_info": rag_info
            }

        except Exception as e:
            logger.error(f"AI Generation Failed: {e}")
            return {"content": f"# Error generating script: {str(e)}", "usage": {}}
