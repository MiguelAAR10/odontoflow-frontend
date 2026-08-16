# Cash — Real UI (M4 Phase 1) — Evidence

Pane B (frontend writer) · HEAD `2908cd1` + cash-real changes · 2026-08-16
Followed `frontend-contract-map.md` (Pane C) guardrails exactly.

## What changed

| File | Change |
|---|---|
| `src/types.ts` | Removed `CashMovement` (fabricated income/expense shape). Added `Payment` + `Charge` view models built on the real domain truth `Charge {amount, paid, outstanding, created_at, payments[]}`. `branch/party/concept/owner` kept as documented mock-only fields (empty in real mode). |
| `src/mockData.ts` | Replaced `cashMovements` (6 mixed income/expense rows, incl. a supplier expense) with `mockCharges` (5 charges with real paid/outstanding/payments). Mock mode now mirrors the real model. |
| `src/contracts/client.ts` | Added generated-type aliases `ChargeRead`/`PaymentRead` and typed functions `listCharges` (GET /charges), `getCharge` (GET /charges/{id}), `listPayments` (GET /charges/{id}/payments), `createPayment` (POST /charges/{id}/payments with `Idempotency-Key` header). Style matches the existing Agenda client. |
| `src/api.ts` | Removed `getCashMovements`/`createCashMovement` (`/cash/movements` — BACKEND_GAP). Added the charge/payment adapter following the `toUi*` pattern: `toMoneyNumber`, `toUiPayment`, `toUiCharge` (status derived from real paid/outstanding), `sumOutstanding` ('Por cobrar' = Σ outstanding), `sumPaid`, `loadCharges` (GET /charges + payments per charge), `loadChargePayments`, `registerPayment` (Idempotency-Key per payment intent; overpayment/unknown/invalid are rejected with the backend envelope in both modes — no client-side fake math). |
| `src/pages/CashPage.tsx` | Rewritten around charges: real KPI row (Cobrado = Σ paid, Por cobrar = Σ outstanding, Cargos = count), charge table (Cargo # / Ejecución #, Fecha, Monto, Pagado, Por cobrar, Medios de pago, Estado badge), payment modal with payment history + register-payment form (partial/full flows, "Pagar todo" fills the input only — the backend still validates), loading state, backend-envelope error banner + retry, refresh-after-payment. Mock-only columns (Sede/Paciente/Concepto) render **only** when `VITE_USE_MOCKS=true`. |
| `src/index.css` | Added `.form-error`, `.payment-list`, `.payments-title`, `.text-muted`, `.data-table td .badge + .badge` (small additions for the new modal/history rendering). |
| `tsconfig.json` / `tsconfig.backend.json` | Registered the two new test files (same wiring as existing adapter tests). |
| `test/cash-adapter.test.ts` | 15 tests, pure adapter (mock seam, no network). |
| `test/cash-transport.test.ts` | 6 tests, mocked-axios transport (real mode) — no live server. |

## Real contract consumed (nothing invented)

- `GET /charges` — the charge list IS the cash-visible economic state
- `GET /charges/{id}` — typed client (available; page loads via list + payments)
- `GET /charges/{id}/payments` — payment history per charge
- `POST /charges/{id}/payments` — `{amount, method}` with `Idempotency-Key`

No `/cash/*`, no `/inventory/*` calls added. No branch/party/concept/owner ever
sent to a mutation. No fabricated branch/location on charges.

## Adapter mapping

```
ChargeRead → Charge (view model)
  id                     → id: string
  service_execution_id   → serviceExecutionId
  amount (decimal str)   → amount: number (2dp)
  paid   (decimal str)   → paid: number
  outstanding (decimal)  → outstanding: number
  created_at             → createdAt (ISO)
  payments (PaymentRead) → payments: Payment[]
  status                 → derived: outstanding ≤ 0.004 → "Pagado"
                           paid ≤ 0.004 → "Pendiente" else "Parcial"

PaymentRead → Payment { id, amount, method, paidAt }
'Por cobrar' KPI = Σ outstanding over loaded charges (real derived value).
```

## Test evidence

`npm run typecheck` — PASS (both tsconfigs).
`npm run test` — **54 passed / 8 files** (21 new cash tests):

- cash-adapter (15): ChargeRead mapping (decimal strings, 2dp), payment mapping,
  status derivation, no fabricated location/party/owner in real mode,
  Σ outstanding = 400 / Σ paid = 950 over seed, loadCharges returns copies,
  partial payment (300 paid → 300/200 Parcial), full payment (→ 0 Pagado),
  **overpayment → ApiError `PAYMENT_EXCEEDS_OUTSTANDING` (422) with backend
  message, charge untouched**, INVALID_INPUT (0/negative/NaN),
  CHARGE_NOT_FOUND, refresh-after-payment via subsequent loadCharges.
- cash-transport (6, mocked axios, `VITE_USE_MOCKS=false`): list + per-charge
  payments wired to `/charges` and `/charges/{id}/payments`, Pendiente when no
  payments, POST body + `Idempotency-Key` header asserted, overpayment
  envelope → `ApiError` code/message/status (rendered by the page via
  `toApiError`), network failure → `NETWORK` error state, refresh-after-payment
  (reload reflects the server-applied balance).

Loading/error *page rendering* is covered at the adapter boundary (promise
fulfilled/rejected with the envelope) — this repo has no
`@testing-library/react`/jsdom, so React-state rendering tests are not
feasible without new deps; the page states themselves are wired to those
promises (`loading`/`error`/`paying`/`payError`).

`npm run build` — PASS (vite build + tsc backend; 1649 modules, no errors;
the `api.ts` dynamic-import chunking warning is pre-existing).

## Deferred / removed controls (per contract map)

- C1–C2: income/expense "Nuevo ingreso"/"Registrar egreso" modals — DEFER
  (accounting); `POST /cash/movements` removed entirely.
- C4: hardcoded "Ingresos/Egresos del día/Saldo neto" KPIs — replaced by real
  derived Cobrado / Por cobrar / Cargos.
- C7: "Sede" column — real mode hides it (no backend projection).
- C8: party/concept/owner — real mode renders charge id / execution id only.
- C9: branch filter — removed (no location data on charges).
- C12: tabs Comisiones / Links de pago / Cierres de caja — removed.
- C13–C14: cash status bar, "Cerrar caja", "Ver arqueo" — removed (cash
  closing / arqueo not built).
- C15: pagination footer — client-side count only; fake page buttons removed.
- Inventory vertical (`/inventory/*` + `registerPurchase`): untouched, gated
  on regenerated location-aware OpenAPI (Phase 2).

## BLOCKERS

None. Not started: backend server/live DB (per instructions — flows tested at
the adapter/client boundary only). Not committed (fan-in pending).
