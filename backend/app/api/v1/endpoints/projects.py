from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.models.project import Project
from app.models.snippet import Snippet
from app.models.user import User
from app.schemas.project import Project as ProjectSchema
from app.schemas.project import ProjectCreate, ProjectFile, ProjectFolder, ProjectUpdate

router = APIRouter()


@router.get("/", response_model=list[ProjectSchema])
def read_projects(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve projects.
    """
    projects = db.query(Project).offset(skip).limit(limit).all()
    return projects


@router.post("/", response_model=ProjectSchema)
def create_project(
    *,
    db: Session = Depends(deps.get_db),
    project_in: ProjectCreate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Create new project.
    """
    db_project = Project(
        name=project_in.name,
        description=project_in.description,
        user_id=current_user.id
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project


@router.get("/{project_id}", response_model=ProjectSchema)
def read_project(
    *,
    db: Session = Depends(deps.get_db),
    project_id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get project by ID.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/{project_id}", response_model=ProjectSchema)
def update_project(
    *,
    db: Session = Depends(deps.get_db),
    project_id: int,
    project_in: ProjectUpdate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Update project.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    for field, value in project_in.dict(exclude_unset=True).items():
        setattr(project, field, value)
    
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", response_model=ProjectSchema)
def delete_project(
    *,
    db: Session = Depends(deps.get_db),
    project_id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete project.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    db.delete(project)
    db.commit()
    return project


@router.get("/{project_id}/structure", response_model=ProjectFolder)
def get_project_structure(
    *,
    db: Session = Depends(deps.get_db),
    project_id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get project file structure as a tree.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Build tree from snippets
    root = ProjectFolder(name=project.name)
    snippets = db.query(Snippet).filter(Snippet.project_id == project_id).all()
    
    for snippet in snippets:
        if not snippet.relative_path:
             # Treat as root file if no path
             root.files.append(ProjectFile(name=snippet.name, snippet_id=snippet.id))
             continue

        # Simple path parsing
        parts = snippet.relative_path.strip("/").split("/")
        current_folder = root
        
        # Traverse/Create folders
        for part in parts[:-1]: # All but last are folders
            found = False
            for folder in current_folder.folders:
                if folder.name == part:
                    current_folder = folder
                    found = True
                    break
            
            if not found:
                new_folder = ProjectFolder(name=part)
                current_folder.folders.append(new_folder)
                current_folder = new_folder
        
        # Add file to last folder
        filename = parts[-1] if parts else snippet.name
        current_folder.files.append(ProjectFile(name=filename, snippet_id=snippet.id))
            
    return root


@router.delete("/{project_id}/folder", response_model=dict)
def delete_project_folder(
    *,
    db: Session = Depends(deps.get_db),
    project_id: int,
    folder_path: str,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete a folder and all its contents recursively.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Normalize path to ensure it matches how we store relative_path
    # folder_path "src" -> remove items with relative_path starting with "src/"
    # or equal to "src" (if it's a single file treated as folder, but unlikely here)
    
    # We need to find all snippets that are 'under' this folder.
    # relative_path stores "Folder/Sub/File.ps1"
    
    prefix = folder_path.strip("/")
    if not prefix:
         raise HTTPException(status_code=400, detail="Cannot delete root via this endpoint")

    snippets_to_delete = db.query(Snippet).filter(
        Snippet.project_id == project_id,
        (Snippet.relative_path.like(f"{prefix}/%")) | (Snippet.relative_path == prefix)
    ).all()

    count = len(snippets_to_delete)
    for snip in snippets_to_delete:
        db.delete(snip)
    
    db.commit()
    return {"message": f"Deleted {count} items under {prefix}"}
