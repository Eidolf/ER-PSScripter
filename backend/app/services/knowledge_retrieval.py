import logging
import re
from typing import Any
from sqlalchemy.orm import Session

from app.models.knowledge import KnowledgeEntity
from app.schemas.knowledge import KnowledgeSearchResult
from app.services.embedding_service import embedding_service

logger = logging.getLogger(__name__)


class KnowledgeRetrievalService:
    @staticmethod
    def extract_powershell_tokens(query: str) -> list[str]:
        # Extract potential cmdlet-like words (Verb-Noun) or module names
        tokens = re.findall(r"\b[A-Za-z]+-[A-Za-z0-9]+\b|\b[A-Za-z0-9_.]+\b", query)
        return list(set(tokens))

    async def retrieve_knowledge_for_prompt(
        self,
        db: Session,
        prompt: str,
        limit: int = 8,
        min_trust: float = 0.5
    ) -> list[KnowledgeSearchResult]:
        results: dict[int, KnowledgeSearchResult] = {}

        # 1. Exact & Token/Cmdlet Matching (High confidence)
        tokens = self.extract_powershell_tokens(prompt)
        for token in tokens:
            if "-" in token or "." in token:
                matches = db.query(KnowledgeEntity).filter(
                    KnowledgeEntity.canonical_name.ilike(token),
                    KnowledgeEntity.trust_level >= min_trust
                ).all()
                for m in matches:
                    relevance = 1.0 * m.trust_level
                    results[m.id] = KnowledgeSearchResult(
                        entity=m,  # type: ignore
                        relevance_score=relevance,
                        matched_by="exact"
                    )

        # 2. Keyword Search across canonical name & description
        words = [w for w in re.findall(r"\w{3,}", prompt) if w.lower() not in {"the", "and", "for", "with", "script", "powershell"}]
        for word in words[:5]:
            matches = db.query(KnowledgeEntity).filter(
                (KnowledgeEntity.canonical_name.ilike(f"%{word}%")) | (KnowledgeEntity.description.ilike(f"%{word}%")),
                KnowledgeEntity.trust_level >= min_trust
            ).limit(limit).all()
            for m in matches:
                if m.id not in results:
                    score = 0.7 * m.trust_level
                    results[m.id] = KnowledgeSearchResult(
                        entity=m,  # type: ignore
                        relevance_score=score,
                        matched_by="keyword"
                    )

        # 3. Vector Semantic Search using embedding service if available
        try:
            emb = await embedding_service.generate_embedding(prompt, db)
            if emb:
                # pgvector cosine distance: embedding <=> emb
                vector_matches = db.query(
                    KnowledgeEntity,
                    KnowledgeEntity.embedding.cosine_distance(emb).label("distance")
                ).filter(
                    KnowledgeEntity.embedding.isnot(None),
                    KnowledgeEntity.trust_level >= min_trust
                ).order_by("distance").limit(limit).all()

                for m, dist in vector_matches:
                    sim = max(0.0, 1.0 - (dist if dist is not None else 1.0))
                    weighted_sim = sim * m.trust_level
                    if m.id in results:
                        # Blend score
                        results[m.id].relevance_score = max(results[m.id].relevance_score, weighted_sim)
                    else:
                        results[m.id] = KnowledgeSearchResult(
                            entity=m,  # type: ignore
                            relevance_score=weighted_sim,
                            matched_by="vector"
                        )
        except Exception as e:
            logger.warning(f"Vector search skipped or failed during knowledge retrieval: {e}")

        sorted_results = sorted(results.values(), key=lambda r: r.relevance_score, reverse=True)
        return sorted_results[:limit]


knowledge_retrieval_service = KnowledgeRetrievalService()
