import datetime
import hashlib
import json
import logging
import re
from typing import Any, Optional
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.knowledge import KnowledgeEntity, KnowledgeRelation, KnowledgeSource
from app.models.snippet import Snippet
from app.schemas.knowledge import (
    KnowledgeEntityCreate,
    KnowledgeEntityUpdate,
    KnowledgeRelationCreate,
    KnowledgeSourceCreate,
    RepositoryHealthMetrics,
)

logger = logging.getLogger(__name__)


class KnowledgeService:
    @staticmethod
    def compute_content_hash(canonical_name: str, structured_details: dict[str, Any]) -> str:
        serialized = json.dumps({"name": canonical_name.lower(), "details": structured_details}, sort_keys=True)
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    def get_or_create_source(self, db: Session, source_in: KnowledgeSourceCreate) -> KnowledgeSource:
        source = db.query(KnowledgeSource).filter(KnowledgeSource.name == source_in.name).first()
        if not source:
            source = KnowledgeSource(
                name=source_in.name,
                source_type=source_in.source_type,
                url=source_in.url,
                trust_level=source_in.trust_level,
                is_active=source_in.is_active,
                auto_refresh=source_in.auto_refresh,
                refresh_frequency_hours=source_in.refresh_frequency_hours,
            )
            db.add(source)
            db.commit()
            db.refresh(source)
        return source

    def upsert_entity(self, db: Session, entity_in: KnowledgeEntityCreate) -> KnowledgeEntity:
        content_hash = self.compute_content_hash(entity_in.canonical_name, entity_in.structured_details)
        
        # Check for existing canonical entity in the same category
        existing = db.query(KnowledgeEntity).filter(
            func.lower(KnowledgeEntity.canonical_name) == entity_in.canonical_name.lower(),
            KnowledgeEntity.category == entity_in.category
        ).first()

        if existing:
            # Merging strategy: Official Microsoft sources take precedence. Higher trust updates details.
            if entity_in.trust_level >= existing.trust_level:
                existing.description = entity_in.description or existing.description
                existing.source_url = entity_in.source_url or existing.source_url
                existing.source_type = entity_in.source_type
                existing.trust_level = max(existing.trust_level, entity_in.trust_level)
                existing.confidence_score = max(existing.confidence_score, entity_in.confidence_score)
                existing.ps_edition = entity_in.ps_edition or existing.ps_edition
                existing.min_ps_version = entity_in.min_ps_version or existing.min_ps_version
                existing.module_name = entity_in.module_name or existing.module_name
                
                # Merge structured details
                merged_details = dict(existing.structured_details or {})
                merged_details.update(entity_in.structured_details or {})
                existing.structured_details = merged_details

            # Combine tags uniquely
            current_tags = set(existing.tags or [])
            current_tags.update(entity_in.tags or [])
            existing.tags = list(current_tags)
            existing.content_hash = content_hash
            existing.date_updated = datetime.datetime.utcnow()

            db.commit()
            db.refresh(existing)
            return existing

        new_entity = KnowledgeEntity(
            canonical_name=entity_in.canonical_name,
            category=entity_in.category,
            description=entity_in.description,
            tags=entity_in.tags,
            source_id=entity_in.source_id,
            source_url=entity_in.source_url,
            source_type=entity_in.source_type,
            ps_edition=entity_in.ps_edition,
            min_ps_version=entity_in.min_ps_version,
            module_name=entity_in.module_name,
            trust_level=entity_in.trust_level,
            confidence_score=entity_in.confidence_score,
            structured_details=entity_in.structured_details,
            content_hash=content_hash,
        )
        db.add(new_entity)
        db.commit()
        db.refresh(new_entity)
        return new_entity

    def add_relation(self, db: Session, relation_in: KnowledgeRelationCreate) -> KnowledgeRelation:
        existing = db.query(KnowledgeRelation).filter(
            KnowledgeRelation.from_entity_id == relation_in.from_entity_id,
            KnowledgeRelation.to_entity_id == relation_in.to_entity_id,
            KnowledgeRelation.relation_type == relation_in.relation_type
        ).first()

        if existing:
            existing.confidence = max(existing.confidence, relation_in.confidence)
            existing.description = relation_in.description or existing.description
            db.commit()
            db.refresh(existing)
            return existing

        rel = KnowledgeRelation(
            from_entity_id=relation_in.from_entity_id,
            to_entity_id=relation_in.to_entity_id,
            relation_type=relation_in.relation_type,
            description=relation_in.description,
            confidence=relation_in.confidence,
        )
        db.add(rel)
        db.commit()
        db.refresh(rel)
        return rel

    def get_entity_by_id(self, db: Session, entity_id: int) -> Optional[KnowledgeEntity]:
        return db.query(KnowledgeEntity).filter(KnowledgeEntity.id == entity_id).first()

    def list_entities(
        self,
        db: Session,
        category: Optional[str] = None,
        module_name: Optional[str] = None,
        source_type: Optional[str] = None,
        query: Optional[str] = None,
        skip: int = 0,
        limit: int = 50
    ) -> list[KnowledgeEntity]:
        stmt = db.query(KnowledgeEntity)
        if category:
            stmt = stmt.filter(KnowledgeEntity.category == category)
        if module_name:
            stmt = stmt.filter(KnowledgeEntity.module_name == module_name)
        if source_type:
            stmt = stmt.filter(KnowledgeEntity.source_type == source_type)
        if query:
            q_like = f"%{query}%"
            stmt = stmt.filter(
                or_(
                    KnowledgeEntity.canonical_name.ilike(q_like),
                    KnowledgeEntity.description.ilike(q_like)
                )
            )
        # Order by trust level descending then canonical name
        return stmt.order_by(KnowledgeEntity.trust_level.desc(), KnowledgeEntity.canonical_name.asc()).offset(skip).limit(limit).all()

    def get_relationship_graph(self, db: Session, center_entity_id: Optional[int] = None, depth: int = 1) -> dict[str, Any]:
        nodes: dict[int, dict[str, Any]] = {}
        edges: list[dict[str, Any]] = []

        if center_entity_id:
            center = db.query(KnowledgeEntity).filter(KnowledgeEntity.id == center_entity_id).first()
            if not center:
                return {"nodes": [], "edges": []}
            nodes[center.id] = {
                "id": center.id,
                "label": center.canonical_name,
                "category": center.category,
                "module": center.module_name,
                "trust": center.trust_level
            }
            # Fetch connected relations
            outgoing = db.query(KnowledgeRelation).filter(KnowledgeRelation.from_entity_id == center.id).all()
            for r in outgoing:
                to_ent = db.query(KnowledgeEntity).filter(KnowledgeEntity.id == r.to_entity_id).first()
                if to_ent:
                    nodes[to_ent.id] = {
                        "id": to_ent.id,
                        "label": to_ent.canonical_name,
                        "category": to_ent.category,
                        "module": to_ent.module_name,
                        "trust": to_ent.trust_level
                    }
                    edges.append({
                        "id": r.id,
                        "source": r.from_entity_id,
                        "target": r.to_entity_id,
                        "relation": r.relation_type,
                        "confidence": r.confidence
                    })

            incoming = db.query(KnowledgeRelation).filter(KnowledgeRelation.to_entity_id == center.id).all()
            for r in incoming:
                from_ent = db.query(KnowledgeEntity).filter(KnowledgeEntity.id == r.from_entity_id).first()
                if from_ent:
                    nodes[from_ent.id] = {
                        "id": from_ent.id,
                        "label": from_ent.canonical_name,
                        "category": from_ent.category,
                        "module": from_ent.module_name,
                        "trust": from_ent.trust_level
                    }
                    edges.append({
                        "id": r.id,
                        "source": r.from_entity_id,
                        "target": r.to_entity_id,
                        "relation": r.relation_type,
                        "confidence": r.confidence
                    })
        else:
            # Top 100 relations for global graph overview
            top_relations = db.query(KnowledgeRelation).limit(100).all()
            for r in top_relations:
                edges.append({
                    "id": r.id,
                    "source": r.from_entity_id,
                    "target": r.to_entity_id,
                    "relation": r.relation_type,
                    "confidence": r.confidence
                })
                for ent_id in (r.from_entity_id, r.to_entity_id):
                    if ent_id not in nodes:
                        ent = db.query(KnowledgeEntity).filter(KnowledgeEntity.id == ent_id).first()
                        if ent:
                            nodes[ent.id] = {
                                "id": ent.id,
                                "label": ent.canonical_name,
                                "category": ent.category,
                                "module": ent.module_name,
                                "trust": ent.trust_level
                            }

        return {"nodes": list(nodes.values()), "edges": edges}

    def compute_health_metrics(self, db: Session) -> RepositoryHealthMetrics:
        total_entities = db.query(func.count(KnowledgeEntity.id)).scalar() or 0
        total_sources = db.query(func.count(KnowledgeSource.id)).scalar() or 0
        total_relations = db.query(func.count(KnowledgeRelation.id)).scalar() or 0
        total_snippets = db.query(func.count(Snippet.id)).scalar() or 0

        # Unique modules count
        total_modules = db.query(func.count(func.distinct(KnowledgeEntity.module_name))).filter(
            KnowledgeEntity.module_name.isnot(None)
        ).scalar() or 0

        total_cmdlets = db.query(func.count(KnowledgeEntity.id)).filter(
            KnowledgeEntity.category == "cmdlet"
        ).scalar() or 0

        # Breakdown by category
        cat_counts = db.query(KnowledgeEntity.category, func.count(KnowledgeEntity.id)).group_by(KnowledgeEntity.category).all()
        categories_breakdown = {cat: count for cat, count in cat_counts}

        # Quality & Freshness metrics calculation
        official_count = db.query(func.count(KnowledgeEntity.id)).filter(
            KnowledgeEntity.trust_level >= 0.95
        ).scalar() or 0

        source_quality_score = round((official_count / max(total_entities, 1)) * 100, 1)

        # Freshness: entities updated within last 90 days
        ninety_days_ago = datetime.datetime.utcnow() - datetime.timedelta(days=90)
        fresh_count = db.query(func.count(KnowledgeEntity.id)).filter(
            KnowledgeEntity.date_updated >= ninety_days_ago
        ).scalar() or 0
        repository_freshness_score = round((fresh_count / max(total_entities, 1)) * 100, 1)

        # Documentation coverage: entities having detailed description & structured_details
        documented_count = db.query(func.count(KnowledgeEntity.id)).filter(
            KnowledgeEntity.description.isnot(None),
            func.length(KnowledgeEntity.description) > 30
        ).scalar() or 0
        documentation_coverage_score = round((documented_count / max(total_entities, 1)) * 100, 1)

        # Coverage score combined
        knowledge_coverage_score = round(min(100.0, (total_entities / 250.0) * 100), 1)
        knowledge_utilization_score = round(min(100.0, (total_relations / max(total_entities, 1)) * 50), 1)

        weak_areas: list[str] = []
        if total_cmdlets < 30:
            weak_areas.append("Core cmdlet library coverage is low (< 30 cmdlets indexed)")
        if "security_guidance" not in categories_breakdown or categories_breakdown["security_guidance"] < 5:
            weak_areas.append("PowerShell security & execution policy guidance requires expansion")
        if total_relations < total_entities * 0.5:
            weak_areas.append("Cross-entity relationships are sparse; concept linking recommended")
        if total_modules < 5:
            weak_areas.append("Specialized modules (e.g. Microsoft.Graph, Az, Pester) underrepresented")

        learning_recommendations: list[str] = [
            "Crawl official Microsoft Learn PowerShell core reference documentation",
            "Index Microsoft Graph SDK authentication and permission best practices",
            "Extract CmdletBinding parameter validation attributes from uploaded scripts",
            "Schedule weekly auto-refresh on PowerShellGallery popular module specifications"
        ]

        return RepositoryHealthMetrics(
            total_entities=total_entities,
            total_sources=total_sources,
            total_relations=total_relations,
            total_modules=total_modules,
            total_cmdlets=total_cmdlets,
            total_snippets=total_snippets,
            knowledge_coverage_score=knowledge_coverage_score,
            documentation_coverage_score=documentation_coverage_score,
            repository_freshness_score=repository_freshness_score,
            source_quality_score=source_quality_score,
            knowledge_utilization_score=knowledge_utilization_score,
            categories_breakdown=categories_breakdown,
            weak_areas=weak_areas,
            learning_recommendations=learning_recommendations
        )


knowledge_service = KnowledgeService()
