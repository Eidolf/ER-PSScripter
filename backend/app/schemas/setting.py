from datetime import datetime
from pydantic import BaseModel

class SettingBase(BaseModel):
    description: str | None = None
    is_secret: bool = False

class SettingCreate(SettingBase):
    key: str
    value: str | None = None

class SettingUpdate(BaseModel):
    value: str | None = None

class SettingResponse(SettingBase):
    key: str
    value: str | None = None
    updated_at: datetime

    class Config:
        from_attributes = True

# For bulk updates
class SettingsUpdateRequest(BaseModel):
    settings: dict[str, str]  # Key: Value
