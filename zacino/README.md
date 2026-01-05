# zacino

**zacino** is a Meta full-stack, high-performance optimization command center for enterprise-grade teams. It provides the **Meta Core Feature**: a secure, JWT-based optimization job queue with real-time lifecycle controls and scoring.

## Tech stack

- **Backend:** FastAPI + SQLAlchemy (async) + Uvicorn
- **Frontend:** React + Vite + TypeScript
- **Database:** PostgreSQL (Docker) / SQLite (local fallback)
- **Auth:** JWT-based
- **Testing:** Pytest + Vitest
- **CI/CD:** Gitea Actions
- **Deploy:** Docker Compose with `.env` configuration

## Project structure

```
backend/   FastAPI service
frontend/  React UI
```

## Local setup

1. Copy environment variables:

```bash
cp .env.example .env
```

2. Backend (Python 3.12):

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload
```

3. Frontend (Node 20+):

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` and connects to the API on `http://localhost:8000`.

## Docker setup

```bash
cp .env.example .env

docker compose up --build
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`

## Tests

Backend:

```bash
cd backend
pytest
```

Frontend:

```bash
cd frontend
npm test
```

## API overview

- `POST /api/v1/auth/register` - register user
- `POST /api/v1/auth/login` - login and receive JWT
- `GET /api/v1/jobs` - list jobs
- `POST /api/v1/jobs` - create job
- `PATCH /api/v1/jobs/{id}` - update job
- `DELETE /api/v1/jobs/{id}` - delete job
- `GET /healthz` - liveness
- `GET /readyz` - readiness (DB check)

## Security notes

- Set a strong `SECRET_KEY` in `.env`.
- Configure `CORS_ORIGINS` with approved domains.

## License

MIT License. See [LICENSE](./LICENSE).
