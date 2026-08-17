# M4 Pilot E2E — Evidence

**Date:** 2026-08-17 · Deterministic shell (Pane 2) · DeepSeek V4 Flash final review (Pane 5)

## Harness

- Real stack: `VITE_USE_MOCKS=false` · real FastAPI (`uvicorn app:app` :8010) ·
  real PostgreSQL `odontoflow_e2e` (:5434), migrated to HEAD `0008`.
- Reset + run: `scripts/pilot-e2e.sh` (DROP SCHEMA → `alembic upgrade head` →
  uvicorn → vitest). Every run starts from the same empty migrated schema, so
  the pilot's absolute assertions are reproducible.
- Spec: `test/pilot-e2e.test.ts` (self-seeding, idempotent within a fresh DB).
- Vitest wiring: `test/pilot-e2e.test.ts` added to `vitest.e2e.config.ts`
  include and to `vite.config.ts` test.exclude (not run by `npm test`);
  excluded from the NodeNext `tsconfig.backend.json` compile (integration spec,
  same policy as the existing agenda/patients integration tests).

## Journey (12 assertions, all real HTTP → real DB)

| # | Step | Proof |
|---|---|---|
| 1–2 | Patient + Appointment (booked, state `confirmed`) at Sede Lince | `api.createPatient` + `client.bookAppointment` (real client, Idempotency-Key) |
| 3 | Visit from the confirmed appointment (location derived) | `POST /visits {patient_id, appointment_id}` → `location_id = Lince` |
| 4 | ServiceExecution recorded | `POST /visits/{id}/executions {service_id, executed_price: 150}` |
| 5–6 | ServiceConsumption at the Visit Location | `POST /executions/{id}/consumptions {product_id, quantity: 2, unit_price: 5}` |
| 7 | SALIDA at the correct Location | `client.listMovements(product, Lince)` contains `SALIDA` qty 2 |
| 8 | Other Location unchanged | `client.getBalance(product, Jesús María)` unchanged (0) |
| 9 | Charge created | `POST /executions/{id}/charges {amount: 150}` |
| 10 | Partial (50) then full (100) payment | `api.registerPayment` → paid 150, outstanding 0 |
| 10a | Overpayment rejected with the real envelope | `toApiError` → `INVALID_INPUT` 422, message contains "exceeds" |
| 11 | CashPage reflects paid/outstanding | `api.loadCharges()` (the exact page adapter) → `paid=150 outstanding=0 status=Pagado`, `sumOutstanding=0` |
| 12 | InventoryPage reflects the new Location balance | `api.loadProductBalance(product, Lince)` → `available=8` (10 − 2 consumed) |
| 13–14 | Transfer 3 units Lince → Jesús María | `api.registerTransfer` → balances 5/3, total conserved; kardex TRANSFER_OUT/TRANSFER_IN share `transfer_id` |
| — | Kardex + audit trail | Lince: ENTRADA/SALIDA/TRANSFER_OUT; Jesús María: TRANSFER_IN |
| — | Location-isolated adjustment | `-1` at Jesús María → 2; Lince unchanged |

## Results

- Pilot E2E: **12/12 PASS** (`test/pilot-e2e.test.ts`).
- Agenda regression (real backend): **3/3 PASS**.
- Patients regression (real backend): **3/3 PASS**.
- Unit: **83 PASS** (9 files) · `npm run typecheck` PASS · `npm run build` PASS.

## Final review (opencode-go/deepseek-v4-flash, read-only, ONE pass)

Verdict: **PASS — no blockers.**

- Frontend/backend contract correctness: generated TS contracts regenerate from
  backend OpenAPI at 28d1e22 (transfers, location_id on bodies/query, Movement/
  Balance/Transfer schemas). Adapters map exactly the real fields; nothing
  invented.
- Zero fake inventory/cash data in real mode: `useMocks` gate on every adapter;
  real-mode paths hit only the documented endpoints; Inventory/Cash pages never
  render mock rows with `VITE_USE_MOCKS=false` (E2E proves it by construction).
- Location/tenant correctness: consumption SALIDA at the Visit Location; balance
  isolated per Product × Location; transfer conserves total; cross-location
  adjustments don't leak (all proven end-to-end).
- Transfer UI semantics: origin/destination selects + quantity; backend enforces
  distinct locations / floor; envelope errors surfaced.
- Payment semantics: partial/full flows correct; overpayment rejected by the
  backend envelope (`INVALID_INPUT`) and surfaced via `toApiError`.
- Regressions: Agenda, Patients and Cash pages untouched; unit + real-backend
  regressions green.

### One repair (single repair pass, applied)

- Mock-mode overpayment error code aligned to the real backend (`INVALID_INPUT`,
  was `PAYMENT_EXCEEDS_OUTSTANDING`): `src/api.ts` + `test/cash-adapter.test.ts`
  + `test/cash-transport.test.ts`. Real-mode behavior was already correct.

## Files (frontend, this milestone)

- `src/contracts/api.ts` regenerated (location-aware surface).
- `src/contracts/client.ts` inventory + cash client functions.
- `src/api.ts` inventory adapters + overpayment code alignment.
- `src/types.ts` Product/Location/Balance/Movement/Transfer view models.
- `src/pages/InventoryPage.tsx` full real rewrite (products, balance by
  Location, entries, adjustments, kardex, transfers; no fake category/minimum/
  supplier/KPIs).
- `src/mockData.ts` reshaped mock store (mock mode only).
- `test/inventory-adapter.test.ts` (29 tests) · `test/pilot-e2e.test.ts`
- `scripts/pilot-e2e.sh` · `vite.config.ts`/`vitest.e2e.config.ts`/
  `tsconfig.backend.json` wiring.
- `.audit/m4-pilot-fit/inventory-ui.md` (writer evidence), `frontend-contract-map.md`
  (Pane C), `cash-real.md` (M4.1).