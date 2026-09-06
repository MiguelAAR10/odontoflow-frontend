# FE0B Next.js App Router parity handoff

## Result

The operational frontend now runs on Next.js App Router with the existing shell, API adapters, mock seam, voice gate, and backend contract preserved. The migration is intentionally presentation/routing-only: there is no Route Handler, Server Action, database access, business computation, or backend change.

## Freeze and versions

| Marker | Value |
|---|---|
| Frontend HEAD before implementation / current base | `f31a66c645bd01f09fbe3a27abd454337cab77cf` |
| Backend HEAD | `254fe83ed756e8ad0100dac9ffde909fe8e8e0aa` |
| Frozen backend OpenAPI SHA-256 | `2b0929d7eef9f084b9387a9eacd832c1270a1b6c20232087c0a28cb1df0ae074` |
| Frozen generated `src/contracts/api.ts` SHA-256 | `7289f15c757d7141b0b36e9ec3921ed15c71e7df90eb3c8c0f3fcaa03990cb2f` |
| Next.js | `16.3.4` (exact package pin) |
| React / React DOM | `18.3.1` |
| Vitest | `3.2.7` |
| Node | `v24.12.0` |

The generated contract was not regenerated and has no diff. `src/contracts/client.ts` changes only its `src/env.ts` import and `baseURL`; the typed paths, errors, idempotency headers, and exported signatures are unchanged.

Next 16.3.4's build normalized the TypeScript JSX setting to `react-jsx` (the current compiler setting required by this release); no application JSX behavior changed.

## Environment boundary

`src/env.ts` is the sole application environment accessor and uses literal static reads for:

| Former Vite key | Next.js key |
|---|---|
| `VITE_BACKEND_URL` | `NEXT_PUBLIC_BACKEND_URL` |
| `VITE_USE_MOCKS` | `NEXT_PUBLIC_USE_MOCKS` |
| `VITE_ENABLE_VOICE` | `NEXT_PUBLIC_ENABLE_VOICE` |
| `VITE_VOICE_URL` | `NEXT_PUBLIC_VOICE_URL` |

`DATABASE_URL` and `SIMULATION_TIME_ZONE` remain server-only legacy simulator values. Tooling values (`VISUAL_BASE_URL`, `VISUAL_BROWSER_PATH`, `VISUAL_SCREENSHOT_DIR`) remain in the visual harness. The final source has no `VITE_*` or `import.meta.env` references; the only legacy `process.env` reads outside `src/env.ts` are the explicitly preserved Node simulator entrypoint (`src/server.ts`), tests, and tooling.

## Route parity evidence

The baseline route contract is captured in [`route-parity-vite-baseline.json`](route-parity-vite-baseline.json). Native Next probes are in [`route-parity-mock-off.json`](route-parity-mock-off.json) and [`route-parity-mock-on.json`](route-parity-mock-on.json).

| Path | Vite baseline, voice off | Next, voice off | Next, voice on |
|---|---|---|---|
| `/` | `200` → `/agenda` | `307 /agenda` → `200 /agenda` | `307 /agenda` → `200 /agenda` |
| `/agenda` | `200` → `/agenda` | `200 /agenda` | `200 /agenda` |
| `/agente` | `200` → `/agente` | `200 /agente` | `200 /agente` |
| `/pacientes` | `200` → `/pacientes` | `200 /pacientes` | `200 /pacientes` |
| `/caja` | `200` → `/caja` | `200 /caja` | `200 /caja` |
| `/inventario` | `200` → `/inventario` | `200 /inventario` | `200 /inventario` |
| `/chat` | `200` → `/chat` | `200 /chat` | `200 /chat` |
| unknown path | `200` → `/agenda` | `307 /agenda` → `200 /agenda` | `307 /agenda` → `200 /agenda` |
| `/asistente` | `200` → `/agenda` (voice off) | `307 /agenda` → `200 /agenda` (voice off) | `200 /asistente`, `Asistente de voz` (voice on) |

The only HTTP-level difference is the expected server-side `redirect()` status in Next; the final URL, heading, and shell behavior match. Both native probes report no page or console errors and voice-on mock mode reports zero requests to the voice service.

## Visual evidence

The before Vite screenshots are under [`before/mock/`](before/mock/); the final Next screenshots are under [`after/mock/`](after/mock/). The final [`visual-final.log`](after/visual-final.log) reports all seven frozen flows passed and `pageErrors: []`: Agenda, Agent, Patients, Cash, Inventory, Chat, and responsive 1024/390px navigation.

Two stale assertions were reconciled against the verified current UI, with no product behavior changed:

1. Cash uses the current `Cobros` heading and charge/payment flow. The old `Control de caja` heading, `Comisiones`, `Movimientos`, and obsolete income/close-cash controls were not present in the current Cash view, so the visual flow now searches charge `#2`, opens `Cobrar`, uses `Pagar todo`, and submits `Registrar pago`.
2. Inventory location `<option>` values are backend IDs, not labels. The visual flow now reads the `Lince` and `Jesús María` option values before selecting them; it then exercises the current `Nuevo producto` → `Entrada` → `Cantidad` → `Registrar entrada` flow. Obsolete initial/minimum stock, pagination, and purchase controls were not present in the current Inventory view.

The WSL helper was run with `python3 .agents/skills/webapp-testing/scripts/with_server.py --help` before use; the captured usage is in [`webapp-testing-help.txt`](webapp-testing-help.txt). Its browser discovery also accepts both `chrome-linux` and `chrome-linux64` cache layouts while retaining `VISUAL_BROWSER_PATH` override support.

## Fresh verification

| Check | Result | Evidence |
|---|---|---|
| `npm run typecheck` | both tsconfigs passed | [`verification-typecheck.log`](verification-typecheck.log) |
| `npm test` | 10 files, 91/91 passed | [`verification-unit.log`](verification-unit.log) |
| `npm run build` | Next `16.3.4` production build + backend `tsc` passed | [`verification-build-final.log`](verification-build-final.log) |
| `NEXT_PUBLIC_ENABLE_VOICE=true NEXT_PUBLIC_USE_MOCKS=true npm run build` | passed | [`verification-build-voice-on.log`](verification-build-voice-on.log) |
| `npm run test:visual` | 7/7 flows passed, zero page/console errors | [`visual-final.log`](after/visual-final.log) |
| `./scripts/pilot-e2e.sh` / `npm run test:e2e:pilot` | 12/12 passed against FastAPI + PostgreSQL | [`verification-pilot.log`](verification-pilot.log) |
| agenda integration | 3/3 passed | [`verification-agenda-integration.log`](verification-agenda-integration.log) |
| patients integration | 3/3 passed | [`verification-patients-integration.log`](verification-patients-integration.log) |
| voice-off native route probe | all listed routes resolved; zero voice HTTP | [`route-parity-mock-off.json`](route-parity-mock-off.json) |
| voice-on mock native route probe | `/asistente` rendered; zero voice HTTP | [`route-parity-mock-on.json`](route-parity-mock-on.json) |
| global controls/native navigation probe | patient search → `/pacientes?patient=ana`, nav to Inventory, New Appointment toast | [`interaction-parity.json`](interaction-parity.json) |

An exploratory combined `npm run test:e2e` against an already pilot-seeded database is retained in [`verification-integration.log`](verification-integration.log): agenda and patients passed, while pilot's fixed `Paciente E2E Piloto` fixture collided with the prior pilot state. The required isolated pilot reset/run and isolated agenda/patients runs above pass; this is a pre-existing shared-state harness limitation, not a migration failure.

## Scope and protected surfaces

- Retired `vite.config.ts`, `index.html`, `src/main.tsx`, React Router, and Vite direct dependencies; added `app/` route/layout tree, `next.config.ts`, standalone `vitest.config.ts`, and `src/views/`.
- Preserved `AppShell` DOM, global search query navigation, global New Appointment modal/event, `ApiError`, per-intent idempotency, API paths, mock/real markers, voice contributor behavior, and CSS/layout.
- `src/domain/`, `src/simulation/`, `src/server.ts`, `src/index.ts`, `src/ui.ts`, `src/contracts/api.ts`, backend, planning control plane, brand source, W4/n8n, and credentials were not modified.
- No commit was created; the coordinator should inspect the dirty worktree and commit safely after integration fan-in.
