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

## Key Features (New)
- **Hybrid AI Config**: Use **Local (Simulated)** models for free indexing/learning and **Azure/OpenAI** for high-quality generation.
- **RAG Learning**: The system learns from your existing snippets.
- **Function Detection**: Automatically tags PowerShell functions with `ƒ` badge.

## Documentation
- [Architecture](./docs/architecture/overview.md)
- [Contributing](./docs/contributing.md)
- [API Docs](http://localhost:13021/docs)

## Deployment

### Portainer Stack
This project is designed to be deployed easily using a Portainer Stack.

1.  Copy the content of [`docker-compose.release.yml`](./docker-compose.release.yml).
2.  Paste it into a new Stack in Portainer.
3.  **IMPORTANT:** Update the following Environment Variables in the Stack configuration or directly in the YAML before deploying:
    *   `ACCESS_PIN`: Default is `0000`. **Change this immediately.**
    *   `SECRET_KEY`: Default is insecure. **Change this to a strong random string.**
    *   `POSTGRES_PASSWORD`: Ensure this matches your database requirements.

### Docker Images
Images are automatically built and pushed to GitHub Container Registry (GHCR) on every release:
*   Backend: `ghcr.io/eidolf/er-psscripter-backend:latest`
*   Frontend: `ghcr.io/eidolf/er-psscripter-frontend:latest`

## License
AGPL-3.0-only
