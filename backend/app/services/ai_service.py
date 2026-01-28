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
            "You are an expert PowerShell Scripting Assistant.\n"
            "Your ONLY goal is to generate high-quality, production-ready PowerShell scripts.\n"
            "Follow these strict rules:\n"
            "1. OUTPUT VALID POWERSHELL CODE ONLY. Do not provide Python, Bash, or general explanations "
            "unless specifically asked.\n"
            "2. Wrap your code in ```powershell``` markdown blocks.\n"
            "3. Use PowerShell Best Practices (CmdletBinding, strict parameters, error handling).\n"
            "4. If you use provided Snippets, integrae them seamlessly.\n"
            "5. Do NOT chatter. Be concise. The user wants CODE.\n\n"
        )

        if context_snippets:
            prompt += "--- EXISTING SNIPPETS (CONTEXT) ---\n"
            for snippet in context_snippets:
                prompt += f"### Snippet: {snippet.name} (Tags: {snippet.tags})\n"
                prompt += f"Description: {snippet.description}\n"
                prompt += f"Content:\n{snippet.content}\n\n"
            prompt += "--- END SNIPPETS ---\n\n"
        
        prompt += (
            "If you use an existing snippet, assume it is available in the runspace "
            "(do not redefine it unless necessary, or wrap it in a 'Function' block if asked).\n"
            "Provide ONLY the PowerShell code in your response.\n"
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
            try:
                query_embedding = await embedding_service.generate_embedding(user_prompt, db)
                
                # Perform search. Note: db is Sync, but VectorStore uses async execution. 
                # Ideally pass AsyncSession, but since we are in async function, we can potentially bridge.
                # However, with current setup, vector_store expects session.execute (async).
                # Since db is Sync Session, we can't await db.execute.
                # WORKAROUND: Use standard sqlalchemy select execution on sync session, 
                # OR (Preferred) create a temporary async session or use direct SQL.
                # For simplicity here, we will just NOT use vector_store.py IF it requires AsyncSession, 
                # but let's see. vector_store.py uses 'await session.execute'.
                # Let's rewrite the search logic locally here using sync execution if needed, 
                # or adapt vector_store. But wait, we want to use 'vector_store'.
                
                # Let's assume we can get an async session or run it synchronously. 
                # Since we are in async def, blocking calls are okay-ish.
                # Let's modify the query to run on the 'db' session synchronously.
                
                # Retrieve similar snippets
                from sqlalchemy import select
                # Using 0.5 as threshold
                stmt = select(Snippet).order_by(Snippet.embedding.cosine_distance(query_embedding)).limit(3)
                relevant_snippets = db.execute(stmt).scalars().all()
                
                # Add unique relevant snippets to context
                existing_ids = {s.id for s in context_snippets}
                for s in relevant_snippets:
                    if s.id not in existing_ids:
                        context_snippets.append(s)
                        existing_ids.add(s.id)

            except Exception as e:
                logger.warning(f"RAG Retrieval failed: {e}")

            system_prompt = self._construct_system_prompt(context_snippets)
            
            # Use await because client is AsyncOpenAI
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.2
            )
            content = response.choices[0].message.content
            if not content:
                return {"content": "# Error: No content generated.", "usage": {}}
            
            # Strip markdown code blocks if present
            content = content.strip()
            if content.startswith("```powershell"):
                content = content[13:]
            elif content.startswith("```"):
                content = content[3:]
            
            if content.endswith("```"):
                content = content[:-3]
            
            # Extract usage
            usage = {
                "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                "total_tokens": response.usage.total_tokens if response.usage else 0
            }

            return {
                "content": content.strip(),
                "usage": usage
            }

        except Exception as e:
            logger.error(f"AI Generation Failed: {e}")
            return {"content": f"# Error generating script: {str(e)}", "usage": {}}
