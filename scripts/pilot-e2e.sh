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
BACKEND_DIR="${PILOT_BACKEND_DIR:-$FRONTEND_DIR/../odontoflow-backend}"
BACKEND_DIR="$(cd "$BACKEND_DIR" && pwd)"
export PGPASSWORD=odontoflow
export DATABASE_URL="postgresql+psycopg://odontoflow:odontoflow@localhost:5434/odontoflow_e2e"
PORT="${PILOT_E2E_PORT:-$($BACKEND_DIR/.venv/bin/python -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')}"
# Only this harness may reset the dedicated E2E database.
exec 9>/tmp/odontoflow-pytest-odontoflow_e2e.lock
flock 9
export AIRI_E2E_CONFIG
AIRI_E2E_CONFIG="$(mktemp /tmp/airi-e2e-config.XXXXXX)"
SERVER_LOG="$(mktemp /tmp/airi-e2e-backend.XXXXXX)"
backend_pid=""
cleanup() {
  if [ -n "$backend_pid" ]; then kill "$backend_pid" 2>/dev/null || true; wait "$backend_pid" 2>/dev/null || true; fi
  rm -f "$AIRI_E2E_CONFIG" "$SERVER_LOG"
}
trap cleanup EXIT

if ! psql -h localhost -p 5434 -U odontoflow -d odontoflow -tAc "SELECT 1 FROM pg_database WHERE datname='odontoflow_e2e'" | rg -q 1; then
  createdb -h localhost -p 5434 -U odontoflow odontoflow_e2e
fi

echo "== resetting odontoflow_e2e schema =="
psql -h localhost -p 5434 -U odontoflow -d odontoflow_e2e \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" >/dev/null

echo "== migrating to head =="
(cd "$BACKEND_DIR" && "$BACKEND_DIR/.venv/bin/python" -m alembic upgrade head)

echo "== starting backend on :$PORT =="
(cd "$BACKEND_DIR" && exec "$BACKEND_DIR/.venv/bin/python" -m uvicorn app:app --host 127.0.0.1 --port "$PORT") > "$SERVER_LOG" 2>&1 &
backend_pid=$!
for _ in $(seq 1 20); do
  curl -sf --max-time 2 "http://127.0.0.1:$PORT/health" >/dev/null && break
  sleep 1
done
curl -sf --max-time 2 "http://127.0.0.1:$PORT/health" >/dev/null \
  || { echo "backend failed to start"; tail -20 "$SERVER_LOG"; exit 1; }

"$BACKEND_DIR/.venv/bin/python" "$FRONTEND_DIR/scripts/seed-airi-e2e.py" "$BACKEND_DIR" "$AIRI_E2E_CONFIG"

echo "== running pilot E2E (NEXT_PUBLIC_USE_MOCKS=false) =="
(cd "$FRONTEND_DIR" && NEXT_PUBLIC_USE_MOCKS=false NEXT_PUBLIC_BACKEND_URL="http://127.0.0.1:$PORT" \
  npx vitest run --config vitest.e2e.config.ts test/pilot-e2e.test.ts test/service-to-cash-integration.test.ts)

echo "== running AIRI through the real backend and BFF =="
"$BACKEND_DIR/.venv/bin/python" "$FRONTEND_DIR/scripts/seed-airi-e2e.py" "$BACKEND_DIR" "$AIRI_E2E_CONFIG" --scenario
(cd "$FRONTEND_DIR" && NEXT_PUBLIC_USE_MOCKS=false NEXT_PUBLIC_BACKEND_URL="http://127.0.0.1:$PORT" \
  npx vitest run --config vitest.e2e.config.ts test/airi-integration.test.ts)
