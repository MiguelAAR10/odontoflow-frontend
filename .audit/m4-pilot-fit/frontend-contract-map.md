# Frontend Contract Map — M4 Pilot Fit

Read-only audit (DeepSeek V4 Flash, Pane C). Goal: prevent the frontend writer
(Pane B) from inventing backend behavior.

Sources inspected:

- `src/pages/CashPage.tsx` (HEAD 2908cd1)
- `src/pages/InventoryPage.tsx` (HEAD 2908cd1)
- `src/api.ts`, `src/types.ts`, `src/mockData.ts`
- `src/contracts/api.ts` (generated) + `src/contracts/client.ts`
- Backend OpenAPI (HEAD c85ccd8, `docs/api/openapi.yaml`, 31 paths) and
  `app/inventory/models.py` — inventory is **org-level only** today
  (`inventory_movements` has no `location_id`); Product × Location + transfers
  are the *emerging* Pane A surface, not yet in any OpenAPI.

Classification vocabulary:

| Tag | Meaning |
|---|---|
| MATCH | Backend endpoint exists with compatible shape; consume via generated types. |
| VIEWMODEL_ADAPTER | Backend exists but path/shape differs; map in `api.ts` (Agenda/Patients pattern). |
| BACKEND_GAP | No backend authority for the action; must NOT be invented by the frontend. |
| PROTOTYPE | Hardcoded UI chrome/data (KPIs, pagination, banners); not API-backed. |
| DEFER | Explicitly out of the M4 supported set (accounting, cash closing, suppliers, purchases, commissions, payment links). |

---

## 1. Real economic surface (Cash authority, exists today)

| Endpoint | Payload → Result | Status |
|---|---|---|
| `GET /charges` (opt. `execution_id`) | `ChargeRead[]` `{id, service_execution_id, amount, paid, outstanding, created_at}` | MATCH — the charge list IS the cash-visible economic state |
| `GET /charges/{id}` | `ChargeRead` | MATCH |
| `GET /charges/{id}/payments` | `PaymentRead[]` `{id, charge_id, amount, method, paid_at}` | MATCH |
| `POST /charges/{id}/payments` `{amount, method}` | `PaymentRead` | MATCH — payment recording (money correctness path) |
| `POST /executions/{id}/charges` `{amount?}` | `ChargeRead` | MATCH — charge creation (if the UI ever needs it) |

There is **no** `/cash/*` path. CashPage's `GET /cash/movements` and
`POST /cash/movements` calls have no backend counterpart.

## 2. Real inventory surface (authority, exists today)

| Endpoint | Payload → Result | Status |
|---|---|---|
| `GET /products` (opt. `search`, `kind`) | `ProductRead[]` `{id, name, unit, kind, is_active}` | MATCH (path differs from UI: `/inventory/products`) |
| `POST /products` | `{name, unit, kind}` → `ProductRead` | MATCH — note: **no** category/branch/stock/minimum fields |
| `GET /products/{id}` | `ProductRead` | MATCH |
| `POST /products/{id}/entries` | `{quantity, unit_price?}` → `MovementRead` | MATCH — the only stock-entry path (no `/inventory/purchases`) |
| `POST /products/{id}/adjustments` | `{quantity, reason}` → `MovementRead` | MATCH |
| `GET /products/{id}/movements` | `MovementRead[]` (kardex) | MATCH |
| `GET /products/{id}/balance` | `BalanceRead` `{product_id, available}` | MATCH |
| `GET /executions/{id}/consumptions` | `ServiceConsumptionRead[]` | MATCH — clinical consumption read |

Emerging (Pane A, not yet generated): `location_id` scope on movements/balance,
consumption at execution Location, transfers. Pane B Phase 2 must wait for the
regenerated contracts.

## 3. Generated contracts — drift (blocker)

`src/contracts/api.ts` at HEAD 2908cd1 is **stale**: it lacks
`/products/{product_id}/entries|adjustments|movements|balance` although they
exist in backend OpenAPI (added in backend 9bb7361). It also lacks all
emerging Location-scoped paths. Regeneration is mandatory before Pane B Phase 2.

---

## 4. CashPage — every visible action

| # | Visible action | Current call | Verdict | Note for Pane B |
|---|---|---|---|---|
| C1 | Load movements list | `GET /cash/movements` (mock) | **BACKEND_GAP** | No such path. Real source = `GET /charges` (+ `GET /charges/{id}/payments` for method/time). Rewrite the adapter, do NOT invent a cash-movement API. |
| C2 | "Nuevo ingreso" / "Registrar egreso" modal (party, concept, amount, type) | `POST /cash/movements` | **DEFER** (income/expense = accounting) | Not in the supported set. Only payment recording is real: `POST /charges/{id}/payments {amount, method}` (C3). |
| C3 | Record a payment against a charge | — | **MATCH** | `POST /charges/{id}/payments`; idempotency pattern per Agenda client. |
| C4 | KPI "Ingresos del día" / "Egresos del día" / "Saldo neto" (hardcoded) | none | **PROTOTYPE** → **DEFER** | Income/expense split is accounting; no aggregation endpoint. Not real in M4. |
| C5 | KPI "Por cobrar" | hardcoded | **VIEWMODEL_ADAPTER** | Derivable client-side: `Σ(charge.amount − charge.paid)` = `Σ outstanding` from `GET /charges`. |
| C6 | Table row: amount, method, time, status | CashMovement fields | **VIEWMODEL_ADAPTER** | Map `ChargeRead.amount/paid/outstanding/created_at` + `PaymentRead.method/paid_at`; status = paid vs outstanding. |
| C7 | Table row: branch ("Sede") | `item.branch` | **DEFER** | `ChargeRead` projects no location (visit→location chain is server-side only). No data source → do not fabricate. |
| C8 | Table row: party / concept / owner | `item.party/concept/owner` | **DEFER** | Not projected by backend. Render charge id / service_execution_id instead. |
| C9 | Branch filter (Lince/Jesús María/Magdalena) | hardcoded options | **PROTOTYPE** → **DEFER** | Option list should come from `GET /locations` when used; but charges carry no location → filter inert in M4. |
| C10 | Method filter | hardcoded options | **VIEWMODEL_ADAPTER** | Filter over real `PaymentRead.method` values (free string in backend; keep the client vocabulary as a hint list only). |
| C11 | Search by patient/concept | local filter | **VIEWMODEL_ADAPTER** | Filter over the mapped rows (no backend search for charges). |
| C12 | Tabs "Comisiones", "Links de pago", "Cierres de caja" | stub panels | **DEFER** | Out of supported set. |
| C13 | Cash status bar ("Caja abierta/cerrada", "Inicio 08:00") | local state | **PROTOTYPE** → **DEFER** | Cash closing explicitly excluded. |
| C14 | "Cerrar caja" modal / "Ver arqueo" | local state | **DEFER** | Cash closing / arqueo not built. |
| C15 | Pagination footer (pages, rows-per-page) | hardcoded | **PROTOTYPE** | Client-side slice is fine; no backend pagination. |
| C16 | Loading / error states | none | **BACKEND_GAP** | M4 requires loading/error states per the real charge calls (use `toApiError` envelope). |

## 5. InventoryPage — every visible action

| # | Visible action | Current call | Verdict | Note for Pane B |
|---|---|---|---|---|
| I1 | Load products list | `GET /inventory/products` (mock) | **BACKEND_GAP** (path) + **VIEWMODEL_ADAPTER** (shape) | Real = `GET /products` → `ProductRead` (no stock/branch/minimum/category/status). Balance per Location comes from the *emerging* balance endpoint; per-location stock is NOT a product attribute. |
| I2 | "Nuevo producto" modal: category, branch, stock inicial, minimum | `POST /inventory/products` | **VIEWMODEL_ADAPTER** + **BACKEND_GAP** | Send only `{name, unit, kind}`. category/branch/stock inicial/minimum are not accepted (`extra=forbid`). Initial stock must go through `POST /products/{id}/entries` after creation (MATCH). |
| I3 | "Registrar compra" (quantity, provider) | `POST /inventory/purchases` | **VIEWMODEL_ADAPTER** + **DEFER** | Real = `POST /products/{product_id}/entries {quantity, unit_price?}`. "Proveedor" field = suppliers → DEFER. |
| I4 | Kardex / movements display | — (no UI) | MATCH (endpoint) / DEFER (UI) | `GET /products/{id}/movements` exists; emerging adds Location scope. |
| I5 | Balance per branch | — | **MATCH** (emerging) | `GET /products/{id}/balance` will be Location-scoped after Pane A; wait for regenerated contracts. |
| I6 | Transfers between branches | — | **BACKEND_GAP** (emerging) | Pane A endpoint, not yet in OpenAPI. No UI before contracts exist. |
| I7 | Branch filter + "Sede" column | product.branch (mock) | **VIEWMODEL_ADAPTER** | After Pane A: filter/join over per-Location balance rows. Today: no data source. |
| I8 | Category filter + "Tipo: Todos" | hardcoded categories | **VIEWMODEL_ADAPTER** | Map backend `kind` (`consumible`/`reventa`) to the Tipo list. The category vocabulary (Material restaurador…) is client-only → PROTOTYPE. |
| I9 | KPI cards (128 productos, 7 stock bajo, 3 por vencer, S/ 24,850 valor) | hardcoded | **PROTOTYPE** | No aggregation endpoints; "valor" would need unit_price × balance math not built. |
| I10 | Alert banner "7 productos necesitan reposición" | hardcoded | **PROTOTYPE** | No reorder-level logic (`minimum` not in backend). |
| I11 | Stock bar / status tone (Disponible/Stock bajo/Crítico) | derived from stock vs minimum | **VIEWMODEL_ADAPTER** | Compute from per-Location balance once available; "Crítico"/minimum is client-invented today → PROTOTYPE until a minimum exists. |
| I12 | Pagination footer | client-side slice | **PROTOTYPE** | Fine client-side; no backend pagination. |
| I13 | Tabs "Compras", "Consumo", "Proveedores" | stub panels | **DEFER** | Purchasing workflow, suppliers, procurement not built. "Consumo" could later read `GET /executions/{id}/consumptions` (MATCH) but no list-all endpoint → DEFER for M4. |

## 6. `src/api.ts` adapter — verdicts

| Function | Verdict |
|---|---|
| `getOrMock` / dual-mode seam | MATCH — keep (Agenda/Patients pattern) |
| `getCashMovements`, `createCashMovement` | **BACKEND_GAP** — rewrite against `/charges` + `/charges/{id}/payments` (Phase 1) |
| `getProducts`, `createProduct`, `registerPurchase` | **BACKEND_GAP** (path) — rewrite against `/products`, `/products/{id}/entries` (Phase 2) |
| `toUi*` mapping pattern | MATCH — reuse for Charge/Payment/Product/Balance view models |

## 7. Hard guardrails for Pane B

1. Do not add `/cash/*`, `/inventory/*`, `/inventory/purchases` calls anywhere — those paths do not exist.
2. Do not send `category`, `branch`, `stock`, `minimum`, `provider`, `party`, `concept`, `owner` to any backend mutation — schemas are `extra=forbid`.
3. Do not fabricate a branch/location on charges or products — no backend projection exists.
4. Charge list/read, amount, paid, outstanding, payment recording, loading/error states = the ONLY real Cash scope for M4.
5. Phase 2 starts only after regenerating TypeScript contracts from the new backend OpenAPI (stale today).
6. No mock business data in real mode (`VITE_USE_MOCKS=false`) for Cash/Inventory after Phase 1/2.

## 8. Priorities for the backend (for Pane A visibility, read-only note)

- Cash UI needs `GET /charges` list + `POST /charges/{id}/payments` — both already exist (no backend work needed for Phase 1).
- Inventory Phase 2 depends on the emerging Product × Location surface (movements/balance per Location, entries/adjustments at Location, consumption at execution Location, transfers).
- A `location_name` projection on ChargeRead is the only missing piece that would unblock the "Sede" column/filter on Cash (out of Pane A scope — flag as future, do not build).

Generated 2026-08-16 · HEAD frontend 2908cd1 · HEAD backend c85ccd8 · Pane C, read-only.
