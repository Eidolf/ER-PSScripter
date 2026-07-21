#!/usr/bin/env python3
import os
import json
import re

def generate_manifest():
    manifest = {
        "metadata": {
            "name": "ER-PSScripter",
            "description": "PowerShell Script Generator, Editor, Executor, and RAG snippet library with interactive terminal and version control.",
            "entry_points": {
                "backend": "backend/app/main.py",
                "frontend": "frontend/src/main.tsx"
            }
        },
        "file_tree": {
            "backend": "FastAPI backend container handling generation, execution, and semantic database storage",
            "backend/app/models": "SQLAlchemy database models (User, Project, Snippet, SnippetVersion, SystemSetting)",
            "backend/app/api": "FastAPI API endpoint routes under v1",
            "backend/app/services": "Business logic services (AIGeneratorService, EmbeddingService, ScriptAnalyzerService)",
            "frontend": "React & Tailwind CSS frontend application built with Vite",
            "frontend/src/pages": "Frontend application page views (Editor, Generator, Projects, Settings, Snippets)",
            "frontend/src/components": "Reusable React UI components (PowerShellEditor, Terminal, modals)",
            "db": "PostgreSQL database configuration containing pgvector extension installation"
        },
        "db_models": {
            "Project": {
                "file": "backend/app/models/project.py",
                "fields": {
                    "id": "Integer",
                    "name": "String",
                    "description": "Text",
                    "user_id": "Integer",
                    "created_at": "DateTime",
                    "updated_at": "DateTime"
                },
                "relationships": ["Snippet"]
            },
            "Snippet": {
                "file": "backend/app/models/snippet.py",
                "fields": {
                    "id": "Integer",
                    "name": "String",
                    "description": "Text",
                    "content": "Text",
                    "embedding": "Vector(1536)",
                    "tags": "JSON",
                    "category": "String",
                    "source": "String",
                    "project_id": "Integer",
                    "relative_path": "String",
                    "content_hash": "String",
                    "created_at": "DateTime",
                    "updated_at": "DateTime"
                },
                "relationships": ["Project", "SnippetVersion"]
            },
            "SnippetVersion": {
                "file": "backend/app/models/snippet_version.py",
                "fields": {
                    "id": "Integer",
                    "snippet_id": "Integer",
                    "version": "Integer",
                    "name": "String",
                    "description": "Text",
                    "content": "Text",
                    "parent_version_id": "Integer",
                    "created_at": "DateTime"
                },
                "relationships": ["Snippet", "SnippetVersion"]
            },
            "User": {
                "file": "backend/app/models/user.py",
                "fields": {
                    "id": "Integer",
                    "email": "String",
                    "hashed_password": "String",
                    "is_active": "Boolean",
                    "is_superuser": "Boolean"
                },
                "relationships": []
            },
            "SystemSetting": {
                "file": "backend/app/models/setting.py",
                "fields": {
                    "id": "Integer",
                    "key": "String",
                    "value": "String",
                    "description": "Text",
                    "is_secret": "Boolean",
                    "created_at": "DateTime",
                    "updated_at": "DateTime"
                },
                "relationships": []
            }
        },
        "services": {
            "AIGeneratorService": {
                "file": "backend/app/services/ai_generator.py",
                "methods": [
                    {
                        "name": "generate_script",
                        "signature": "async def generate_script(self, request: ScriptRequest, db: Session | None = None) -> ScriptResponse",
                        "description": "Generate or edit a PowerShell script using LLM and vector RAG context."
                    }
                ]
            },
            "EmbeddingService": {
                "file": "backend/app/services/embedding_service.py",
                "methods": [
                    {
                        "name": "generate_embedding",
                        "signature": "async def generate_embedding(self, text: str, db: Session) -> list[float] | None",
                        "description": "Generate 1536-dim vector embedding using OpenAI API (fallback to Mock embedding)."
                    }
                ]
            },
            "ScriptAnalyzerService": {
                "file": "backend/app/services/script_analyzer.py",
                "methods": [
                    {
                        "name": "analyze_content",
                        "signature": "def analyze_content(self, content: str, source_name: str, split_functions: bool = False) -> list[SnippetCreate]",
                        "description": "Analyze PowerShell scripts, detect metadata headers, functions, and return snippet configurations."
                    }
                ]
            }
        },
        "endpoints": [
            {
                "path": "/api/v1/login/access-token",
                "method": "POST",
                "summary": "OAuth2 compatible token login",
                "description": "Get username/password login token.",
                "request_model": "OAuth2PasswordRequestForm",
                "response_model": "Token",
                "file": "backend/app/api/v1/endpoints/login.py"
            },
            {
                "path": "/api/v1/snippets",
                "method": "GET",
                "summary": "Retrieve snippets",
                "description": "List all snippets in the database.",
                "request_model": "None",
                "response_model": "list[SnippetResponse]",
                "file": "backend/app/api/v1/endpoints/snippets.py"
            },
            {
                "path": "/api/v1/snippets",
                "method": "POST",
                "summary": "Create snippet",
                "description": "Create a new snippet and generate embedding.",
                "request_model": "SnippetCreate",
                "response_model": "SnippetResponse",
                "file": "backend/app/api/v1/endpoints/snippets.py"
            },
            {
                "path": "/api/v1/snippets/{id}",
                "method": "PUT",
                "summary": "Update snippet",
                "description": "Update snippet fields and increment script version.",
                "request_model": "SnippetUpdate",
                "response_model": "SnippetResponse",
                "file": "backend/app/api/v1/endpoints/snippets.py"
            },
            {
                "path": "/api/v1/snippets/{id}/versions",
                "method": "GET",
                "summary": "Retrieve versions",
                "description": "List all versions of a snippet/script.",
                "request_model": "None",
                "response_model": "list[SnippetVersionResponse]",
                "file": "backend/app/api/v1/endpoints/snippets.py"
            },
            {
                "path": "/api/v1/snippets/{id}/versions/{version_id}",
                "method": "DELETE",
                "summary": "Delete version",
                "description": "Delete a script version and re-parent children.",
                "request_model": "None",
                "response_model": "SnippetVersionResponse",
                "file": "backend/app/api/v1/endpoints/snippets.py"
            },
            {
                "path": "/api/v1/execute",
                "method": "POST",
                "summary": "Execute script",
                "description": "Execute a PowerShell script asynchronously on the backend server.",
                "request_model": "ExecuteRequest",
                "response_model": "ExecuteResponse",
                "file": "backend/app/api/v1/endpoints/execute.py"
            }
        ],
        "frontend": {
            "components": {
                "PowerShellEditor": {
                    "file": "frontend/src/components/PowerShellEditor.tsx",
                    "description": "Monaco-based editor component for writing and highlighting PowerShell."
                },
                "Terminal": {
                    "file": "frontend/src/components/Terminal.tsx",
                    "description": "Xterm.js based interactive terminal to execute PowerShell code asynchronously."
                }
            },
            "hooks": {},
            "routes": {
                "/": "Home",
                "/login": "Login",
                "/generator": "Generator",
                "/editor": "Editor",
                "/snippets": "SnippetLibrary",
                "/projects": "Projects",
                "/projects/:id": "ProjectDetail",
                "/settings": "Settings",
                "/users": "Users"
            }
        }
    }
    
    # Save the manifest
    output_path = "project_manifest.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"Manifest written to {output_path}")

if __name__ == "__main__":
    generate_manifest()
