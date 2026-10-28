import asyncio
import datetime
import logging
import re
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.knowledge import KnowledgeSource
from app.schemas.knowledge import KnowledgeEntityCreate
from app.services.knowledge_service import knowledge_service

logger = logging.getLogger(__name__)

# Realistic modern desktop Microsoft Edge headers to prevent blocking by Microsoft Learn & doc CDNs
DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,de;q=0.8",
    "Sec-Ch-Ua": '"Chromium";v="124", "Microsoft Edge";v="124", "Not-A.Brand";v="99"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}

# Standard Approved PowerShell Verbs
APPROVED_VERBS = {
    "Add", "Approve", "Assert", "Backup", "Block", "Build", "Checkpoint", "Clear", "Close",
    "Compare", "Complete", "Compress", "Confirm", "Connect", "Convert", "ConvertFrom", "ConvertTo",
    "Copy", "Debug", "Deny", "Disable", "Disconnect", "Dismount", "Edit", "Enable", "Enter",
    "Exit", "Expand", "Export", "Find", "Format", "Get", "Grant", "Group", "Hide", "Import",
    "Initialize", "Install", "Invoke", "Join", "Limit", "Lock", "Measure", "Merge", "Mount",
    "Move", "New", "Open", "Optimize", "Out", "Ping", "Protect", "Publish", "Read", "Receive",
    "Redo", "Register", "Remove", "Rename", "Repair", "Request", "Reset", "Resize", "Resolve",
    "Restart", "Restore", "Resume", "Revoke", "Save", "Search", "Select", "Send", "Set", "Show",
    "Skip", "Split", "Start", "Step", "Stop", "Submit", "Suspend", "Switch", "Sync", "Test",
    "Trace", "Unblock", "Undo", "Uninstall", "Unlock", "Unprotect", "Unpublish", "Unregister",
    "Update", "Use", "Wait", "Watch", "Write",
}


def normalize_github_url(url: str) -> tuple[str, bool]:
    """Convert github.com/.../blob/... markdown URLs to raw.githubusercontent.com for clean markdown ingestion."""
    # Pattern: https://github.com/owner/repo/blob/branch/path/to/file.md
    m = re.match(r"https?://(?:www\.)?github\.com/([^/]+)/([^/]+)/blob/([^/]+)/(.*)", url)
    if m:
        owner, repo, branch, path = m.groups()
        return f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}", True
    if "raw.githubusercontent.com" in url:
        return url, True
    return url, False


class KnowledgeCrawlerManager:
    """Manages deep 24/7 background crawling of PowerShell documentation, GitHub repos, and PSGallery."""

    def __init__(self) -> None:
        """Initialize idle crawl status without starting a background task."""
        self.is_running: bool = False
        self.continuous_mode: bool = False
        self.current_source_id: int | None = None
        self.current_source_name: str | None = None
        self.current_url: str | None = None
        self.progress_message: str = "Idle"
        self.pages_crawled: int = 0
        self.max_pages: int = 0
        self.entities_extracted: int = 0
        self.queue_size: int = 0
        self.recent_logs: list[str] = []
        self._stop_requested: bool = False
        self._background_task: asyncio.Task[None] | None = None

    def _log(self, message: str) -> None:
        """Append a local-time-stamped activity entry, retaining the latest 30 entries."""
        timestamp = datetime.datetime.now().strftime("%H:%M:%S")
        entry = f"[{timestamp}] {message}"
        self.recent_logs.append(entry)
        if len(self.recent_logs) > 30:
            self.recent_logs.pop(0)

    def get_status(self) -> dict[str, Any]:
        """Return crawl state, counters, limits, and the shared recent activity list."""
        return {
            "is_running": self.is_running,
            "continuous_mode": self.continuous_mode,
            "source_id": self.current_source_id,
            "source_name": self.current_source_name,
            "current_url": self.current_url,
            "progress_message": self.progress_message,
            "pages_crawled": self.pages_crawled,
            "max_pages": self.max_pages,
            "entities_extracted": self.entities_extracted,
            "queue_size": self.queue_size,
            "recent_logs": self.recent_logs,
        }

    def stop_crawl(self) -> dict[str, Any]:
        """Disable continuous mode and request cancellation when marked running.

        Return ``stopped`` immediately without awaiting task cleanup, or ``idle``
        if no crawl is marked running.
        """
        if self.is_running:
            self._stop_requested = True
            self.continuous_mode = False
            # Cancel active background task if running so it aborts sleep/httpx immediately
            if self._background_task and not self._background_task.done():
                self._background_task.cancel()
            self.is_running = False
            self.progress_message = "Crawler stopped."
            self.current_url = None
            self._log("Crawler stopped by user request.")
            return {"status": "stopped", "message": "Crawler stopped."}
        self.progress_message = "Idle"
        return {"status": "idle", "message": "No active crawler to stop."}

    async def run_continuous_daemon(self) -> None:
        """Repeatedly crawl active sources, oldest crawl first, until stopped.

        Each source uses depth 2 and a 30-page limit, regardless of its refresh
        settings. Errors during a pass are caught so later passes can retry.
        Reset running state on exit; cancellation during inter-pass or retry
        sleeps propagates after cleanup.
        """
        logger.info("PowerShell Knowledge 24/7 Crawler daemon started.")
        self._log("24/7 continuous background crawler started.")
        try:
            while self.continuous_mode and not self._stop_requested:
                try:
                    db: Session = SessionLocal()
                    try:
                        sources = (
                            db.query(KnowledgeSource)
                            .filter(KnowledgeSource.is_active == True)  # noqa: E712
                            .order_by(KnowledgeSource.last_crawled_at.asc().nullsfirst())
                            .all()
                        )
                        for src in sources:
                            if not self.continuous_mode or self._stop_requested:
                                break
                            if src.id is not None:
                                await self._execute_crawl(int(src.id), db, max_depth=2, max_pages=30)
                            await asyncio.sleep(5.0)
                    finally:
                        db.close()
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Error in continuous crawl loop: {e}", exc_info=True)
                    self._log(f"Continuous daemon error: {e}")
                    await asyncio.sleep(10.0)

                # Sleep between passes if no sources need urgent refresh
                for _ in range(30):
                    if not self.continuous_mode or self._stop_requested:
                        break
                    await asyncio.sleep(1.0)
        finally:
            self.continuous_mode = False
            self.is_running = False
            self.progress_message = "Crawler stopped."
            self.current_source_id = None
            self.current_source_name = None
            self.current_url = None
            self._stop_requested = False
            self._log("24/7 background crawler ended.")

    def start_continuous(self) -> dict[str, Any]:
        """Schedule continuous ingestion and return ``started`` without awaiting it.

        Return ``already_running`` for an active daemon or ``busy`` for an active
        on-demand crawl. Raise RuntimeError if scheduling needs an event loop
        and none is running; the running flags have already been set.
        """
        if self.is_running and self.continuous_mode:
            return {"status": "already_running", "message": "Continuous 24/7 crawler is already active."}

        # If a single ad-hoc crawl is running, don't interrupt it
        if self.is_running and not self.continuous_mode:
            return {"status": "busy", "message": f"Ad-hoc crawl currently running on '{self.current_source_name}'."}

        self.continuous_mode = True
        self._stop_requested = False
        self.is_running = True
        self.progress_message = "24/7 background crawler running..."
        self._log("Initiating 24/7 background crawler loop...")
        try:
            loop = asyncio.get_running_loop()
            self._background_task = loop.create_task(self.run_continuous_daemon())
        except RuntimeError:
            self._background_task = asyncio.create_task(self.run_continuous_daemon())
        return {"status": "started", "message": "24/7 continuous background crawler started."}

    def start_single_crawl(self, source_id: int, max_depth: int = 2, max_pages: int = 25) -> dict[str, Any]:
        """Schedule a source crawl and return ``started`` before it completes.

        Cancel an active continuous daemon without automatically resuming it.
        An existing on-demand crawl does not prevent another from being scheduled.
        ``max_depth`` counts followed links from the starting page at depth zero;
        ``max_pages`` limits HTTP 200 responses, not fetch attempts. Nonpositive
        page limits skip HTTP fetching; internal sources still count as one page.

        Source lookup happens in the background. Crawl errors caught by the runner
        update progress instead of reaching this caller. Raise RuntimeError if no
        event loop is running; crawl state has already been changed.
        """
        # If continuous mode is running, temporarily pause/stop it so user ad-hoc crawl runs immediately
        if self.continuous_mode and self._background_task and not self._background_task.done():
            self._log("Pausing 24/7 continuous daemon for priority ad-hoc crawl.")
            self._stop_requested = True
            self._background_task.cancel()
            self.continuous_mode = False

        self.is_running = True
        self.continuous_mode = False
        self._stop_requested = False
        self.max_pages = max_pages
        self.progress_message = "Starting on-demand crawl..."
        self._log(f"Requested single-source crawl for source ID {source_id} (limit: {max_pages} pages)...")

        async def _runner() -> None:
            """Run the crawl with a private session, record crawl errors, and clear active state."""
            db: Session = SessionLocal()
            try:
                await self._execute_crawl(source_id, db, max_depth=max_depth, max_pages=max_pages)
            except asyncio.CancelledError:
                self.progress_message = "Crawler stopped."
                self._log("Single crawl cancelled.")
            except Exception as e:
                logger.error(f"Error during crawl of source {source_id}: {e}", exc_info=True)
                self.progress_message = f"Error: {e}"
                self._log(f"Error during crawl: {e}")
            finally:
                db.close()
                self.is_running = False
                self.current_source_id = None
                self.current_source_name = None
                self.current_url = None
                self._stop_requested = False
                self.queue_size = 0

        try:
            loop = asyncio.get_running_loop()
            self._background_task = loop.create_task(_runner())
        except RuntimeError:
            self._background_task = asyncio.create_task(_runner())

        return {"status": "started", "message": "Crawl job started in background."}

    async def crawl_source(
        self, source_id: int, db: Session, max_depth: int = 2, max_pages: int = 25
    ) -> dict[str, Any]:
        """Synchronous coroutine runner for a single knowledge source."""
        if self.is_running and not self.continuous_mode:
            return {"status": "busy", "message": f"Crawler is already active on '{self.current_source_name}'."}

        self.is_running = True
        self._stop_requested = False
        try:
            return await self._execute_crawl(source_id, db, max_depth=max_depth, max_pages=max_pages)
        finally:
            if not self.continuous_mode:
                self.is_running = False
                self.current_source_id = None
                self.current_source_name = None
                self.current_url = None
                self._stop_requested = False



    async def _execute_crawl(self, source_id: int, db: Session, max_depth: int, max_pages: int) -> dict[str, Any]:
        """Ingest a source and return status with page and cmdlet extraction counts.

        Follow relevant HTML links on the starting host through ``max_depth``
        (starting page is depth zero). ``max_pages`` caps HTTP 200 responses,
        including pages whose parsing fails; nonpositive limits skip fetching.
        A missing source returns an error status without counts. A source without
        an HTTP URL only updates its crawl timestamp and counts as one page.

        Update live progress and commit the crawl timestamp, including after
        partial crawls. Entity upserts may commit independently. Skip non-200
        responses and catch per-page fetch/parse errors. Return ``cancelled``
        only when the stop flag is set; cancellation caught within a page ends
        traversal but otherwise returns ``success``. Database errors outside
        page processing and cancellation outside its handler propagate.
        """
        source = db.query(KnowledgeSource).filter(KnowledgeSource.id == source_id).first()
        if not source:
            self._log(f"Crawl target source ID {source_id} not found in database.")
            return {"status": "error", "message": "Source not found."}

        self.current_source_id = int(source.id) if source.id is not None else 0
        self.current_source_name = str(source.name)
        self.pages_crawled = 0
        self.max_pages = max_pages
        self.entities_extracted = 0
        self.progress_message = f"Crawling source {source.name}..."
        self._log(f"Started crawl on '{source.name}' (URL: {source.url or 'internal'}).")

        url = source.url
        if not url or not url.startswith("http"):
            self.progress_message = f"Simulating sync for internal source {source.name}..."
            await asyncio.sleep(0.5)
            self.pages_crawled = 1
            source.last_crawled_at = datetime.datetime.utcnow()
            db.commit()
            self._log(f"Internal source '{source.name}' sync complete.")
            return {"status": "success", "pages_crawled": 1, "entities_extracted": 0}

        # Normalize potential GitHub URLs
        start_url, is_raw_md = normalize_github_url(url)
        parsed_start = urlparse(start_url)
        base_domain = parsed_start.netloc.lower()

        # Crawl queue tracking: (url, current_depth)
        queue: list[tuple[str, int]] = [(start_url, 0)]
        visited: set[str] = set()

        async with httpx.AsyncClient(headers=DEFAULT_HEADERS, timeout=20.0, follow_redirects=True) as client:
            while queue and self.pages_crawled < max_pages:
                if self._stop_requested:
                    self.progress_message = "Crawl cancelled by user request."
                    self._log("Crawl interrupted by stop request.")
                    break

                self.queue_size = len(queue)
                current_url, depth = queue.pop(0)

                # Deduplicate URL (strip fragment & common query noise)
                clean_url = current_url.split("#")[0]
                if clean_url in visited:
                    continue
                visited.add(clean_url)
                self.current_url = clean_url

                self.progress_message = (
                    f"Crawling ({self.pages_crawled + 1}/{max_pages}): {clean_url[:65]}..."
                )

                try:
                    # Gentle throttle to avoid rate-limiting or CPU spikes
                    await asyncio.sleep(0.4)

                    fetch_url, is_markdown = normalize_github_url(clean_url)
                    resp = await client.get(fetch_url)
                    if resp.status_code != 200:
                        logger.warning(f"Failed to fetch {clean_url}: status {resp.status_code}")
                        self._log(f"HTTP {resp.status_code} fetching {clean_url[:60]}")
                        continue

                    self.pages_crawled += 1
                    content_type = resp.headers.get("content-type", "")

                    if is_markdown or "text/plain" in content_type or clean_url.endswith(".md"):
                        extracted = self._parse_markdown_content(
                            resp.text, clean_url, source, db
                        )
                        self.entities_extracted += extracted
                        if extracted > 0:
                            self._log(f"Extracted {extracted} entities from {clean_url.split('/')[-1]}")
                    else:
                        extracted, new_links = self._parse_html_content(
                            resp.text, clean_url, source, db
                        )
                        self.entities_extracted += extracted
                        if extracted > 0:
                            self._log(f"Extracted {extracted} entities from {clean_url.split('/')[-1]}")

                        # Discover sublinks within boundary if not reached max_depth
                        if depth < max_depth:
                            for link in new_links:
                                link_clean = link.split("#")[0]
                                parsed_link = urlparse(link_clean)
                                # Boundary: Stay on same domain or official doc paths
                                if (
                                    parsed_link.netloc.lower() == base_domain
                                    and link_clean not in visited
                                    and self._is_relevant_powershell_doc(link_clean)
                                ):
                                    queue.append((link_clean, depth + 1))

                except asyncio.CancelledError:
                    self.progress_message = "Crawl cancelled."
                    self._log("Crawl cancelled asynchronously.")
                    break
                except Exception as e:
                    logger.warning(f"Error fetching {clean_url}: {e}")
                    self._log(f"Fetch error ({clean_url[:40]}): {e}")

        source.last_crawled_at = datetime.datetime.utcnow()
        db.commit()
        self.queue_size = 0
        if self._stop_requested:
            self.progress_message = "Crawler stopped."
        else:
            self.progress_message = (
                f"Done. Processed {self.pages_crawled} page(s), extracted {self.entities_extracted} entity/cmdlet(s)."
            )
            self._log(f"Completed '{source.name}': {self.pages_crawled} pages, {self.entities_extracted} entities.")
        return {
            "status": "cancelled" if self._stop_requested else "success",
            "pages_crawled": self.pages_crawled,
            "entities_extracted": self.entities_extracted,
        }

    def _is_relevant_powershell_doc(self, url: str) -> bool:
        """Filter URLs to only follow cmdlet references, modules, and relevant PowerShell docs."""
        lower = url.lower()
        # Avoid binary assets, logins, switch-language or search links
        if any(ext in lower for ext in [".png", ".jpg", ".svg", ".zip", ".pdf", ".css", ".js"]):
            return False
        if any(skip in lower for skip in ["login", "signin", "logout", "locale", "toc.json"]):
            return False

        # Match PowerShell doc patterns
        if "/powershell/module/" in lower or "/powershell/scripting/" in lower:
            return True
        if "powershellgallery.com/packages/" in lower:
            return True
        return bool(lower.endswith(".md"))

    def _parse_markdown_content(
        self, markdown_text: str, url: str, source: KnowledgeSource, db: Session
    ) -> int:
        """Parse raw PowerShell markdown (e.g. from MicrosoftDocs/PowerShell-Docs or community repos).

        Upsert the primary cmdlet and references from the first 10 code blocks,
        and attempt module and cross-reference relations. Use ``url`` as their
        provenance. Return the number of cmdlet upserts, including existing
        entities and repeated references; module entities are excluded.

        Upserts commit independently, so partial results can persist on failure.
        Database and validation errors propagate. Relation paths can raise
        NameError for unresolved KnowledgeRelationCreate or KnowledgeEntity names.
        """
        extracted_count = 0
        trust_val = float(source.trust_level) if source.trust_level is not None else 1.0

        # Extract YAML Frontmatter if present
        meta: dict[str, str] = {}
        fm_match = re.match(r"^---\s*\n(.*?)\n---\s*\n", markdown_text, re.DOTALL)
        body = markdown_text
        if fm_match:
            fm_text = fm_match.group(1)
            body = markdown_text[fm_match.end():]
            for line in fm_text.splitlines():
                if ":" in line:
                    k, v = line.split(":", 1)
                    meta[k.strip().lower()] = v.strip()

        module_name = meta.get("module name") or meta.get("module") or None
        doc_title = meta.get("title")

        # Extract main title (# Cmdlet-Name)
        h1_match = re.search(r"^#\s+([A-Za-z]+-[A-Za-z0-9]+)", body, re.MULTILINE)
        cmdlet_name = h1_match.group(1) if h1_match else (doc_title if doc_title and "-" in doc_title else None)

        # Synopsis extraction
        synopsis = ""
        syn_match = re.search(r"##\s+SYNOPSIS\s*\n+([^\n#]+)", body, re.IGNORECASE)
        if syn_match:
            synopsis = syn_match.group(1).strip()

        # Syntax extraction
        syntax_blocks: list[str] = []
        syntax_match = re.search(r"##\s+SYNTAX\s*\n+(.*?)(?=\n##|\Z)", body, re.DOTALL | re.IGNORECASE)
        if syntax_match:
            code_blocks = re.findall(r"```(?:powershell)?\s*\n(.*?)\n```", syntax_match.group(1), re.DOTALL)
            syntax_blocks = [cb.strip() for cb in code_blocks if cb.strip()]

        # Parameter extraction
        params_found: list[str] = []
        param_section = re.search(r"##\s+PARAMETERS\s*\n+(.*?)(?=\n##|\Z)", body, re.DOTALL | re.IGNORECASE)
        if param_section:
            params = re.findall(r"###\s+-([A-Za-z0-9_]+)", param_section.group(1))
            params_found = list(dict.fromkeys(params))

        if cmdlet_name and self._is_valid_cmdlet(cmdlet_name):
            # Upsert Cmdlet entity
            cmdlet_entity = knowledge_service.upsert_entity(
                db,
                KnowledgeEntityCreate(
                    canonical_name=cmdlet_name,
                    category="cmdlet",
                    description=synopsis or f"Official PowerShell cmdlet documentation for {cmdlet_name}.",
                    tags=["cmdlet", "powershell", str(source.source_type)],
                    source_id=source.id,
                    source_url=url,
                    source_type=str(source.source_type),
                    module_name=module_name,
                    trust_level=trust_val,
                    confidence_score=1.0,
                    structured_details={
                        "syntax": syntax_blocks[:5],
                        "parameters": params_found[:20],
                        "module": module_name,
                        "url": url,
                    },
                ),
            )
            extracted_count += 1

            # Auto-link relation: cmdlet -> module
            if module_name and cmdlet_entity and cmdlet_entity.id:
                mod_entity = knowledge_service.upsert_entity(
                    db,
                    KnowledgeEntityCreate(
                        canonical_name=module_name,
                        category="module",
                        description=f"PowerShell module containing {cmdlet_name} and related cmdlets.",
                        tags=["module", "powershell"],
                        source_id=source.id,
                        source_url=url,
                        source_type=str(source.source_type),
                        trust_level=trust_val,
                        confidence_score=1.0,
                    ),
                )
                if mod_entity and mod_entity.id:
                    knowledge_service.add_relation(
                        db,
                        KnowledgeRelationCreate(
                            from_entity_id=cmdlet_entity.id,
                            to_entity_id=mod_entity.id,
                            relation_type="requires_module",
                            description=f"{cmdlet_name} is exported by module {module_name}",
                            confidence=1.0,
                        ),
                    )

        # Also find any other referenced cmdlets in markdown code blocks
        ps_code_blocks = re.findall(r"```(?:powershell)?\s*\n(.*?)\n```", body, re.DOTALL)
        for block in ps_code_blocks[:10]:
            found_cmds = self._extract_cmdlets_from_code(block)
            for cmd in found_cmds:
                if cmd != cmdlet_name and self._is_valid_cmdlet(cmd):
                    ref_entity = knowledge_service.upsert_entity(
                        db,
                        KnowledgeEntityCreate(
                            canonical_name=cmd,
                            category="cmdlet",
                            description=f"Referenced PowerShell cmdlet in verified documentation from {url}.",
                            tags=["cmdlet", "referenced"],
                            source_id=source.id,
                            source_url=url,
                            source_type=str(source.source_type),
                            module_name=module_name,
                            trust_level=trust_val * 0.95,
                            confidence_score=0.9,
                            structured_details={"discovered_in": cmdlet_name, "url": url},
                        ),
                    )
                    extracted_count += 1
                    # Auto-link related_to relation between primary cmdlet and referenced cmdlet
                    if cmdlet_name and ref_entity and ref_entity.id:
                        primary_ent = (
                            db.query(KnowledgeEntity)
                            .filter(KnowledgeEntity.canonical_name.ilike(cmdlet_name))
                            .first()
                        )
                        if primary_ent and primary_ent.id and primary_ent.id != ref_entity.id:
                            knowledge_service.add_relation(
                                db,
                                KnowledgeRelationCreate(
                                    from_entity_id=primary_ent.id,
                                    to_entity_id=ref_entity.id,
                                    relation_type="related_to",
                                    description=f"Referenced together in documentation workflow at {url}",
                                    confidence=0.85,
                                ),
                            )

        return extracted_count

    def _parse_html_content(
        self, html_text: str, url: str, source: KnowledgeSource, db: Session
    ) -> tuple[int, list[str]]:
        """Parse HTML page from Microsoft Learn, PSGallery, or technical blog, extracting cmdlets and outbound links.

        Upsert primary and referenced cmdlets, using ``url`` as provenance, and
        attempt module and cross-reference relations. Return the cmdlet upsert
        count (including existing entities, excluding modules) and all resolved
        anchor URLs, without domain filtering or deduplication.

        Upserts commit independently, so partial results can persist on failure.
        Database and validation errors propagate. Relation creation can raise
        NameError for the unresolved KnowledgeRelationCreate name.
        """
        extracted_count = 0
        discovered_links: list[str] = []
        soup = BeautifulSoup(html_text, "html.parser")
        trust_val = float(source.trust_level) if source.trust_level is not None else 1.0

        # Collect sublinks
        for a in soup.find_all("a", href=True):
            href = a.get("href")
            if href:
                full_url = urljoin(url, href)
                discovered_links.append(full_url)

        # 1. Check if page is a Cmdlet Reference page (e.g., h1 has Verb-Noun)
        h1 = soup.find("h1")
        h1_text = h1.get_text().strip() if h1 else ""
        candidate_cmd = h1_text.split()[0] if h1_text else ""

        # Extract synopsis/description from paragraph
        description = ""
        for p in soup.find_all("p"):
            p_text = p.get_text().strip()
            # Ignore switch to edge warning
            if "browser is no longer supported" in p_text.lower():
                continue
            if len(p_text) > 25:
                description = p_text[:400]
                break

        # Module name if mentioned in breadcrumbs or metadata
        module_name: str | None = None
        if "/powershell/module/" in url.lower():
            parts = url.lower().split("/powershell/module/")[1].split("/")
            if parts and parts[0]:
                module_name = parts[0]
        elif "powershellgallery.com/packages/" in url.lower():
            parts = url.lower().split("powershellgallery.com/packages/")[1].split("/")
            if parts and parts[0]:
                module_name = parts[0]

        # Extract code blocks
        code_snippets: list[str] = [code.get_text() for code in soup.find_all(["code", "pre"])[:15]]
        syntax_blocks: list[str] = [s.strip() for s in code_snippets if "-" in s and len(s) < 250][:5]

        primary_ent = None
        if self._is_valid_cmdlet(candidate_cmd):
            primary_ent = knowledge_service.upsert_entity(
                db,
                KnowledgeEntityCreate(
                    canonical_name=candidate_cmd,
                    category="cmdlet",
                    description=description or f"PowerShell cmdlet documentation from {url}",
                    tags=["cmdlet", "official_doc", str(source.source_type)],
                    source_id=source.id,
                    source_url=url,
                    source_type=str(source.source_type),
                    module_name=module_name,
                    trust_level=trust_val,
                    confidence_score=1.0,
                    structured_details={"syntax": syntax_blocks, "url": url, "module": module_name},
                ),
            )
            extracted_count += 1

            # Auto-link relation: cmdlet -> module
            if module_name and primary_ent and primary_ent.id:
                mod_entity = knowledge_service.upsert_entity(
                    db,
                    KnowledgeEntityCreate(
                        canonical_name=module_name,
                        category="module",
                        description=f"PowerShell module containing {candidate_cmd} and related cmdlets.",
                        tags=["module", "powershell"],
                        source_id=source.id,
                        source_url=url,
                        source_type=str(source.source_type),
                        trust_level=trust_val,
                        confidence_score=1.0,
                    ),
                )
                if mod_entity and mod_entity.id:
                    knowledge_service.add_relation(
                        db,
                        KnowledgeRelationCreate(
                            from_entity_id=primary_ent.id,
                            to_entity_id=mod_entity.id,
                            relation_type="requires_module",
                            description=f"{candidate_cmd} is exported by module {module_name}",
                            confidence=1.0,
                        ),
                    )

        # 2. Extract any PowerShell cmdlets listed in text or code blocks on the page
        body_text = soup.get_text()
        all_found = self._extract_cmdlets_from_code(body_text)
        for cmd in set(all_found):
            if cmd != candidate_cmd and self._is_valid_cmdlet(cmd):
                ref_ent = knowledge_service.upsert_entity(
                    db,
                    KnowledgeEntityCreate(
                        canonical_name=cmd,
                        category="cmdlet",
                        description=f"Discovered in PowerShell reference at {url}.",
                        tags=["cmdlet", "discovered"],
                        source_id=source.id,
                        source_url=url,
                        source_type=str(source.source_type),
                        module_name=module_name,
                        trust_level=trust_val * 0.9,
                        confidence_score=0.85,
                        structured_details={"discovered_on": url, "module": module_name},
                    ),
                )
                extracted_count += 1

                # Auto-link related_to relation between primary cmdlet and referenced cmdlet
                if primary_ent and primary_ent.id and ref_ent and ref_ent.id and primary_ent.id != ref_ent.id:
                    knowledge_service.add_relation(
                        db,
                        KnowledgeRelationCreate(
                            from_entity_id=primary_ent.id,
                            to_entity_id=ref_ent.id,
                            relation_type="related_to",
                            description=f"Referenced together in PowerShell reference at {url}",
                            confidence=0.8,
                        ),
                    )

        return extracted_count, discovered_links

    def _is_valid_cmdlet(self, name: str) -> bool:
        """Validate if a string strictly follows the PowerShell Verb-Noun standard with an approved verb."""
        if not name or "-" not in name:
            return False
        parts = name.split("-", 1)
        if len(parts) != 2:
            return False
        verb, noun = parts[0], parts[1]
        # Ignore HTML links, file extensions, or css classes
        if "." in noun or "/" in noun or "\\" in noun or len(noun) < 2:
            return False
        return verb in APPROVED_VERBS and bool(re.match(r"^[A-Za-z0-9_]+$", noun))

    def _extract_cmdlets_from_code(self, text: str) -> list[str]:
        """Find all Verb-Noun occurrences matching approved PowerShell verbs."""
        tokens = re.findall(r"\b([A-Z][a-zA-Z]+-[A-Z][a-zA-Z0-9]+)\b", text)
        valid: list[str] = []
        for t in tokens:
            verb = t.split("-")[0]
            if verb in APPROVED_VERBS:
                valid.append(t)
        return valid


crawler_manager = KnowledgeCrawlerManager()
