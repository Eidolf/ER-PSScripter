#!/bin/bash
set -e

echo "🚀 Starting Pre-Flight Checks..."

# 1. Backend Linting
echo "🐍 Checking Backend (Ruff & Mypy)..."
cd backend
# Retrieve venv path to bypass 'poetry run' sync (which would reinstall GPU usage)
VENV_PATH=$(poetry env info --path)
VENV_BIN="$VENV_PATH/bin"
echo "🐍 Checking Backend (Ruff & Mypy) using $VENV_PATH..."
$VENV_BIN/ruff check .
$VENV_BIN/mypy .
echo "🧪 Running Backend Tests..."
$VENV_BIN/pytest
cd ..

# 2. Frontend Linting
echo "⚛️ Checking Frontend (ESLint)..."
cd frontend
npm run lint
cd ..

# 3. GitHub Actions Simulation
echo "🎬 Simulating CI with act..."
if command -v act >/dev/null 2>&1; then
    # Run the lint job specifically or the whole workflow
    # Using workflow_dispatch event simulation
    act workflow_dispatch -W .github/workflows/ci-orchestrator.yml --container-architecture linux/amd64
else
    echo "⚠️ 'act' not found. Skipping CI simulation."
fi

echo "✅ All checks passed! You are ready to push."
