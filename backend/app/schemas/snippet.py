from datetime import datetime

from pydantic import BaseModel


class SnippetBase(BaseModel):
    name: str
    description: str | None = None
    content: str
    tags: list[str] = []
    category: str = "General"
    source: str | None = None

class SnippetCreate(SnippetBase):
    pass

class SnippetUpdate(SnippetBase):
    pass

class SnippetResponse(SnippetBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
