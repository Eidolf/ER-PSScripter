#!/bin/bash
set -e

# Run migrations
# uses global python environment where alembic is installed
alembic upgrade head

# Initialize data (create default superuser if needed)
python -m app.initial_data

# Start app
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
