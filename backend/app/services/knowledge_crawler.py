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
        self.is_running: bool = False
        self.continuous_mode: bool = False
        self.current_source_id: int | None = None
        self.current_source_name: str | None = None
        self.current_url: str | None = None
        self.progress_message: str = "Idle"
        self.pages_crawled: int = 0
        self.entities_extracted: int = 0
        self.queue_size: int = 0
        self._stop_requested: bool = False
        self._background_task: asyncio.Task[None] | None = None

    def get_status(self) -> dict[str, Any]:
        return {
            "is_running": self.is_running,
            "continuous_mode": self.continuous_mode,
            "source_id": self.current_source_id,
            "source_name": self.current_source_name,
            "current_url": self.current_url,
            "progress_message": self.progress_message,
            "pages_crawled": self.pages_crawled,
            "entities_extracted": self.entities_extracted,
            "queue_size": self.queue_size,
        }

    def stop_crawl(self) -> dict[str, Any]:
        if self.is_running:
            self._stop_requested = True
            self.continuous_mode = False
            self.progress_message = "Stopping crawler gracefully..."
            return {"status": "stopping", "message": "Cancellation request received."}
        return {"status": "idle", "message": "No active crawler to stop."}

    async def run_continuous_daemon(self) -> None:
        """24/7 background worker loop that periodically inspects registered sources."""
        logger.info("PowerShell Knowledge 24/7 Crawler daemon started.")
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
                            # Crawl each active source with depth traversal
                            await self._execute_crawl(int(src.id), db, max_depth=2, max_pages=30)
                        # Polite throttle pause between sources
                        await asyncio.sleep(5.0)
                finally:
                    db.close()
            except Exception as e:
                logger.error(f"Error in continuous crawl loop: {e}", exc_info=True)
                await asyncio.sleep(10.0)

            # Sleep between passes if no sources need urgent refresh
            await asyncio.sleep(30.0)

        self.continuous_mode = False
        self.is_running = False
        self.progress_message = "Continuous crawl stopped."

    def start_continuous(self) -> dict[str, Any]:
        """Start or enable continuous 24/7 background ingestion."""
        if self.is_running and self.continuous_mode:
            return {"status": "already_running", "message": "Continuous 24/7 crawler is already active."}
        self.continuous_mode = True
        self._stop_requested = False
        if not self.is_running:
            self.is_running = True
            self._background_task = asyncio.create_task(self.run_continuous_daemon())
        return {"status": "started", "message": "24/7 continuous background crawler started."}

    async def crawl_source(
        self, source_id: int, db: Session, max_depth: int = 2, max_pages: int = 25
    ) -> dict[str, Any]:
        """Entry point for manual trigger of a single knowledge source."""
        if self.is_running and not self.continuous_mode:
            return {"status": "busy", "message": f"Crawler is already active on '{self.current_source_name}'."}

        self.is_running = True
        self._stop_requested = False
        return await self._execute_crawl(source_id, db, max_depth=max_depth, max_pages=max_pages)

    async def _execute_crawl(self, source_id: int, db: Session, max_depth: int, max_pages: int) -> dict[str, Any]:
        source = db.query(KnowledgeSource).filter(KnowledgeSource.id == source_id).first()
        if not source:
            return {"status": "error", "message": "Source not found."}

        self.current_source_id = int(source.id) if source.id is not None else 0
        self.current_source_name = str(source.name)
        self.pages_crawled = 0
        self.entities_extracted = 0
        self.progress_message = f"Crawling source {source.name}..."

        url = source.url
        if not url or not url.startswith("http"):
            self.progress_message = f"Simulating sync for internal source {source.name}..."
            await asyncio.sleep(0.5)
            self.pages_crawled = 1
            source.last_crawled_at = datetime.datetime.utcnow()
            db.commit()
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
                        continue

                    self.pages_crawled += 1
                    content_type = resp.headers.get("content-type", "")

                    if is_markdown or "text/plain" in content_type or clean_url.endswith(".md"):
                        extracted = self._parse_markdown_content(
                            resp.text, clean_url, source, db
                        )
                        self.entities_extracted += extracted
                    else:
                        extracted, new_links = self._parse_html_content(
                            resp.text, clean_url, source, db
                        )
                        self.entities_extracted += extracted

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
                    break
                except Exception as e:
                    logger.warning(f"Error fetching {clean_url}: {e}")

        source.last_crawled_at = datetime.datetime.utcnow()
        db.commit()
        self.progress_message = (
            f"Done. Processed {self.pages_crawled} page(s), extracted {self.entities_extracted} entity/cmdlet(s)."
        )
        return {
            "status": "success",
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
        """Parse raw PowerShell markdown (e.g. from MicrosoftDocs/PowerShell-Docs or community repos)."""
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
            knowledge_service.upsert_entity(
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

        # Also find any other referenced cmdlets in markdown code blocks
        ps_code_blocks = re.findall(r"```(?:powershell)?\s*\n(.*?)\n```", body, re.DOTALL)
        for block in ps_code_blocks[:10]:
            found_cmds = self._extract_cmdlets_from_code(block)
            for cmd in found_cmds:
                if cmd != cmdlet_name and self._is_valid_cmdlet(cmd):
                    knowledge_service.upsert_entity(
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

        return extracted_count

    def _parse_html_content(
        self, html_text: str, url: str, source: KnowledgeSource, db: Session
    ) -> tuple[int, list[str]]:
        """Parse HTML page from Microsoft Learn, PSGallery, or technical blog, extracting cmdlets and outbound links."""
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

        if self._is_valid_cmdlet(candidate_cmd):
            knowledge_service.upsert_entity(
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

        # 2. Extract any PowerShell cmdlets listed in text or code blocks on the page
        body_text = soup.get_text()
        all_found = self._extract_cmdlets_from_code(body_text)
        for cmd in set(all_found):
            if cmd != candidate_cmd and self._is_valid_cmdlet(cmd):
                knowledge_service.upsert_entity(
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
