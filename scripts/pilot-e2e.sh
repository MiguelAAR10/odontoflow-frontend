#!/usr/bin/env bash
# M4 Pilot E2E — deterministic reset + run.
#
# Resets the dedicated odontoflow_e2e database (DROP SCHEMA + alembic upgrade
# head), starts FastAPI on :8010 against it, and runs the pilot E2E spec with
# NEXT_PUBLIC_USE_MOCKS=false. Every run starts from the same empty migrated schema,
# so the pilot's absolute assertions are reproducible.
#
# Prereqs: PostgreSQL on :5434 (user odontoflow/odontoflow), backend venv at
# ../odontoflow-backend/.venv, frontend node_modules installed.
set -euo pipefail

FRONTEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$(cd "$FRONTEND_DIR/../odontoflow-backend" && pwd)"
export PGPASSWORD=odontoflow
export DATABASE_URL="postgresql+psycopg://odontoflow:odontoflow@localhost:5434/odontoflow_e2e"
PORT=8010

echo "== stopping any previous backend on :$PORT =="
pids=$(pgrep -f "python -m uvicorn app:app" || true)
if [ -n "$pids" ]; then kill $pids; sleep 1; fi

echo "== resetting odontoflow_e2e schema =="
psql -h localhost -p 5434 -U odontoflow -d odontoflow_e2e \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" >/dev/null

echo "== migrating to head =="
(cd "$BACKEND_DIR" && "$BACKEND_DIR/.venv/bin/python" -m alembic upgrade head)

echo "== starting backend on :$PORT =="
(cd "$BACKEND_DIR" && DATABASE_URL="$DATABASE_URL" setsid \
  "$BACKEND_DIR/.venv/bin/python" -m uvicorn app:app --host 127.0.0.1 --port "$PORT" \
  > /tmp/opencode/uvicorn-e2e.log 2>&1 < /dev/null & disown)
for _ in $(seq 1 20); do
  curl -sf --max-time 2 "http://127.0.0.1:$PORT/health" >/dev/null && break
  sleep 1
done
curl -sf --max-time 2 "http://127.0.0.1:$PORT/health" >/dev/null \
  || { echo "backend failed to start"; tail -20 /tmp/opencode/uvicorn-e2e.log; exit 1; }

echo "== running pilot E2E (NEXT_PUBLIC_USE_MOCKS=false) =="
(cd "$FRONTEND_DIR" && NEXT_PUBLIC_USE_MOCKS=false NEXT_PUBLIC_BACKEND_URL="http://127.0.0.1:$PORT" \
  npx vitest run --config vitest.e2e.config.ts test/pilot-e2e.test.ts)