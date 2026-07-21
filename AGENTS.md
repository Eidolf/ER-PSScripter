# AI Developer Handbook (AGENTS.md)

This handbook provides architectural maps, rules, commands, and workflows for AI agents developing in the ER-PSScripter repository.

## 1. Token Efficiency Rules

- **Strict Bullet Points**: Explain findings, rationale, and designs using concise bullet points. Avoid filler text or conversational pleasantries.
- **Line-Range Reads**: Prefer targeted reading of files using line-range queries rather than reading whole files.
- **Batched Tool Calls**: Group independent tool actions into single batches whenever possible.
- **No Echoing Code**: Never write out large blocks of unchanged code. Provide only the relevant code snippets or diff blocks.

## 2. Subagent Strategy

- **Task Isolation**: Spawn subagents for independent, parallelisable tasks such as:
  - Performing read-only codebase research.
  - Running/debugging test suites.
  - Doing isolated component updates.
- **State Preservation**: Ensure the parent agent resumes from the subagent's returned report. Pass explicit context and boundary descriptions to subagents.

## 3. Single Source of Truth

- **Prioritize Metadata**: Always inspect `project_manifest.json` and `project_connections.json` in the root directory before running generic recursive searches.
- **Verification**: Cross-reference path layouts in the manifest before creating files to keep imports clean.

## 4. Codebase Architecture

| Directory | Layer | Purpose |
| :--- | :--- | :--- |
| `backend/` | Backend | FastAPI backend application handling endpoints and business logic |
| `backend/app/models/` | DB Layer | SQLAlchemy Models (User, Snippet, Project, SnippetVersion, SystemSetting) |
| `backend/app/api/` | API Routes | FastAPI controllers (V1 endpoints) |
| `backend/app/services/` | Services | Core logic for embeddings, LLM generation, and script analysis |
| `frontend/` | Frontend | React + Tailwind application compiled with Vite |
| `frontend/src/pages/` | Views | Visual pages (Editor, Generator, Projects, Snippets, Settings) |
| `frontend/src/components/` | Components | Visual/interactive components (Terminal, Monaco Editor, modals) |
| `db/` | Database | Docker container with PGVector and custom migrations |
| `scripts/` | Tooling | Tooling scripts (e.g. model pull scripts, manifest generator) |

## 5. CLI Commands Reference

### Development Stack
- **Run Backend Dev Server**: `docker compose up -d backend` (starts the server at http://localhost:13021)
- **Run Frontend Dev Server**: Run locally via `cd frontend && npm run dev` or via Docker: `docker compose up -d frontend` (accessible at http://localhost:13020)
- **Restart Entire Stack**: `docker compose down && docker compose up -d`

### Linting & Formatting
- **Lint Frontend**: `cd frontend && npm run lint`

### Database Migrations
- **Generate Migrations**: `docker run --rm -v $(pwd)/backend:/app --network er-psscripter_er-network -e DATABASE_URL=postgresql://user:password@er-psscripter-db:5432/erpsscripter er-psscripter-backend alembic revision --autogenerate -m "MigrationName"`
- **Run Migrations**: `docker compose exec -T backend alembic upgrade head`

## 6. Coding Standards & Quality Hygiene

- **Language**: Use English exclusively for all code elements, comments, documentation, and commit messages.
- **Strict Typing**: Implement complete Python type-hints on all new function signatures and fully typed React TypeScript components.
- **Error Handling**: Use explicit exceptions and prevent silent errors. Always preserve stack trace information using `raise ... from`.
- **Secrets Management**: Do not hardcode credentials or connection strings in code or configurations. Use environment variables (configured via `.env` or system environment).
