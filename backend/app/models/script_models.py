
from pydantic import BaseModel


class ScriptRequest(BaseModel):
    name: str
    description: str
    requirements: list[str]
    input_sources: list[str] | None = None  # Local paths or URLs
    include_header: bool = True
    custom_header_text: str | None = None

class ScriptResponse(BaseModel):
    name: str
    content: str
    optimization_suggestions: list[str]
    used_snippets: list[str]

class SnippetCreate(BaseModel):
    name: str
    content: str
    tags: list[str]
    source: str
