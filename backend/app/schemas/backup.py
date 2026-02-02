from pydantic import BaseModel

from app.schemas.project import ProjectInDBBase
from app.schemas.setting import SettingResponse
from app.schemas.snippet import SnippetResponse
from app.schemas.user import User


class BackupData(BaseModel):
    version: str = "1.0"
    timestamp: str
    users: list[User]
    settings: list[SettingResponse]
    projects: list[ProjectInDBBase]
    snippets: list[SnippetResponse]
