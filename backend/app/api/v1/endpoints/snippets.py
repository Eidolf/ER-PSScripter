from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.models.snippet import Snippet
from app.schemas.snippet import SnippetCreate, SnippetResponse, SnippetUpdate
from app.services.script_analyzer import ScriptAnalyzerService

router = APIRouter()
analyzer = ScriptAnalyzerService()

@router.post("/analyze", response_model=list[SnippetCreate])
def analyze_folder(
    folder_path: str,
    db: Session = Depends(deps.get_db)
) -> Any:
    """
    Analyze a folder for PowerShell scripts and return detected snippets.
    Does not save automatically, purely returns found candidates.
    """
    snippets = analyzer.analyze_folder(folder_path)
    snippets = analyzer.analyze_folder(folder_path)
    return snippets

@router.get("/tags", response_model=list[str])
def get_unique_tags(
    db: Session = Depends(deps.get_db)
) -> Any:
    """
    Get all unique tags used across snippets.
    """
    # Fetch all tags. Since tags are stored as JSON array, we might need to fetch all and aggregate in python 
    # or use specific SQL if supported. For SQLite/JSON, it's safer to fetch and process if dataset is small,
    # or use func.json_each if we want to be fancy but let's stick to simple first.
    snippets = db.query(Snippet.tags).all()
    unique_tags = set()
    for s in snippets:
        if s.tags:
            for tag in s.tags:
                unique_tags.add(tag)
    return sorted(list(unique_tags))

@router.get("/", response_model=list[SnippetResponse])
def list_snippets(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(deps.get_db)
) -> Any:
    """
    Retrieve all snippets.
    """
    snippets = db.query(Snippet).offset(skip).limit(limit).all()
    return snippets

@router.post("/", response_model=SnippetResponse)
def create_snippet(
    *,
    db: Session = Depends(deps.get_db),
    snippet_in: SnippetCreate
) -> Any:
    """
    Create a new snippet.
    """
    snippet = Snippet(
        name=snippet_in.name,
        description=snippet_in.description,
        content=snippet_in.content,
        tags=snippet_in.tags,
        category=snippet_in.category,
        source=snippet_in.source
    )
    db.add(snippet)
    db.commit()
    db.refresh(snippet)
    return snippet

@router.get("/{id}", response_model=SnippetResponse)
def get_snippet(
    *,
    db: Session = Depends(deps.get_db),
    id: int
) -> Any:
    """
    Get snippet by ID.
    """
    snippet = db.query(Snippet).filter(Snippet.id == id).first()
    if not snippet:
        raise HTTPException(status_code=404, detail="Snippet not found")
    return snippet

@router.put("/{id}", response_model=SnippetResponse)
def update_snippet(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    snippet_in: SnippetUpdate
) -> Any:
    """
    Update a snippet.
    """
    snippet = db.query(Snippet).filter(Snippet.id == id).first()
    if not snippet:
        raise HTTPException(status_code=404, detail="Snippet not found")
    
    update_data = snippet_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(snippet, field, value)
        
    db.add(snippet)
    db.commit()
    db.refresh(snippet)
    return snippet

@router.delete("/{id}", response_model=SnippetResponse)
def delete_snippet(
    *,
    db: Session = Depends(deps.get_db),
    id: int
) -> Any:
    """
    Delete a snippet.
    """
    snippet = db.query(Snippet).filter(Snippet.id == id).first()
    if not snippet:
        raise HTTPException(status_code=404, detail="Snippet not found")
    db.delete(snippet)
    db.commit()
    return snippet
