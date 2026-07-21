from datetime import datetime

from pydantic import BaseModel


class SnippetBase(BaseModel):
    name: str
    description: str | None = None
    content: str
    tags: list[str] = []
    category: str | None = "General"
    source: str | None = None
    project_id: int | None = None
    relative_path: str | None = None
    content_hash: str | None = None

class SnippetCreate(SnippetBase):
    pass

class SnippetUpdate(SnippetBase):
    parent_version_id: int | None = None

class SnippetVersionResponse(BaseModel):
    id: int
    snippet_id: int
    version: int
    name: str
    description: str | None = None
    content: str
    parent_version_id: int | None = None
    created_at: datetime

    class Config:
        from_attributes = True

class SnippetResponse(SnippetBase):
    id: int
    created_at: datetime
    updated_at: datetime
    has_embedding: bool = False

    class Config:
        from_attributes = True
