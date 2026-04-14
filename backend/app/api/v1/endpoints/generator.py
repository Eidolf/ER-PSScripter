from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api import deps
from app.models.snippet import Snippet
from app.schemas.generator import GenerateRequest, GenerateResponse
from app.services.ai_service import AIService

router = APIRouter()
ai_service = AIService()

@router.post("/generate", response_model=GenerateResponse)
async def generate_script(
    request: GenerateRequest,
    db: Session = Depends(deps.get_db)
) -> Any:
    """
    Generate a PowerShell script based on a prompt and optional context snippets.
    """
    context_snippets = []
    if request.snippet_ids:
        context_snippets = db.query(Snippet).filter(Snippet.id.in_(request.snippet_ids)).all()
        # Verify all requested snippets were found (optional strictly, but good for debugging)
        # if len(context_snippets) != len(request.snippet_ids):
        #     logger.warning("Some requested snippets were not found.")

    result = await ai_service.generate_script_with_db(request.prompt, context_snippets, db)
    
    # Result is now a dict { "content": ..., "usage": ... }
    # Or string if error (though service should ideally return consistent type, let's handle both)
    if isinstance(result, str):
         return GenerateResponse(content=result)
         
    return GenerateResponse(
        content=result["content"], 
        explanation=result.get("explanation"),
        usage=result["usage"],
        rag_info=result.get("rag_info", {})
    )
