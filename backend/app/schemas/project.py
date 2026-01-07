from datetime import datetime

from pydantic import BaseModel

from app.schemas.snippet import SnippetResponse as Snippet


class ProjectBase(BaseModel):
    name: str
    description: str | None = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(ProjectBase):
    pass


class ProjectInDBBase(ProjectBase):
    id: int
    user_id: int | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class Project(ProjectInDBBase):
    snippets: list[Snippet] = []


class ProjectFolder(BaseModel):
    name: str
    files: list["ProjectFile"] = []
    folders: list["ProjectFolder"] = []


class ProjectFile(BaseModel):
    name: str # snippet name or filename
    snippet_id: int


ProjectFolder.model_rebuild()
