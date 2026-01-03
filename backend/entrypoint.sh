#!/bin/bash
set -e

# Run migrations
# uses global python environment where alembic is installed
alembic upgrade head

# Start app
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
