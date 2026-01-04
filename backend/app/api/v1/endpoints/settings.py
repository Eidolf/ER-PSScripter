from typing import Any
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api import deps
from app.models.setting import SystemSetting
from app.schemas.setting import SettingResponse, SettingsUpdateRequest

router = APIRouter()

# Define default settings/keys that should exist
DEFAULT_KEYS = {
    "LLM_PROVIDER": "openai",
    "OPENAI_API_KEY": "",
    "OPENAI_MODEL": "gpt-4o",
    "OPENAI_BASE_URL": "",
    "AZURE_OPENAI_ENDPOINT": "",
    "AZURE_OPENAI_API_VERSION": "2024-02-15-preview",
    "AZURE_OPENAI_DEPLOYMENT_NAME": "",
    "CUSTOM_CATEGORIES": "[]",
}
SECRETS = ["OPENAI_API_KEY"]

def _ensure_defaults(db: Session):
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
    return updated
