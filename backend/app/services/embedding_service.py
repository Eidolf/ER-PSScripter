import logging
from typing import Any, cast

from openai import AsyncAzureOpenAI, AsyncOpenAI
from sqlalchemy.orm import Session

from app.models.setting import SystemSetting

# Optional import for local embeddings to avoid heavy load if not used? 
# For now global is fine, it caches model lazy.
try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    SentenceTransformer = None

logger = logging.getLogger(__name__)

class EmbeddingService:
    def __init__(self) -> None:
        self.model = "text-embedding-3-small"
        self._local_model: Any = None

    def _get_local_model(self) -> Any:
        if self._local_model is None:
            if SentenceTransformer is None:
                raise ImportError("sentence-transformers not installed.")
            logger.info("Loading local embedding model 'all-MiniLM-L6-v2'...")
            self._local_model = SentenceTransformer('all-MiniLM-L6-v2')
            logger.info("Local model loaded.")
        return self._local_model

    async def generate_embedding(self, text: str, db: Session) -> list[float]:
        try:
            # Fetch settings from DB
            settings_rows = db.query(SystemSetting).all()
            config = {str(s.key): s.value for s in settings_rows}
            
            provider = config.get("EMBEDDING_PROVIDER") or config.get("LLM_PROVIDER", "openai")
            
            # Local Built-in Provider
            if provider == "local_builtin":
                 local_model = self._get_local_model()
                 # Synchronous call, but fast on CPU for single snippet
                 # In async context this blocks the event loop briefly. 
                 # Ideally run in executor, but for now this is okay.
                 embedding = local_model.encode(text).tolist()
                 
                 # Pad to 1536 dimensions if necessary (DB expects 1536)
                 # all-MiniLM-L6-v2 output is 384
                 target_dim = 1536
                 current_dim = len(embedding)
                 if current_dim < target_dim:
                     # Pad with zeros
                     embedding.extend([0.0] * (target_dim - current_dim))
                 
                 return cast(list[float], embedding)

            api_key = config.get("OPENAI_API_KEY", "")
            
            client: AsyncOpenAI | AsyncAzureOpenAI | None = None
            model_to_use = self.model
            
            if not api_key:
                raise ValueError("AI API Key not configured")

            if provider == "azure":
                endpoint = config.get("AZURE_OPENAI_ENDPOINT")
                deployment = config.get("AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME") or config.get(
                    "AZURE_OPENAI_DEPLOYMENT_NAME"
                )
                api_version = config.get("AZURE_OPENAI_API_VERSION", "2024-02-15-preview")
                
                if not endpoint or not deployment:
                    raise ValueError("Azure configuration incomplete (Embedding Deployment missing)")
                    
                client = AsyncAzureOpenAI(
                    api_key=api_key,
                    api_version=api_version,
                    azure_endpoint=endpoint
                )
                model_to_use = deployment # Azure uses deployment name as model
            else:
                 base_url = config.get("OPENAI_BASE_URL") or None
                 client = AsyncOpenAI(
                    api_key=api_key,
                    base_url=base_url
                 )

            # Replace newlines to improve performance as recommended by OpenAI
            text = text.replace("\n", " ")
            
            assert client is not None
            response = await client.embeddings.create(
                input=[text],
                model=model_to_use
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"Failed to generate embedding: {e}")
            raise e

embedding_service = EmbeddingService()
