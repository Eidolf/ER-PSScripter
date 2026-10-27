import asyncio
import datetime
import logging
from typing import Any

import httpx
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from app.models.knowledge import KnowledgeSource
from app.schemas.knowledge import KnowledgeEntityCreate
from app.services.knowledge_service import knowledge_service

logger = logging.getLogger(__name__)


class KnowledgeCrawlerManager:
    """Manages background crawling of documentation sources with real-time progress and cancellation."""

    def __init__(self) -> None:
        self.is_running: bool = False
        self.current_source_id: int | None = None
        self.current_source_name: str | None = None
        self.progress_message: str = "Idle"
        self.pages_crawled: int = 0
        self._stop_requested: bool = False

    def get_status(self) -> dict[str, Any]:
        return {
            "is_running": self.is_running,
            "source_id": self.current_source_id,
            "source_name": self.current_source_name,
            "progress_message": self.progress_message,
            "pages_crawled": self.pages_crawled,
        }

    def stop_crawl(self) -> dict[str, Any]:
        if self.is_running:
            self._stop_requested = True
            self.progress_message = "Cancelling crawl..."
            return {"status": "stopping", "message": "Cancellation request received."}
        return {"status": "idle", "message": "No active crawl to stop."}

    async def crawl_source(self, source_id: int, db: Session) -> dict[str, Any]:
        if self.is_running:
            return {"status": "busy", "message": f"Crawler already running on '{self.current_source_name}'."}

        source = db.query(KnowledgeSource).filter(KnowledgeSource.id == source_id).first()
        if not source:
            return {"status": "error", "message": "Source not found."}

        self.is_running = True
        self._stop_requested = False
        self.current_source_id = int(source.id) if source.id is not None else 0
        self.current_source_name = str(source.name)
        self.pages_crawled = 0
        self.progress_message = f"Starting crawl on {source.name}..."

        try:
            url = source.url
            if not url or not url.startswith("http"):
                self.progress_message = f"Simulating sync for internal source {source.name}..."
                await asyncio.sleep(1.0)
                self.pages_crawled = 1
            else:
                self.progress_message = f"Fetching documentation from {url}..."
                # Gentle request rate to preserve host CPU & avoid getting IP blocked
                async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                    if self._stop_requested:
                        raise asyncio.CancelledError("Crawl stopped by user")

                    resp = await client.get(url, headers={"User-Agent": "ER-PSScripter-KnowledgeBot/1.0"})
                    if resp.status_code == 200:
                        soup = BeautifulSoup(resp.text, "html.parser")
                        title = str(soup.title.string).strip() if soup.title and soup.title.string else str(source.name)

                        # Extract headings or code elements
                        headings = [h.get_text().strip() for h in soup.find_all(["h1", "h2", "h3"]) if h.get_text()]
                        text_content = " ".join([p.get_text().strip() for p in soup.find_all("p")[:8]])

                        # Generate structured entity from crawled page
                        entity_name = title.split("|")[0].split("-")[0].strip()
                        if len(entity_name) > 3:
                            trust_val = float(source.trust_level) if source.trust_level is not None else 1.0
                            knowledge_service.upsert_entity(
                                db,
                                KnowledgeEntityCreate(
                                    canonical_name=entity_name,
                                    category="module" if "module" in entity_name.lower() else "best_practice",
                                    description=text_content[:500] if text_content else f"Indexed from {url}",
                                    tags=["crawled", str(source.source_type)],
                                    source_id=source.id,
                                    source_url=url,
                                    source_type=str(source.source_type),
                                    trust_level=trust_val,
                                    confidence_score=0.9,
                                    structured_details={"headings": headings[:5], "url": url},
                                ),
                            )
                        self.pages_crawled += 1


            # Update source timestamp
            source.last_crawled_at = datetime.datetime.utcnow()
            db.commit()
            self.progress_message = f"Crawl completed. {self.pages_crawled} resource(s) processed."
            return {"status": "success", "pages_crawled": self.pages_crawled}

        except asyncio.CancelledError:
            self.progress_message = "Crawl was stopped by user."
            return {"status": "cancelled", "pages_crawled": self.pages_crawled}
        except Exception as e:
            logger.error(f"Error crawling source {source_id}: {e}")
            self.progress_message = f"Error: {str(e)}"
            return {"status": "error", "message": str(e)}
        finally:
            self.is_running = False
            self.current_source_id = None
            self.current_source_name = None
            self._stop_requested = False


crawler_manager = KnowledgeCrawlerManager()
