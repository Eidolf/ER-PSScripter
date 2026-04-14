#!/bin/bash
set -e

echo "🚀 Starting Pre-Flight Checks..."

# Ensure Poetry is in PATH
export PATH="$HOME/.local/bin:$PATH"

# 1. Backend Linting
echo "🐍 Checking Backend (Ruff & Mypy)..."
cd backend
# Retrieve venv path to bypass 'poetry run' sync (which would reinstall GPU usage)
if ! command -v poetry &> /dev/null; then
    echo "❌ Poetry not found. Please install poetry."
    exit 1
fi

if ! VENV_PATH=$(poetry env info --path 2>/dev/null); then
    echo "❌ Poetry environment not found in backend."
    echo "👉 Please run 'cd backend && poetry install' to set up dependencies."
    exit 1
fi

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
if [ ! -d "node_modules" ]; then
    echo "❌ node_modules not found in frontend."
    echo "👉 Please run 'cd frontend && npm install' to restore dependencies."
    exit 1
fi
npm run lint
cd ..

# Parse arguments
RUN_CI=false
USE_CACHE=false
REUSE_CONTAINER=false

for arg in "$@"; do
    case $arg in
        --ci)
            RUN_CI=true
            ;;
        --cache)
            USE_CACHE=true
            ;;
        --reuse)
            REUSE_CONTAINER=true
            ;;
    esac
done

# 3. GitHub Actions Simulation (Optional)
if [ "$RUN_CI" = true ]; then
    echo "🎬 Simulating CI with act..."
    if command -v act >/dev/null 2>&1; then
        
        # -u 0: Run as root to ensure full permissions (socket + cache writes)
        # --group-add: Not strictly needed if root, but harmless.
        CONTAINER_OPTS="--privileged --userns=host -u 0"
        
        if [ "$USE_CACHE" = true ]; then
            echo "⚡ Caching enabled: Using Docker Volumes (Root-owned)..."
            # Mount volumes to /root caches. Suffix '-root' guarantees fresh start with correct permissions.
            CONTAINER_OPTS="$CONTAINER_OPTS -v er-psscripter-act-pip-root:/root/.cache/pip -v er-psscripter-act-npm-root:/root/.npm"
            # Force environment variables
            CONTAINER_OPTS="$CONTAINER_OPTS --env XDG_CACHE_HOME=/root/.cache --env npm_config_cache=/root/.npm"
        fi

        ACT_CMD="act workflow_dispatch -W .github/workflows/ci-orchestrator.yml --container-architecture linux/amd64 --container-options \"$CONTAINER_OPTS\""
        
        if [ "$REUSE_CONTAINER" = true ]; then
            echo "🔥 Reuse enabled: Container will be kept alive for speed (fastest)."
            ACT_CMD="$ACT_CMD --reuse"
        fi

        # Run ACT
        eval $ACT_CMD

    else
        echo "⚠️ 'act' not found. Skipping CI simulation."
    fi
else
    echo "⏩ Skipping CI simulation (heavy). Run with './check-prepush.sh --ci' to include it."
    echo "💡 Tip: Use '--ci --cache --reuse' for maximum speed during development!"
fi

echo "✅ All checks passed! You are ready to push."
