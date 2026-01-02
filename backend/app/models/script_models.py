from typing import List, Optional
from pydantic import BaseModel, HttpUrl

class ScriptRequest(BaseModel):
    name: str
    description: str
    requirements: List[str]
    input_sources: Optional[List[str]] = None  # Local paths or URLs
    include_header: bool = True
    custom_header_text: Optional[str] = None

class ScriptResponse(BaseModel):
    name: str
    content: str
    optimization_suggestions: List[str]
    used_snippets: List[str]

class SnippetCreate(BaseModel):
    name: str
    content: str
    tags: List[str]
    source: str
