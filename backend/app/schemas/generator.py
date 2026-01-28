from typing import Any

from pydantic import BaseModel


class GenerateRequest(BaseModel):
    prompt: str
    snippet_ids: list[int] = []

class GenerateResponse(BaseModel):
    content: str
    explanation: str | None = None
    usage: dict[str, int] = {}
    rag_info: dict[str, Any] = {}
