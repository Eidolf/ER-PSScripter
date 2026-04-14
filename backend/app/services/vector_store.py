
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.snippet import Snippet


class VectorStore:
    def __init__(self) -> None:
        pass

    async def search_similar_snippets(
        self, 
        session: AsyncSession, 
        query_embedding: list[float], 
        limit: int = 5,
        threshold: float = 0.5  # Optional distance threshold
    ) -> Sequence[Snippet]:
        """
        Finds snippets most similar to the query_embedding.
        Uses L2 distance (Euclidean) via the <-> operator.
        """
        # Note: pgvector supports:
        # <-> L2 distance
        # <=> Cosine distance
        # <#> Inner product
        # OpenAI embeddings are normalized, so Cosine and L2 yield same ranking.
        # But <=> is cosine distance (1 - cosine_similarity).
        
        stmt = (
            select(Snippet)
            .order_by(Snippet.embedding.cosine_distance(query_embedding))
            .limit(limit)
        )
        
        result = await session.execute(stmt)
        return result.scalars().all()

vector_store = VectorStore()
