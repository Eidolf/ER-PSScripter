# ER-PSScripter

<div align="center">
  <img src="./images/logo.png" alt="ER-PSScripter Logo" width="200"/>
  <h1>ER-PSScripter</h1>
  <p><strong>AI-driven PowerShell Script Generator & Snippet Manager</strong></p>
</div>

## Overview
ER-PSScripter is a production-ready application designed to analyze, manage, and generate high-quality PowerShell scripts. Leveraging AI and best practices, it turns requirements into PSScriptAnalyzer-compliant code.

## Architecture
- **Backend**: FastAPI (Python) + Pydantic + SQLAlchemy (SQLite/Postgres)
- **Frontend**: React + Vite + TypeScript
- **Security**: OAuth2, Helmet, CORS, Rate Limiting
- **DevOps**: GitHub Actions for CI/CD, Containerization, GHCR Registry
- **AI**: Hybrid RAG System (Local Embeddings + Cloud Generation)

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 20+
- Docker

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/user/ER-PSScripter.git
   cd ER-PSScripter
   ```

2. Start Backend
   ```bash
   cd backend
   pip install poetry
   poetry install
   poetry run uvicorn app.main:app --reload
   ```

3. Start Frontend
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. Setup Environment (`.env`)
   Create a `.env` file in the root directory to configure the Docker environment, especially for optional features like the local LLM.

   ```bash
   # Environment Configuration for ER-PSScripter

   # Enable Docker Compose Profiles
   # Uncomment 'llm' to enable the built-in Ollama service (~4GB RAM usage)
   # COMPOSE_PROFILES=llm
   COMPOSE_PROFILES=
   ```
   *Tip: Use `COMPOSE_PROFILES=llm` if you want to use the completely offline, built-in AI service.*

## Key Features (New)
- **Hybrid AI Config**: Use **Local (Simulated)** models for free indexing/learning and **Azure/OpenAI** for high-quality generation.
- **RAG Learning**: The system learns from your existing snippets.
- **Function Detection**: Automatically tags PowerShell functions with `ƒ` badge.

## Documentation
- [Architecture](./docs/architecture/overview.md)
- [Contributing](./docs/contributing.md)
- [API Docs](http://localhost:13021/docs)

## Deployment

### Quick Deployment (Portainer / Docker Compose)

1.  **Create Stack**: Create a new stack in Portainer (or a `docker-compose.yml` file) with the following content:

    ```yaml
    version: '3.8'

    services:
      backend:
        image: ghcr.io/eidolf/er-psscripter/backend:latest
        restart: unless-stopped
        ports:
          - "13021:8000"
        environment:
          - PROJECT_NAME=ER-PSScripter
          - SECRET_KEY=changethiskeyinproduction # CHANGE THIS
          - BACKEND_CORS_ORIGINS=["http://localhost:13020", "http://localhost:5173", "http://localhost:13021"]
          
          # Database
          - POSTGRES_SERVER=db
          - POSTGRES_USER=app_user
          - POSTGRES_PASSWORD=secure_password # CHANGE THIS
          - POSTGRES_DB=psscripter_db
        depends_on:
          - db
        volumes:
          - ./data/backend:/app/data

      frontend:
        image: ghcr.io/eidolf/er-psscripter/frontend:latest
        restart: unless-stopped
        ports:
          - "13020:80"
        depends_on:
          - backend

      db:
        image: pgvector/pgvector:pg15
        restart: unless-stopped
        environment:
          - POSTGRES_USER=app_user
          - POSTGRES_PASSWORD=secure_password # CHANGE THIS
          - POSTGRES_DB=psscripter_db
        volumes:
          - ./data/postgres:/var/lib/postgresql/data
    ```

2.  **Access & Setup**:
    *   Open the frontend (e.g., `http://your-server:13020`).
    *   You will be prompted to **Create an Admin Account** on the first visit.
    *   Enter your desired email and password to initialize the system.

3.  **Environment Variables**:
    *   **SECURITY**: Change `SECRET_KEY` and `POSTGRES_PASSWORD` for production use.

### Docker Images
Images are automatically built and pushed to GitHub Container Registry (GHCR) on every release:
*   Backend: `ghcr.io/eidolf/er-psscripter/backend:latest`
*   Frontend: `ghcr.io/eidolf/er-psscripter/frontend:latest`

## License
AGPL-3.0-only
