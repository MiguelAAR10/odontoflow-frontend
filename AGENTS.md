# AGENTS.md — OdontoFlow Frontend

Operating contract for every agent (human or AI) working in this repository. Read before touching code.

## 1. What this repo is (and is not)

- It is the **React SPA** for OdontoFlow, a deterministic, multi-tenant clinic operations platform.
- It is an **adapter layer over a real backend contract** — the backend
  (`../odontoflow-backend`, FastAPI + PostgreSQL) is the domain authority. Prices, durations, stock,
  payments, availability and permissions live there. This repo decides **presentation and view models only**.
- It is **not** a source of business truth. It is **not** the simulator: `src/domain/`, `src/simulation/`
  and `src/server.ts` are a legacy follow-up harness — **reference only**, do not build on it.

## 2. Non-negotiable rules

1. **Contracts are generated, never handwritten.** `src/contracts/api.ts` is regenerated from the
   backend's `docs/api/openapi.yaml` with `openapi-typescript`. After the backend OpenAPI changes:
   regenerate, verify the diff, then add typed client functions in `src/contracts/client.ts` following
   the existing style. Never edit `api.ts` by hand.
2. **The backend is the authority; never invent backend behavior.**
   - No calls to paths that don't exist in the generated contract (e.g. `/cash/*`, `/inventory/purchases`).
   - No extra body fields: backend schemas use `extra="forbid"`.
   - No fabricated domain values in the UI: no fake branch/party/owner on charges, no category/minimum/
     supplier/expiry/KPIs on products, no client-side money math that hides a backend rejection.
   - If a screen shows data the backend doesn't project, hide it or derive it from real values — never fake it.
3. **Dual mode must stay honest.** Every data function goes through the `useMocks` seam in `src/api.ts`.
   With `VITE_USE_MOCKS=false` the app must consume **zero** mock business data. Mock mode exists for
   design work and must mirror the real rules (overpayment rejected, insufficient stock rejected,
   adjustments require a reason) so behavior matches.
4. **One error envelope.** All failures map through `toApiError` → `ApiError {code, message, httpStatus}`
   and the UI renders `message`. Never parse backend SQL/stack traces.
5. **Idempotency is per intent.** Every mutation sends an `Idempotency-Key`
   (`newIdempotencyKey()` per user intent, e.g. one per payment attempt). A retry of the same intent must
   reuse the same key so the backend replays instead of double-mutating.

## 3. How to work here

1. Read the generated contract (`src/contracts/api.ts`) and the existing adapter (`src/api.ts`) before
   writing code — the `toUi*` mapping pattern is the house style.
2. Small, surgical changes; preserve visual quality and existing behavior.
3. Tests are part of the task:
   - unit/adapter tests in `test/` (`vitest`, mocked axios at the transport boundary for real-mode paths);
   - do **not** break `npm run typecheck`, `npm test`, `npm run build`;
   - after backend contract changes, the real-backend integration suite and the pilot E2E must pass
     (`scripts/pilot-e2e.sh` — reset, migrate, boot FastAPI, run the no-mock journey).
4. Do not commit until the integration lead fans in (verification is the lead's gate).

## 4. Verification commands

```bash
npm run typecheck                          # both tsconfigs
npm test                                   # unit + adapter suites (83 tests)
npm run build                              # vite build + tsc backend
./scripts/pilot-e2e.sh                     # deterministic real-backend E2E (needs :5434 + backend venv)
# or manually:
VITE_USE_MOCKS=false VITE_BACKEND_URL=http://127.0.0.1:8010 \
  npx vitest run --config vitest.e2e.config.ts   # pilot + agenda + patients integration
```

## 5. Test wiring (why some tests are excluded)

`vite.config.ts` `test.exclude` keeps integration specs out of `npm test` (they need a live backend):
`test/agenda-integration.test.ts`, `test/patients-integration.test.ts`, `test/pilot-e2e.test.ts`.
`vitest.e2e.config.ts` includes exactly those three. `tsconfig.backend.json` (NodeNext) excludes them the
same way. A new integration spec must be registered in all three places.

## 6. Do not

- Do not inspect or modify `../../medistock` (read-only legacy).
- Do not modify the backend from this repo; backend defects get reported to the backend lead.
- Do not remove the generated-contract workflow to "simplify" — regeneration is the contract's source of
  truth.
- Do not treat `mockData.ts` as authoritative for anything beyond design-time visuals.