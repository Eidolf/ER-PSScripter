import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api import deps
from app.models.knowledge import KnowledgeEntity, KnowledgeSource
from app.schemas.knowledge import (
    KnowledgeEntityCreate,
    KnowledgeEntityResponse,
    KnowledgeRelationCreate,
    KnowledgeRelationResponse,
    KnowledgeSearchResult,
    KnowledgeSourceCreate,
    KnowledgeSourceResponse,
    KnowledgeSourceUpdate,
    RepositoryHealthMetrics,
)
from app.services.knowledge_retrieval import knowledge_retrieval_service
from app.services.knowledge_seeder import seed_powershell_knowledge_base
from app.services.knowledge_service import knowledge_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/metrics", response_model=RepositoryHealthMetrics)
def get_repository_metrics(db: Session = Depends(deps.get_db)) -> Any:
    """Return comprehensive PowerShell knowledge health and coverage metrics."""
    # Ensure seed knowledge is populated if table is empty
    count = db.query(KnowledgeEntity).count()
    if count == 0:
        seed_powershell_knowledge_base(db)
    return knowledge_service.compute_health_metrics(db)


@router.get("/entities", response_model=list[KnowledgeEntityResponse])
def list_knowledge_entities(
    category: str | None = Query(None),
    module_name: str | None = Query(None),
    source_type: str | None = Query(None),
    query: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(deps.get_db),
) -> Any:
    """List or search indexed PowerShell knowledge entities."""
    # Lazy seed if empty
    if db.query(KnowledgeEntity).count() == 0:
        seed_powershell_knowledge_base(db)
    return knowledge_service.list_entities(
        db, category=category, module_name=module_name, source_type=source_type, query=query, skip=skip, limit=limit
    )


@router.get("/entities/{entity_id}", response_model=KnowledgeEntityResponse)
def get_knowledge_entity(
    entity_id: int,
    db: Session = Depends(deps.get_db),
) -> Any:
    """Retrieve deep dive view for a specific knowledge entity."""
    entity = knowledge_service.get_entity_by_id(db, entity_id)
    if not entity:
        raise HTTPException(status_code=404, detail="Knowledge entity not found")
    return entity


@router.post("/entities", response_model=KnowledgeEntityResponse)
def create_knowledge_entity(
    entity_in: KnowledgeEntityCreate,
    db: Session = Depends(deps.get_db),
) -> Any:
    """Create or merge a PowerShell knowledge entity."""
    return knowledge_service.upsert_entity(db, entity_in)


@router.get("/graph", response_model=dict[str, Any])
def get_knowledge_graph(
    center_id: int | None = Query(None),
    db: Session = Depends(deps.get_db),
) -> Any:
    """Retrieve interactive nodes and edges for knowledge graph visualization."""
    if db.query(KnowledgeEntity).count() == 0:
        seed_powershell_knowledge_base(db)
    return knowledge_service.get_relationship_graph(db, center_entity_id=center_id)


@router.post("/relations", response_model=KnowledgeRelationResponse)
def create_knowledge_relation(
    relation_in: KnowledgeRelationCreate,
    db: Session = Depends(deps.get_db),
) -> Any:
    """Create a relationship edge between two knowledge entities."""
    return knowledge_service.add_relation(db, relation_in)


@router.get("/sources", response_model=list[KnowledgeSourceResponse])
def list_knowledge_sources(db: Session = Depends(deps.get_db)) -> Any:
    """List all registered knowledge sources (Microsoft Learn, GitHub, PSGallery, etc.)."""
    if db.query(KnowledgeSource).count() == 0:
        seed_powershell_knowledge_base(db)
    sources = db.query(KnowledgeSource).order_by(KnowledgeSource.trust_level.desc()).all()
    res = []
    for s in sources:
        cnt = db.query(KnowledgeEntity).filter(KnowledgeEntity.source_id == s.id).count()
        item = KnowledgeSourceResponse(
            id=s.id,
            name=s.name,
            source_type=s.source_type,
            url=s.url,
            trust_level=s.trust_level,
            is_active=s.is_active,
            auto_refresh=s.auto_refresh,
            refresh_frequency_hours=s.refresh_frequency_hours,
            last_crawled_at=s.last_crawled_at,
            created_at=s.created_at,
            updated_at=s.updated_at,
            entity_count=cnt,
        )
        res.append(item)
    return res


@router.post("/sources", response_model=KnowledgeSourceResponse)
def create_knowledge_source(
    source_in: KnowledgeSourceCreate,
    db: Session = Depends(deps.get_db),
) -> Any:
    """Register a new knowledge source for crawling and indexing."""
    s = knowledge_service.get_or_create_source(db, source_in)
    return KnowledgeSourceResponse(
        id=s.id,
        name=s.name,
        source_type=s.source_type,
        url=s.url,
        trust_level=s.trust_level,
        is_active=s.is_active,
        auto_refresh=s.auto_refresh,
        refresh_frequency_hours=s.refresh_frequency_hours,
        last_crawled_at=s.last_crawled_at,
        created_at=s.created_at,
        updated_at=s.updated_at,
        entity_count=0,
    )


@router.put("/sources/{source_id}", response_model=KnowledgeSourceResponse)
def update_knowledge_source(
    source_id: int,
    source_in: KnowledgeSourceUpdate,
    db: Session = Depends(deps.get_db),
) -> Any:
    """Update details of an existing knowledge source (name, url, trust_level, etc.)."""
    source = db.query(KnowledgeSource).filter(KnowledgeSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Knowledge source not found")

    update_data = source_in.model_dump(exclude_unset=True)
    if "name" in update_data and update_data["name"] is not None:
        conflict = (
            db.query(KnowledgeSource)
            .filter(
                KnowledgeSource.name == update_data["name"],
                KnowledgeSource.id != source_id,
            )
            .first()
        )
        if conflict:
            raise HTTPException(
                status_code=400,
                detail=f"Knowledge source with name '{update_data['name']}' already exists.",
            )

    for field, val in update_data.items():
        setattr(source, field, val)

    db.add(source)
    db.commit()
    db.refresh(source)

    cnt = db.query(KnowledgeEntity).filter(KnowledgeEntity.source_id == source.id).count()
    return KnowledgeSourceResponse(
        id=source.id,
        name=source.name,
        source_type=source.source_type,
        url=source.url,
        trust_level=source.trust_level,
        is_active=source.is_active,
        auto_refresh=source.auto_refresh,
        refresh_frequency_hours=source.refresh_frequency_hours,
        last_crawled_at=source.last_crawled_at,
        created_at=source.created_at,
        updated_at=source.updated_at,
        entity_count=cnt,
    )


@router.delete("/sources/{source_id}", response_model=dict[str, Any])
def delete_knowledge_source(
    source_id: int,
    db: Session = Depends(deps.get_db),
) -> Any:
    """Delete a registered knowledge source. Associated entities will have source_id set to null."""
    source = db.query(KnowledgeSource).filter(KnowledgeSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Knowledge source not found")

    # Unlink any entities referencing this source to preserve knowledge while detaching origin
    db.query(KnowledgeEntity).filter(KnowledgeEntity.source_id == source_id).update(
        {KnowledgeEntity.source_id: None}
    )
    db.delete(source)
    db.commit()

    return {"status": "success", "message": f"Source '{source.name}' deleted successfully."}


@router.get("/search", response_model=list[KnowledgeSearchResult])
async def search_knowledge(
    q: str = Query(..., min_length=2),
    limit: int = Query(10, ge=1, le=50),
    min_trust: float = Query(0.0, ge=0.0, le=1.0),
    db: Session = Depends(deps.get_db),
) -> Any:
    """Perform hybrid search (exact, keyword, and vector) against authoritative knowledge entities."""
    if db.query(KnowledgeEntity).count() == 0:
        seed_powershell_knowledge_base(db)
    return await knowledge_retrieval_service.retrieve_knowledge_for_prompt(
        db, prompt=q, limit=limit, min_trust=min_trust
    )


@router.post("/seed", response_model=dict[str, str])
def trigger_seed(db: Session = Depends(deps.get_db)) -> Any:
    """Manually trigger or update seed knowledge."""
    seed_powershell_knowledge_base(db)
    return {"status": "success", "message": "Authoritative PowerShell knowledge base seeded."}


@router.get("/crawler/status", response_model=dict[str, Any])
async def get_crawler_status() -> Any:
    """Return live status of the documentation crawler."""
    from app.services.knowledge_crawler import crawler_manager

    return crawler_manager.get_status()


@router.post("/sources/{source_id}/crawl", response_model=dict[str, Any])
async def trigger_source_crawl(
    source_id: int,
) -> Any:
    """Trigger an on-demand crawl on a specific knowledge source in the background."""
    from app.services.knowledge_crawler import crawler_manager

    return crawler_manager.start_single_crawl(source_id)


@router.post("/crawler/start-continuous", response_model=dict[str, Any])
async def start_continuous_crawl() -> Any:
    """Start continuous 24/7 background ingestion of all active knowledge sources."""
    from app.services.knowledge_crawler import crawler_manager

    return crawler_manager.start_continuous()


@router.post("/crawler/stop", response_model=dict[str, Any])
async def stop_active_crawl() -> Any:
    """Stop/cancel any currently running documentation crawl."""
    from app.services.knowledge_crawler import crawler_manager

    return crawler_manager.stop_crawl()

