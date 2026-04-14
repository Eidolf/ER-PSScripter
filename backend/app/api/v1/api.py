from fastapi import APIRouter, Depends

from app.api import deps
from app.api.v1.endpoints import backup, execute, generator, login, projects, scripts, settings, snippets, tags, users

api_router = APIRouter()
api_router.include_router(login.router, tags=["login"])
api_router.include_router(scripts.router, prefix="/scripts", tags=["scripts"],
                          dependencies=[Depends(deps.get_current_user)])
api_router.include_router(execute.router, prefix="/execute", tags=["execute"],
                          dependencies=[Depends(deps.get_current_user)])
api_router.include_router(snippets.router, prefix="/snippets", tags=["snippets"],
                          dependencies=[Depends(deps.get_current_user)])
api_router.include_router(generator.router, prefix="/generator", tags=["generator"],
                          dependencies=[Depends(deps.get_current_user)])
api_router.include_router(settings.router, prefix="/settings", tags=["settings"],
                          dependencies=[Depends(deps.get_current_user)])
api_router.include_router(tags.router, prefix="/tags", tags=["tags"], dependencies=[Depends(deps.get_current_user)])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"],
                          dependencies=[Depends(deps.get_current_user)])
api_router.include_router(users.router, prefix="/users", tags=["users"], dependencies=[Depends(deps.get_current_user)])
api_router.include_router(backup.router, prefix="/backup", tags=["backup"],
                          dependencies=[Depends(deps.get_current_user)])
