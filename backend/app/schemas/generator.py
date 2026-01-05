from pydantic import BaseModel


class GenerateRequest(BaseModel):
    prompt: str
    snippet_ids: list[int] = []

class GenerateResponse(BaseModel):
    content: str
    usage: dict[str, int] = {}
