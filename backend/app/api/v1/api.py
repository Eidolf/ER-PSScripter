from fastapi import APIRouter

from app.api.v1.endpoints import scripts, snippets

api_router = APIRouter()
api_router.include_router(scripts.router, prefix="/scripts", tags=["scripts"])
api_router.include_router(snippets.router, prefix="/snippets", tags=["snippets"])
