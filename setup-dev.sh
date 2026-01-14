#!/bin/bash
set -e

echo "🛠️ Setting up Development Environment..."

# 1. check for poetry
if ! command -v poetry &> /dev/null; then
    echo "Installing Poetry..."
    curl -sSL https://install.python-poetry.org | python3 -
else
    echo "✅ Poetry found."
fi

# Ensure Poetry is in PATH for this session
export PATH="$HOME/.local/bin:$PATH"

# 2. Check for act
if ! command -v act &> /dev/null; then
    echo "⚠️ 'act' is not installed. Please install it (e.g. brew install act / choco install act-cli)"
else
    echo "✅ act found."
fi

# 3. Install Backend Deps
echo "📦 Installing Backend Dependencies..."
cd backend
poetry install --extras dev
# Overwrite with CPU-only torch to save space (since Poetry defaults to PyPI)
echo "⚡ Optimizing PyTorch (CPU-only)..."
poetry run pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
cd ..

# 4. Install Frontend Deps
echo "📦 Installing Frontend Dependencies..."
cd frontend
npm install
cd ..

echo "✅ Setup Complete!"
