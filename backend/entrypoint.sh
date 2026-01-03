#!/bin/bash
set -e

# Run migrations
poetry run alembic upgrade head

# Start app
exec poetry run uvicorn app.main:app --host 0.0.0.0 --port 8000
