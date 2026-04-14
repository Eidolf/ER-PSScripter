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
    pass

class SnippetResponse(SnippetBase):
    id: int
    created_at: datetime
    updated_at: datetime
    has_embedding: bool = False

    class Config:
        from_attributes = True
