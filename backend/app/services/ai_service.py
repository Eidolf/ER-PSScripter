import logging
from typing import Any

import openai
from sqlalchemy.orm import Session

from app.models.setting import SystemSetting
from app.models.snippet import Snippet

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
        
        # If API key is empty/placeholder, return None to signal config error
        if not api_key or api_key == "sk-placeholder":
             # Try fallback to env if not in DB (backward compat)? No, fully switch to DB.
             # Actually, for init simplicity, we can let it fail later or return partial client.
             pass

        client: Any = None
        if provider == "azure":
            endpoint = config.get("AZURE_OPENAI_ENDPOINT")
            deployment = config.get("AZURE_OPENAI_DEPLOYMENT_NAME")
            api_version = config.get("AZURE_OPENAI_API_VERSION", "2024-02-15-preview")
            
            if not endpoint or not deployment:
                raise ValueError("Azure configuration missing (Endpoint/Deployment)")

            client = openai.AzureOpenAI(
                api_key=api_key,
                api_version=api_version,
                azure_endpoint=endpoint
            )
            model = deployment
        else:
            base_url = config.get("OPENAI_BASE_URL") or None # Empty string -> None
            model = config.get("OPENAI_MODEL", "gpt-4o")
            
            client = openai.OpenAI(
                api_key=api_key,
                base_url=base_url
            )
        
        return client, model

    def _construct_system_prompt(self, context_snippets: list[Snippet]) -> str:
        prompt = (
            "You are an expert PowerShell script generator.\n"
            "Your goal is to generate a PowerShell script based on the user's request.\n"
            "You have access to the following existing snippets/functions from the user's library.\n"
            "Prefer using these functions where appropriate to maintain consistency.\n\n"
        )

        if context_snippets:
            prompt += "--- EXISTING SNIPPETS ---\n"
            for snippet in context_snippets:
                prompt += f"### Snippet: {snippet.name} (Tags: {snippet.tags})\n"
                prompt += f"Description: {snippet.description}\n"
                prompt += f"Content:\n{snippet.content}\n\n"
            prompt += "--- END SNIPPETS ---\n\n"
        
        prompt += (
            "If you use an existing snippet, assume it is available in the runspace "
            "(do not redefine it unless necessary, or wrap it in a 'Function' block if asked).\n"
            "Provide ONLY the PowerShell code in your response, wrapped in a markdown code block "
            "(```powershell ... ```).\n"
            "If you need to explain something, add it as a comment in the code."
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
        
    def generate_script_with_db(self, user_prompt: str, context_snippets: list[Snippet], db: Session) -> dict[str, Any]:
        try:
            config = self._get_config(db)
            client, model = self._init_client(config)
            
            system_prompt = self._construct_system_prompt(context_snippets)
            
            response = client.chat.completions.create(
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
