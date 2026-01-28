from typing import Any, cast

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api import deps
from app.models.setting import SystemSetting
from app.schemas.setting import SettingResponse, SettingsUpdateRequest
from app.services.ai_service import AIService


class TestConnectionRequest(BaseModel):
    provider: str
    api_key: str
    base_url: str | None = None
    azure_endpoint: str | None = None
    azure_deployment: str | None = None
    azure_api_version: str | None = None
    model: str | None = None

router = APIRouter()
ai_service = AIService()

# Define default settings/keys that should exist
DEFAULT_KEYS = {
    "LLM_PROVIDER": "openai",
    "EMBEDDING_PROVIDER": "",
    "OPENAI_API_KEY": "",
    "OPENAI_MODEL": "gpt-4o",
    "OPENAI_BASE_URL": "",
    "AZURE_OPENAI_ENDPOINT": "",
    "AZURE_OPENAI_API_VERSION": "2024-02-15-preview",
    "AZURE_OPENAI_DEPLOYMENT_NAME": "",
    "AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME": "",
    "CUSTOM_CATEGORIES": "[]",
}
SECRETS = ["OPENAI_API_KEY"]

def _ensure_defaults(db: Session) -> None:
    for key, default_val in DEFAULT_KEYS.items():
        exists = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        if not exists:
            # Check if secret
            is_secret = key in SECRETS
            db.add(SystemSetting(key=key, value=default_val, is_secret=is_secret))
    db.commit()

@router.get("/", response_model=list[SettingResponse])
def get_settings(
    db: Session = Depends(deps.get_db)
) -> Any:
    """
    Get all system settings.
    """
    _ensure_defaults(db)
    settings = db.query(SystemSetting).all()
    
    # Mask secrets
    for s in settings:
        if s.is_secret and s.value and len(s.value) > 4:
            s.value = f"****{s.value[-4:]}"
        elif s.is_secret and s.value:
            s.value = "****"
            
    return settings

@router.post("/", response_model=list[SettingResponse])
def update_settings(
    update_req: SettingsUpdateRequest,
    db: Session = Depends(deps.get_db)
) -> Any:
    """
    Update settings.
    """
    updated = []
    for key, value in update_req.settings.items():
        setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        if setting:
            setting.value = value
            updated.append(setting)
            db.add(setting)
        else:
            # Allow creating new settings (dynamic)
            # Default is_secret to False unless in SECRETS list
            is_secret = key in SECRETS
            new_setting = SystemSetting(key=key, value=value, is_secret=is_secret)
            db.add(new_setting)
            updated.append(new_setting)
    
    db.commit()
    db.commit()
    return updated

@router.post("/test-connection")
async def test_connection(
    request: TestConnectionRequest,
    db: Session = Depends(deps.get_db)
) -> Any:
    """
    Test the AI connection with provided settings.
    """
    api_key_to_use = request.api_key
    
    # Check if masked key
    if not api_key_to_use or "****" in api_key_to_use:
        # Retrieve stored key from DB
        stored_setting = db.query(SystemSetting).filter(SystemSetting.key == "OPENAI_API_KEY").first()
        if stored_setting and stored_setting.value:
             api_key_to_use = stored_setting.value

    # Construct a temporary config dict
    config = {
        "LLM_PROVIDER": request.provider,
        "OPENAI_API_KEY": api_key_to_use,
        "OPENAI_BASE_URL": request.base_url,
        "AZURE_OPENAI_ENDPOINT": request.azure_endpoint,
        "AZURE_OPENAI_DEPLOYMENT_NAME": request.azure_deployment,
        "AZURE_OPENAI_API_VERSION": request.azure_api_version,
        "OPENAI_MODEL": request.model or "gpt-3.5-turbo" # Use provided model or fallback
    }
    
    try:
        # We'll reuse AIService's init_client but need to expose it or refactor.
        # Accessing protected method _init_client is dirty but quick for now.
        client, _ = ai_service._init_client(config)
        
        # Perform a lightweight call. List models is good for OpenAI.
        # For Azure, list models might differ. 
        # A simple completion is more universal.
        
        import openai
        
        try:
            if isinstance(client, openai.AsyncAzureOpenAI | openai.AsyncOpenAI):
                
                # Use the configured model
                model_to_use = request.model
                if request.provider == "azure":
                    model_to_use = request.azure_deployment
                elif not model_to_use:
                     model_to_use = "gpt-3.5-turbo"

                # Just try to generate a tiny string
                await client.chat.completions.create(
                    model=cast(Any, model_to_use),
                    messages=[{"role": "user", "content": "Hi"}],
                    max_tokens=1,
                )
            else:
                # Sync client (fallback if service accidentally returns sync)
                # But we changed service to Async.
                pass
                
        except Exception as e:
            return {"success": False, "error": str(e)}

        return {"success": True, "message": "Connection successful!"}
        
    except Exception as e:
        return {"success": False, "error": str(e)}
