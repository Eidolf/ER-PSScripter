from typing import Any
from fastapi import APIRouter, HTTPException, Depends
from app.models.script_models import ScriptRequest, ScriptResponse
from app.services.ai_generator import AIGeneratorService

router = APIRouter()
ai_service = AIGeneratorService()

@router.post("/generate", response_model=ScriptResponse)
async def generate_script(request: ScriptRequest) -> Any:
    """
    Generate a PowerShell script based on requirements.
    """
    try:
        result = await ai_service.generate_script(request)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
