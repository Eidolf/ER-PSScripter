# ER-PSScripter

<div align="center">
  <img src="https://github.com/user/ER-PSScripter/blob/main/images/logo.png" alt="ER-PSScripter Logo" width="200"/>
  <h1>ER-PSScripter</h1>
  <p><strong>AI-driven PowerShell Script Generator & Snippet Manager</strong></p>
</div>

## Overview
ER-PSScripter is a production-ready application designed to analyze, manage, and generate high-quality PowerShell scripts. Leveraging AI and best practices, it turns requirements into PSScriptAnalyzer-compliant code.

## Architecture
- **Backend**: FastAPI (Python) + Pydantic + SQLAlchemy (SQLite/Postgres)
- **Frontend**: React + Vite + TypeScript
- **Security**: OAuth2, Helmet, CORS, Rate Limiting
- **DevOps**: GitHub Actions for CI/CD, Containerization

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

## Documentation
- [Architecture](./docs/architecture/overview.md)
- [Contributing](./docs/contributing.md)
- [API Docs](http://localhost:13021/docs)

## License
MIT
