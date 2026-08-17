# Inventory Real UI — M4.3 Evidence

Frontend writer (Pane B) delivery evidence. Backend authority: **MiguelAAR10/OdontoFlow
HEAD 28d1e22** (`docs/api/openapi.yaml`, 2365 lines) — location-aware inventory +
atomic transfers surface. Backend was **not** modified. Guardrails from
`.audit/m4-pilot-fit/frontend-contract-map.md` (Pane C) were followed.

---

## 1. Contract regeneration (Step 1)

Command (default openapi-typescript v7 format, same as the project's existing
generated file):

```
npx openapi-typescript ../odontoflow-backend/docs/api/openapi.yaml -o src/contracts/api.ts
```

The file at HEAD was stale (missing the whole location-aware surface). Regeneration
diff summary:

| Metric | Before | After |
|---|---|---|
| Lines | 2224 | 2574 (+350) |
| Paths added | — | 5 |

Paths added:
- `POST /products/{product_id}/entries` (EntryCreate → MovementRead)
- `POST /products/{product_id}/adjustments` (AdjustmentCreate → MovementRead)
- `POST /products/{product_id}/transfers` (TransferCreate → TransferRead)
- `GET /products/{product_id}/movements?location_id=` (MovementRead[], location_id **required**)
- `GET /products/{product_id}/balance?location_id=` (BalanceRead, location_id **required**)

Schemas added (none existed before): `EntryCreate`, `AdjustmentCreate`,
`MovementRead`, `BalanceRead`, `TransferCreate`, `TransferRead`.
`ProductRead`/`ProductCreate`/`LocationRead` already existed.

Verified generated types (scripted checks, all PASS):
- `EntryCreate.location_id` (required), `quantity` > 0, `unit_price?` nullable
- `AdjustmentCreate.location_id` (required), `quantity`, `reason` required
- `MovementRead.location_id` + `transfer_id: string | null`
- `BalanceRead.product_id` + `location_id` + `available` (decimal string)
- `TransferCreate.origin_location_id` / `destination_location_id` / `quantity` (required)
- `TransferRead.transfer_id` + `out_movement_id` + `in_movement_id`
- `POST /products/{product_id}/transfers` present with `post` operation
- balance/movements operations require `query.location_id` (non-optional)

---

## 2. What changed

### Files
- `src/contracts/api.ts` — regenerated (see §1).
- `src/contracts/client.ts` — added typed inventory clients: `listProducts`,
  `getProduct`, `createProduct`, `getBalance`, `listMovements`, `registerEntry`,
  `registerAdjustment`, `registerTransfer` (all with `Idempotency-Key` headers on
  mutations) + type re-exports (`ProductRead`, `BalanceRead`, `MovementRead`,
  `TransferRead`, `EntryCreate`, `AdjustmentCreate`, `TransferCreate`).
- `src/types.ts` — replaced the fabricated `Product` shape (category/branch/
  stock/minimum/status/tone/updated) with the real OpenAPI shape
  `{id, name, unit, kind, status(Activo|Inactivo)}`; added view models
  `InventoryLocation`, `InventoryBalance`, `MovementType`,
  `InventoryMovement`, `InventoryTransfer`.
- `src/api.ts` — new adapters (toUi\* pattern): `toUiProduct`, `toUiLocation`,
  `toUiBalance`, `toUiMovement`, `toUiTransfer`, `sumAvailable`; flows:
  `loadInventoryData`, `loadProductBalance`, `loadMovements` (newest first),
  `createProduct`, `registerEntry`, `registerAdjustment`, `registerTransfer`.
  **Removed** the fake `getProducts` (`/inventory/products`),
  `createProduct` (fake body), and `registerPurchase` (`/inventory/purchases`).
- `src/mockData.ts` — replaced the fake `products` rows with real-shape mock
  store (`mockProducts`, `mockLocations`, `mockBalances`, `mockMovements`) used
  **only** when `VITE_USE_MOCKS=true`. Real mode consumes zero mock rows.
- `src/pages/InventoryPage.tsx` — full rewrite (see §4).
- `src/components/Badge.tsx` — `statusTone` maps `"Inactivo"` → slate (additive).
- `src/index.css` — added `.row-actions` and `.text-danger` helpers.
- `tsconfig.json` / `tsconfig.backend.json` — include/exclude the new adapter test.

### Real surface wired (OpenAPI authority only)
| Action | Call |
|---|---|
| Products + Locations | `GET /products` + `GET /locations` |
| Balance by Product × Location | `GET /products/{id}/balance?location_id=` |
| Kardex per Product × Location | `GET /products/{id}/movements?location_id=` |
| Create product | `POST /products` `{name, unit, kind}` |
| Stock entry at Location | `POST /products/{id}/entries` `{location_id, quantity, unit_price?}` |
| Signed adjustment + reason | `POST /products/{id}/adjustments` `{location_id, quantity, reason}` |
| Transfer between Locations | `POST /products/{id}/transfers` `{origin_location_id, destination_location_id, quantity, reason?}` |

All mutations use `Idempotency-Key` (`newIdempotencyKey()`) per the PF4 pattern.

### Correct mental model (per task)
`CREATE PRODUCT = {name, unit, kind}` — stock is **not** a product attribute.
`ADD STOCK = entry {location, quantity, unit_price?}`. Initial stock goes through
entries after product creation; the form no longer asks for "stock inicial".

---

## 3. Adapter mapping

- `toUiProduct`: `ProductRead {id,name,unit,kind,is_active}` → `{id, name, unit,
  kind, status}` where `status` is derived from the real `is_active` (Activo/Inactivo).
  No category/branch/stock/minimum are fabricated.
- `toUiLocation`: `LocationRead` → `InventoryLocation` (1:1).
- `toUiBalance`: `BalanceRead.available` (decimal string) → number via the shared
  `toMoneyNumber` decimal parser.
- `toUiMovement`: `MovementRead` → `InventoryMovement`; decimal `quantity`/`unit_price`
  parsed; nullable `reason`/`transfer_id` preserved.
- `toUiTransfer`: `TransferRead` → `InventoryTransfer`; decimal `quantity` parsed.
- `sumAvailable`: Σ `available` over real balance rows (the "Unidades en stock" KPI).

Mock-mode flows mirror the real backend rules (same envelope codes, from
`app/errors.py`): entries require positive quantity; adjustments require nonzero
quantity + reason + sufficient stock on negative; transfers require distinct
locations + sufficient origin stock. Errors surface via `ApiError` (e.g.
`INVALID_INPUT` 422, `PRODUCT_NOT_FOUND`/`LOCATION_NOT_FOUND` 404).

---

## 4. InventoryPage (rebuilt)

Layout mirrors CashPage: page heading, real-derived KPI grid, panel with toolbar +
`DataTable`, modals. No fake branch/stock-bar/minimum/category/status columns, no
hardcoded KPIs (128 productos / 7 stock bajo / por vencer / S/ 24,850), no
"Registrar compra" with provider, no fake "Tipo: Todos" categories.

- KPIs (all derived from live data): Productos (count), Sedes (count),
  Unidades en {sede} (`sumAvailable` over the selected location's balances),
  Sin stock en la sede (products with `available <= 0`).
- Toolbar: location selector (from `GET /locations`), kind filter
  (consumible/reventa), client-side search, "Nuevo producto".
- Table: Producto (icon+name), Tipo badge (Consumible/Reventa), Unidad,
  Stock en {sede} (real balance per product × location), Estado badge
  (Activo/Inactivo), row actions **Entrada / Ajuste / Transferir / Kardex**.
- Modals:
  - **Nuevo producto**: `{name, unit, kind}` only.
  - **Entrada de stock**: `{sede, cantidad, precio unitario (opcional)}` → entry.
  - **Ajuste de stock**: shows current balance, signed quantity (+/−),
    mandatory reason → adjustment.
  - **Transferir**: origin/destination selects, quantity, optional reason → transfer.
  - **Kardex**: movement table (Fecha, Tipo badge, Cantidad signed, Precio unit.,
    Motivo, Transferencia) for the product at the selected location.
- Loading (`table-loading`) and error states (`form-error` + Reintentar) via
  `toApiError`, same as CashPage.
- The page keeps Agenda, Patients and Cash pages untouched.

---

## 5. Test results

```
npm run typecheck   → PASS (tsc -p tsconfig.json --noEmit && tsc -p tsconfig.backend.json --noEmit)
npm test            → 83 passed (9 files) — 54 pre-existing + 29 new
npm run build       → PASS (vite build + tsc -p tsconfig.backend.json)
```

New `test/inventory-adapter.test.ts` (29 tests, TDD red→green):
- `toUiProduct` mapping + status derivation (is_active → Activo/Inactivo)
- `toUiLocation` mapping
- `toUiBalance` decimal parsing
- `toUiMovement` (ENTRADA, signed ADJUSTMENT + reason, TRANSFER_IN with transfer_id)
- `toUiTransfer` mapping (with/without reason)
- `sumAvailable` KPI helper
- Mock-mode reads: products/locations copies (asserts **no** invented fields),
  balance read, zero-balance fallback, kardex newest-first
- Mock-mode flows: `createProduct`, `registerEntry` (+validation),
  `registerAdjustment` (+zero/insufficient-stock/no-reason rejection),
  `registerTransfer` (+same-location/insufficient-stock rejection, OUT/IN pair
  sharing transfer_id, reflected on later balance read)

Browser smoke test (dev server, mock mode, headless Chromium): page renders,
4 KPIs show derived values (6 productos / 3 sedes / 222 unidades / 3 sin stock),
and create-product / entry / kardex / adjustment / transfer flows all complete
with zero console errors. Screenshots: `/tmp/opencode/inventory*.png`.

---

## 6. Deferred / removed controls

Per guardrails (`DEFER` / `PROTOTYPE` / `BACKEND_GAP`):

- **Removed**: fake category/branch/stock/minimum/status-bar columns; hardcoded
  KPIs (128 productos, 7 stock bajo, 3 por vencer, S/ 24,850); "Registrar compra"
  modal with provider; fake tabs Compras/Consumo/Proveedores; fake alert banner
  ("7 productos necesitan reposición"); fake Tipo categories (Insumos/Material
  restaurador/…).
- **Deferred (no backend authority)**: suppliers/proveedores, purchase orders,
  expiry/"por vencer", inventory valuation (unit_price × balance not built),
  reorder policy / minimum stock / "Crítico", category taxonomy, consumption tab
  (no list-all endpoint; `GET /executions/{id}/consumptions` is per-execution),
  transfer history list (only `POST /transfers` exists — no `GET /transfers`).
- **Note**: `scripts/visual-check.mjs` inventory scenario still targets the old
  UI (stock inicial / stock mínimo / Registrar compra / pagination buttons) and is
  Windows-only (hardcoded Chrome path); it is not part of `npm test`/`typecheck`/
  `build` and was not run. Updating it is out of scope for this task.
- **Note**: `.audit` is uncommitted work-in-progress; this evidence file is added
  beside `cash-real.md` / `frontend-contract-map.md`.

---

## 7. Diff summary (final)

```
 src/api.ts                  | 291 ++++  (inventory adapters; removed fake product/purchase calls)
 src/components/Badge.tsx    |   1 +   (statusTone: Inactivo → slate)
 src/contracts/api.ts        | 350 ++++  (regenerated: 5 paths, 6 schemas)
 src/contracts/client.ts     |  79 ++  (inventory clients + types)
 src/index.css               |   2 +   (.row-actions, .text-danger)
 src/mockData.ts             |  57 +-   (real-shape mock inventory store)
 src/pages/InventoryPage.tsx | 346 +-   (rebuilt against /products, /locations, balance/movements/entries/adjustments/transfers)
 src/types.ts                |  56 +-   (real Product shape + inventory view models)
 tsconfig.backend.json       |   3 +-  (exclude new adapter test)
 tsconfig.json               |   3 +-  (include new adapter test)
 test/inventory-adapter.test.ts | + (29 tests)
```

No commits made. Backend untouched.

Generated 2026-08-17 · HEAD frontend 54b6e20+ · HEAD backend 28d1e22 · Pane B delivery evidence.