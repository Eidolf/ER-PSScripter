from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel

class SnippetBase(BaseModel):
    name: str
    description: Optional[str] = None
    content: str
    tags: List[str] = []
    source: Optional[str] = None

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
