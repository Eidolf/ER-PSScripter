import contextlib
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api import deps
from app.models.project import Project
from app.models.setting import SystemSetting
from app.models.snippet import Snippet
from app.models.user import User
from app.schemas.backup import BackupData

router = APIRouter()

@router.get("/export", response_model=BackupData)
def export_backup(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Export full system state (Users, Settings, Projects, Snippets).
    """
    if not current_user.is_active:
         raise HTTPException(status_code=400, detail="Inactive user")

    users = db.query(User).all()
    settings = db.query(SystemSetting).all()
    projects = db.query(Project).all()
    snippets = db.query(Snippet).all()

    return {
        "version": "1.0",
        "timestamp": datetime.utcnow().isoformat(),
        "users": users,
        "settings": settings,
        "projects": projects,
        "snippets": snippets
    }

@router.post("/import")
def import_backup(
    backup_data: BackupData,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Import system state. Merges data (upsert based on ID).
    """
    try:
        # Users
        for u in backup_data.users:
            user_obj = User(**u.model_dump())
            db.merge(user_obj)
            
        # Settings
        for s in backup_data.settings:
            setting_obj = SystemSetting(**s.model_dump())
            db.merge(setting_obj)
            
        # Projects
        for p in backup_data.projects:
            project_obj = Project(**p.model_dump())
            db.merge(project_obj)
            
        # Snippets
        for sn in backup_data.snippets:
            data = sn.model_dump(exclude={'has_embedding'})
            snippet_obj = Snippet(**data)
            db.merge(snippet_obj)
            
        db.commit()
        
        # Reset sequences (Postgres specific)
        with contextlib.suppress(Exception):
           db.execute(text(
               "SELECT setval(pg_get_serial_sequence('\"user\"', 'id'), "
               "coalesce(max(id),0) + 1, false) FROM \"user\";"
           ))
           db.execute(text(
               "SELECT setval(pg_get_serial_sequence('project', 'id'), "
               "coalesce(max(id),0) + 1, false) FROM project;"
           ))
           db.execute(text(
               "SELECT setval(pg_get_serial_sequence('snippet', 'id'), "
               "coalesce(max(id),0) + 1, false) FROM snippet;"
           ))
           db.commit()

        return {"status": "success", "counts": {
            "users": len(backup_data.users),
            "settings": len(backup_data.settings),
            "projects": len(backup_data.projects),
            "snippets": len(backup_data.snippets)
        }}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e)) from e
