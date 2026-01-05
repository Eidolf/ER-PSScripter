from fastapi import APIRouter

from app.api.v1.endpoints import generator, scripts, settings, snippets, tags

api_router = APIRouter()
api_router.include_router(scripts.router, prefix="/scripts", tags=["scripts"])
api_router.include_router(snippets.router, prefix="/snippets", tags=["snippets"])
api_router.include_router(generator.router, prefix="/generator", tags=["generator"])
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])
api_router.include_router(tags.router, prefix="/tags", tags=["tags"])
