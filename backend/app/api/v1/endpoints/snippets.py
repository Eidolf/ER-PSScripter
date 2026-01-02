from typing import Any, List
from fastapi import APIRouter, HTTPException
from app.models.script_models import SnippetCreate

router = APIRouter()

@router.get("/", response_model=List[SnippetCreate])
async def list_snippets() -> Any:
    """
    List all reusable snippets.
    """
    return []

@router.post("/", response_model=SnippetCreate)
async def create_snippet(snippet: SnippetCreate) -> Any:
    """
    Add a new snippet to the library.
    """
    return snippet
