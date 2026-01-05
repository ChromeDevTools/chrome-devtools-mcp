#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -f "$PROJECT_ROOT/.env" ]; then
  cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
  echo "Created .env from .env.example"
fi

echo "Installing backend dependencies..."
python -m venv "$PROJECT_ROOT/backend/.venv"
source "$PROJECT_ROOT/backend/.venv/bin/activate"
pip install --upgrade pip
pip install -r "$PROJECT_ROOT/backend/requirements.txt" -r "$PROJECT_ROOT/backend/requirements-dev.txt"

deactivate

echo "Installing frontend dependencies..."
cd "$PROJECT_ROOT/frontend"
npm install

cat <<'MESSAGE'
Installation complete.

Next steps:
- Backend: source backend/.venv/bin/activate && uvicorn app.main:app --reload
- Frontend: npm run dev
- Docker: docker compose up --build
MESSAGE
