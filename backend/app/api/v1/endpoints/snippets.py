import logging
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile, Query
from sqlalchemy.orm import Session

from app.api import deps
from app.models.snippet import Snippet
from app.schemas.snippet import SnippetCreate, SnippetResponse, SnippetUpdate
from app.schemas.analysis import SnippetAnalysisResult
from app.services.embedding_service import embedding_service
from app.services.script_analyzer import ScriptAnalyzerService

logger = logging.getLogger(__name__)

router = APIRouter()
analyzer = ScriptAnalyzerService()

@router.post("/analyze/upload", response_model=list[SnippetAnalysisResult])
async def analyze_upload(
    files: list[UploadFile],
    split_functions: bool = Query(False, description="Whether to split script into functions"),
    db: Session = Depends(deps.get_db)
) -> Any:
    """
    Analyze uploaded files for PowerShell content.
    """
    snippets = []
    for file in files:
        if not file.filename.lower().endswith(".ps1"):
            continue
            
        content_bytes = await file.read()
        try:
            content = content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            # Fallback for other encodings if needed
            content = content_bytes.decode("latin-1")
            
        extracted = analyzer.analyze_content(content, file.filename, split_functions)
        snippets.extend(extracted)
    
    # Fetch existing hashes to mark duplicates
    existing_hashes = {r[0] for r in db.query(Snippet.content_hash).filter(Snippet.content_hash.isnot(None)).all()}
    
    results = []
    for s in snippets:
        res = SnippetAnalysisResult(**s.model_dump())
        if s.content_hash and s.content_hash in existing_hashes:
            res.is_duplicate = True
        results.append(res)
        
    return results

@router.post("/analyze", response_model=list[SnippetAnalysisResult])
def analyze_folder(
    folder_path: str,
    db: Session = Depends(deps.get_db)
) -> Any:
    """
    Analyze a folder for PowerShell scripts and return detected snippets.
    Does not save automatically, purely returns found candidates.
    Checks for duplicates based on content hash.
    """
    snippets = analyzer.analyze_folder(folder_path)
    
    # Fetch existing hashes to mark duplicates
    existing_hashes = {r[0] for r in db.query(Snippet.content_hash).filter(Snippet.content_hash.isnot(None)).all()}
    
    results = []
    for s in snippets:
        # Convert to AnalysisResult and flag duplicates
        res = SnippetAnalysisResult(**s.model_dump())
        if s.content_hash and s.content_hash in existing_hashes:
            res.is_duplicate = True
        results.append(res)
        
    return results

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
async def create_snippet(
    *,
    db: Session = Depends(deps.get_db),
    snippet_in: SnippetCreate
) -> Any:
    """
    Create a new snippet.
    """
    # Auto-detect PowerShell function
    if re.search(r'^\s*function\s+[\w-]+\s*\{', snippet_in.content, re.IGNORECASE | re.MULTILINE):
        if snippet_in.tags is None:
            snippet_in.tags = []
        if "#function" not in snippet_in.tags:
            snippet_in.tags.append("#function")

    if not snippet_in.content_hash:
        # Compute if not provided
        import hashlib
        snippet_in.content_hash = hashlib.sha256(snippet_in.content.encode('utf-8')).hexdigest()

    snippet = Snippet(
        name=snippet_in.name,
        description=snippet_in.description,
        content=snippet_in.content,
        tags=snippet_in.tags,
        category=snippet_in.category,
        source=snippet_in.source,
        project_id=snippet_in.project_id,
        relative_path=snippet_in.relative_path,
        content_hash=snippet_in.content_hash
    )

    try:
        # Generate embedding for the new snippet
        # Combine relevant fields for semantic search
        text_to_embed = f"{snippet_in.name}\n{snippet_in.description or ''}\n{snippet_in.content}"
        # Limit text length if necessary, but OpenAI handles up to 8k tokens.
        embedding = await embedding_service.generate_embedding(text_to_embed, db)
        snippet.embedding = embedding
    except Exception as e:
        logger.error(f"Failed to generate embedding for snippet {snippet_in.name}: {e}")
        # We proceed without embedding rather than failing the creation

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
async def update_snippet(
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
        
    # Auto-detect function in content update
    if snippet_in.content is not None and re.search(
        r"^\s*function\s+[\w-]+\s*\{", snippet_in.content, re.IGNORECASE | re.MULTILINE
    ):
            # Update tags if provided, else append to existing
            if snippet_in.tags is not None:
                 if "#function" not in snippet_in.tags:
                    snippet_in.tags.append("#function")
            else:
                 # If tags are not in the update payload, we modify the object before model_dump?
                 # No, model_dump uses snippet_in. 
                # We can just update the snippet object logic below or modify snippet_in.tags here
                # but snippets_in.tags is optional.
                # Let's manually ensure the tag is added to the snippet object later if strictly needed,
                # but simpler is to force it into the update_data later?
                 # Actually, let's just modify the DB object tags if needed.
                 current_tags = list(snippet.tags) if snippet.tags else []
                 if "#function" not in current_tags:
                     current_tags.append("#function")
                     # We must pass this to the update loop essentially.
                     # But the loop iterates update_data.
                     # Let's inject into snippet_in to be safe? 
                     # snippet_in.tags = current_tags -> this works if snippet_in allows it.
                     snippet_in.tags = current_tags

    update_data = snippet_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(snippet, field, value)

    # Regenerate embedding if content/metadata changed
    if any(k in update_data for k in ["name", "description", "content"]):
        try:
            text_to_embed = f"{snippet.name}\n{snippet.description or ''}\n{snippet.content}"
            embedding = await embedding_service.generate_embedding(text_to_embed, db)
            snippet.embedding = embedding
        except Exception as e:
            logger.error(f"Failed to update embedding for snippet {id}: {e}")

        
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

@router.post("/{id}/index", response_model=SnippetResponse)
async def index_snippet(
    *,
    db: Session = Depends(deps.get_db),
    id: int
) -> Any:
    """
    Manually trigger embedding generation for a snippet.
    """
    snippet = db.query(Snippet).filter(Snippet.id == id).first()
    if not snippet:
        raise HTTPException(status_code=404, detail="Snippet not found")
        
    try:
        text_to_embed = f"{snippet.name}\n{snippet.description or ''}\n{snippet.content}"
        embedding = await embedding_service.generate_embedding(text_to_embed, db)
        snippet.embedding = embedding
        db.add(snippet)
        db.commit()
        db.refresh(snippet)
    except Exception as e:
        logger.error(f"Failed to generate embedding for snippet {id}: {e}")
        raise HTTPException(status_code=500, detail=f"Indexing failed: {str(e)}") from e
        
    return snippet
