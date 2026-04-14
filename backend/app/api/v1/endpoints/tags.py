from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api import deps
from app.models.snippet import Snippet

router = APIRouter()

@router.delete("/{tag_name}", response_model=dict)
def delete_tag(
    tag_name: str,
    db: Session = Depends(deps.get_db)
) -> Any:
    """
    Delete a tag from all snippets that have it.
    """
    # Fetch all snippets that might contain the tag
    # Since tags are JSON, we do a client-side filter or simple LIKE query if simple.
    # For robustnes, let's fetch all (or all with non-null tags) and filter in python.
    # A more optimized SQL approach exists but varies by DB (PG vs SQLite).
    
    snippets = db.query(Snippet).all()
    count = 0
    
    for snippet in snippets:
        if snippet.tags and tag_name in snippet.tags:
            # Create new list without the tag
            new_tags = [t for t in snippet.tags if t != tag_name]
            # Detect change
            if len(new_tags) != len(snippet.tags):
                snippet.tags = new_tags
                db.add(snippet)
                count += 1
                
    if count > 0:
        db.commit()
        
    return {"message": f"Tag '{tag_name}' removed from {count} snippets", "updated_count": count}
