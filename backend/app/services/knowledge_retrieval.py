import logging
import re

from sqlalchemy.orm import Session

from app.models.knowledge import KnowledgeEntity
from app.schemas.knowledge import KnowledgeEntityResponse, KnowledgeSearchResult
from app.services.embedding_service import embedding_service

logger = logging.getLogger(__name__)


class KnowledgeRetrievalService:
    @staticmethod
    def extract_powershell_tokens(query: str) -> list[str]:
        # Extract cmdlet-like words (Verb-Noun), PascalCase identifiers, table/module names, or dotted namespaces
        # e.g. DeviceTvmSoftwareVulnerabilities, Connect-MgGraph, Microsoft.Graph.Authentication
        tokens = re.findall(
            r"\b[A-Za-z]+-[A-Za-z0-9]+\b|\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+\b|\b[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+\b",
            query,
        )
        return list(set(tokens))

    async def retrieve_knowledge_for_prompt(
        self, db: Session, prompt: str, limit: int = 8, min_trust: float = 0.5
    ) -> list[KnowledgeSearchResult]:
        results: dict[int, KnowledgeSearchResult] = {}

        # 1. Exact & Token/Cmdlet/PascalCase Table Matching (Highest confidence)
        tokens = self.extract_powershell_tokens(prompt)
        for token in tokens:
            matches = (
                db.query(KnowledgeEntity)
                .filter(
                    (KnowledgeEntity.canonical_name.ilike(token))
                    | (KnowledgeEntity.canonical_name.ilike(f"{token}%")),
                    KnowledgeEntity.trust_level >= min_trust,
                )
                .all()
            )
            for m in matches:
                m_id = int(m.id)  # type: ignore[arg-type]
                m_trust = float(m.trust_level)  # type: ignore[arg-type]
                relevance = 1.0 * m_trust
                results[m_id] = KnowledgeSearchResult(
                    entity=KnowledgeEntityResponse.model_validate(m),
                    relevance_score=relevance,
                    matched_by="exact",
                )

        # 2. Comprehensive Keyword & Technical Term Search
        stopwords = {
            # English common stopwords
            "the", "and", "for", "with", "script", "powershell", "this", "that", "from",
            "are", "was", "have", "has", "can", "could", "should", "would", "about",
            # German common stopwords
            "der", "die", "das", "und", "für", "mit", "skript", "nach", "von",
            "eine", "einer", "eines", "einem", "einen", "erweitere", "mein", "bisheriges",
            "bitte", "erstelle", "zeige", "kannst", "frage", "aktuell", "diese", "dieses",
            "wichtig", "behalte", "anhand", "sofern", "über", "uber", "falls",
        }

        # Extract words with 4+ characters, filter out stopwords
        raw_words = [
            w for w in re.findall(r"\b[A-Za-z0-9_-]{4,}\b", prompt)
            if w.lower() not in stopwords
        ]
        # Preserve uniqueness while maintaining order
        unique_words: list[str] = list(dict.fromkeys(raw_words))

        # Query up to 15 relevant domain keywords across the full prompt text
        for word in unique_words[:15]:
            matches = (
                db.query(KnowledgeEntity)
                .filter(
                    (KnowledgeEntity.canonical_name.ilike(f"%{word}%"))
                    | (KnowledgeEntity.description.ilike(f"%{word}%")),
                    KnowledgeEntity.trust_level >= min_trust,
                )
                .limit(limit)
                .all()
            )
            for m in matches:
                m_id = int(m.id)  # type: ignore[arg-type]
                if m_id not in results:
                    m_trust = float(m.trust_level)  # type: ignore[arg-type]
                    score = 0.75 * m_trust
                    results[m_id] = KnowledgeSearchResult(
                        entity=KnowledgeEntityResponse.model_validate(m),
                        relevance_score=score,
                        matched_by="keyword",
                    )

        # 3. Vector Semantic Search using embedding service if available
        try:
            emb = await embedding_service.generate_embedding(prompt, db)
            if emb:
                # pgvector cosine distance: embedding <=> emb
                vector_matches = (
                    db.query(KnowledgeEntity, KnowledgeEntity.embedding.cosine_distance(emb).label("distance"))
                    .filter(KnowledgeEntity.embedding.isnot(None), KnowledgeEntity.trust_level >= min_trust)
                    .order_by("distance")
                    .limit(limit)
                    .all()
                )

                for m, dist in vector_matches:
                    sim = max(0.0, 1.0 - (float(dist) if dist is not None else 1.0))
                    m_trust = float(m.trust_level)
                    weighted_sim = sim * m_trust
                    m_id = int(m.id)
                    if m_id in results:
                        # Blend score
                        results[m_id].relevance_score = max(results[m_id].relevance_score, weighted_sim)
                    else:
                        results[m_id] = KnowledgeSearchResult(
                            entity=KnowledgeEntityResponse.model_validate(m),
                            relevance_score=weighted_sim,
                            matched_by="vector",
                        )

        except Exception as e:
            logger.warning(f"Vector search skipped or failed during knowledge retrieval: {e}")

        sorted_results = sorted(results.values(), key=lambda r: r.relevance_score, reverse=True)
        return sorted_results[:limit]


knowledge_retrieval_service = KnowledgeRetrievalService()
