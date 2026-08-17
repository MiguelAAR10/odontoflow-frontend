# OdontoFlow Frontend

React SPA for OdontoFlow, a deterministic, multi-tenant clinic operations platform. This repo is the UI
that **adapts to the backend contract** — the backend (`../odontoflow-backend`, FastAPI + PostgreSQL) is
the domain authority: prices, durations, stock, payments and availability are decided there, never here.

> **Status (M4 Pilot Fit CLOSED):** Agenda, Patients, Cash and Inventory are **REAL** against the live
> backend. Chat and Agent remain prototypes. With `VITE_USE_MOCKS=false` the app consumes **zero** mock
> business data — proven by the no-mock pilot E2E (`test/pilot-e2e.test.ts`).

## What each screen does (and where its truth lives)

| Screen | State | Backend authority |
|---|---|---|
| Agenda | REAL | `/appointments` (+book/reschedule/cancel), `/slots/query`, `/locations`, `/leads`, `/services`, `/practitioners/eligible` |
| Patients | REAL | `/patients` |
| Cash | REAL | `/charges`, `/charges/{id}`, `/charges/{id}/payments` (paid/outstanding derived; 'Por cobrar' = Σ outstanding) |
| Inventory | REAL | `/products`, `/locations`, `/products/{id}/balance?location_id`, `/movements`, `/entries`, `/adjustments`, `/transfers` |
| Chat | PROTOTYPE | — (no backend authority yet) |
| Agent | PROTOTYPE | — (no backend authority yet) |

The UI never invents domain values: no fake branch/party/owner on charges, no category/minimum/supplier/
KPIs on products, no client-side money math that hides a backend rejection. What the backend does not
project, the UI hides or derives from real data.

## Mental model

- **Product is not stock.** Creating a product (`{name, unit, kind}`) and adding stock (an entry at a
  location) are separate actions, exactly as the backend models them.
- **Stock lives per Product × Location.** Balance is read per location; movements (kardex), entries,
  adjustments and transfers all carry a location.
- **Dual-mode adapter seam.** Every data function goes through `src/api.ts`: with `VITE_USE_MOCKS=true`
  (default for design work) it serves typed mock data; with `false` it calls the real FastAPI endpoints.
  Real mode is the mode that matters — tests assert it by construction.

## Stack

| Layer | Choice |
|---|---|
| SPA | React 18 + TypeScript + Vite (+ Tailwind for styles) |
| Routing | React Router (`/agenda`, `/pacientes`, `/caja`, `/inventario`, `/chat`, `/agente`) |
| HTTP | Axios (`src/contracts/client.ts`, `baseURL = VITE_BACKEND_URL`) |
| Contracts | Generated from backend OpenAPI via `openapi-typescript` → `src/contracts/api.ts` (never handwritten) |
| Tests | Vitest — unit/adapter tests (`npm test`) + real-backend integration & pilot E2E (`npm run test:e2e`) |
| Simulator | Node + dedicated PostgreSQL (legacy follow-up harness, reference only — see `docs/`) |

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `VITE_BACKEND_URL` | `http://127.0.0.1:8010` | Base URL of the real FastAPI backend |
| `VITE_USE_MOCKS` | `true` | `true` → typed mocks from `src/mockData.ts`; `false` → real HTTP calls |

See `.env.example`.

## Quick start

```bash
npm install
npm run dev          # SPA at http://127.0.0.1:5173 (mock mode by default)

# Verify everything (unit + types + build)
npm run typecheck
npm test
npm run build
```

### Real mode + E2E (requires the backend)

1. Start PostgreSQL on :5434 and migrate the backend to HEAD 0008.
2. Run FastAPI on :8010 against a database with fixtures (see the backend README).
3. Run the no-mock proof — one deterministic journey (Patient → Appointment → Visit → Execution →
   Consumption → Charge → Payment → Cash/Inventory state → Transfer):

```bash
VITE_USE_MOCKS=false VITE_BACKEND_URL=http://127.0.0.1:8010 \
  npx vitest run --config vitest.e2e.config.ts test/pilot-e2e.test.ts

# reproducible from zero: resets odontoflow_e2e, migrates, boots the backend, runs the pilot
./scripts/pilot-e2e.sh
```

## Repository layout

```
src/
  App.tsx              # SPA routes
  api.ts               # the adapter seam: toUi* view models + real/mock dispatch
  contracts/
    api.ts             # GENERATED from backend OpenAPI (openapi-typescript)
    client.ts          # typed HTTP client + ApiError envelope (never hand-typed endpoints)
  types.ts             # UI view models (typed over the generated contract)
  mockData.ts          # design-time mocks — never consumed in real mode
  pages/               # AgendaPage, PatientsPage, CashPage, InventoryPage, ChatPage, AgentPage
  components/          # AppShell, Badge, Button, DataTable, KpiCard, Modal, Header, Navbar
  domain/  simulation/ # legacy simulator (reference only)
  server.ts            # legacy simulation harness (reference only)
test/                  # unit/adapter tests + integration + pilot-e2e (see docs/frontend-architecture.md)
scripts/pilot-e2e.sh   # deterministic E2E harness (reset → migrate → boot → run)
docs/                  # architecture & run guides
```

## Rules for contributors

1. **Contracts are generated, never written.** After the backend OpenAPI changes: regenerate
   `src/contracts/api.ts` and add typed client functions in `src/contracts/client.ts` matching the
   existing style. Verify the regenerated diff before writing adapters.
2. **The backend is authority.** Never send fields the contract does not define (`extra=forbid`), never
   call paths that don't exist, never invent domain values in the UI.
3. **One envelope.** All errors map through `toApiError` → `ApiError {code, message, httpStatus}` and are
   rendered from `message`.
4. **Mock mode mirrors the real rules** (reject overpayment, insufficient stock, zero adjustments…) so
   design work behaves like production — but real mode is what ships.
5. **Keep regressions green:** `npm run typecheck`, `npm test`, `npm run build`, and after backend
   changes the real-backend integration suite.

Full detail: [`docs/frontend-architecture.md`](docs/frontend-architecture.md) and [`AGENTS.md`](AGENTS.md).