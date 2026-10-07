# FE3A Service-to-Cash V1 checkpoint

Checkpoint captured on 2026-09-06 in the frontend worktree. This file records
state only; no files were staged, committed, reset, cleaned, reverted, or
discarded for this checkpoint.

## Repository state

- Frontend `HEAD`: `0dbfa9e6705efb5b1e6553e3841ca204533cdf97`.
- Branch at inspection: `main...leonardo/main [ahead 15]`.
- Frozen backend contract HEAD used before the FE3A edits: `e6d9bf264381adc306a086b4ea555638e6b578af`.
- `git diff --stat` (tracked files only): **21 files changed, 7,412 insertions(+), 828 deletions(-)**.
- `git status --short` at checkpoint:

```text
 M AGENTS.md
 M DESIGN.md
 M package.json
 M scripts/pilot-e2e.sh
 M src/api.ts
 M src/contracts/api.ts
 M src/contracts/client.ts
 M src/index.css
 M src/mockData.ts
 M src/tokens.css
 M src/types.ts
 M src/ui.ts
 M src/views/AgendaPage.tsx
 M src/views/CashPage.tsx
 M src/views/PatientsPage.tsx
 M test/cash-adapter.test.ts
 M test/cash-transport.test.ts
 M test/pilot-e2e.test.ts
 M tsconfig.backend.json
 M vitest.config.ts
 M vitest.e2e.config.ts
?? .agents/skills/impeccable/
?? .audit/fe3a-browser-mock/
?? .claude/agents/
?? .claude/skills/impeccable/
?? .codex/
?? src/components/AttendancePanel.tsx
?? test/collections-adapter.test.ts
?? test/reconciliation-adapter.test.ts
?? test/service-to-cash-adapter.test.ts
?? test/service-to-cash-integration.test.ts
```

`AGENTS.md`, `.agents/skills/impeccable/`, `.claude/`, and `.codex/` were
pre-existing workspace changes and were left untouched. The untracked
`.audit/fe3a-browser-mock/` directory is prior mock-browser evidence; no real
FE3A browser evidence has been captured.

## Generated contract

`src/contracts/api.ts` is the only generated source file changed. It was
regenerated mechanically with `npm run openapi:generate` from the published
backend YAML; its current diff is **5,737 additions / 415 deletions**. The
generated contract includes the frozen visits, executions, charges, payments,
verification, and follow-up routes (and the backend's existing route set); no
generated response types were hand-written and no agent-tools UI was wired.

The handwritten typed client in `src/contracts/client.ts` now covers:

- `listVisits`, `getVisit`, `listVisitExecutions`, `createVisit`;
- `listExecutions`, `createServiceExecution`, `createCharge`, and widened
  `listCharges` context filters;
- `createPayment`, `listPayments`, `listAllPayments`, and `verifyPayment`;
- `listFollowUps`, `listChargeFollowUps`, `openFollowUp`,
  `rescheduleFollowUp`, and `closeFollowUp`.

Payment methods are generated-code typed as `efectivo`, `tarjeta`, `yape`,
`plin`, `transferencia`, and `link_pago`. Digital payment metadata is typed,
the optional receiver/reconciliation fields are omitted when absent, and no
verifier identity is sent. All of these adapters route through the existing
browser → `src/api.ts` → typed-client → FastAPI boundary; mock mode remains
behind the same seam and real mode does not intentionally read mock business
data.

## Capabilities implemented

- Agenda appointment detail has a bounded **Registrar atención** action and a
  three-step `AttendancePanel`: canonical patient projection when present,
  canonical patient search/create otherwise (with explicit no Lead → Patient
  auto-creation), visit creation, operator-entered executed price with no
  catalog suggestion, service execution, charge creation, and per-intent
  idempotency keys.
- `/caja` has the four operational tabs **Cobros**, **Por facturar**,
  **Cobranza**, and **Conciliación**. It renders canonical charge context,
  payment history, `GET /executions?charged=false`, active follow-ups, and
  unverified digital payments with historical null-reference rows visibly
  non-verifiable.
- Payment UI supports full, partial, and pay-later intent; exact generated
  method labels; required digital references; optional receiver and
  reconciliation note omission; backend/error-envelope authority for
  validation and overpayment; and an explicit unverified state without a bank
  confirmation claim.
- Patient detail now loads canonical visits and displays execution charge
  state, outstanding balance, and an open follow-up when projected.
- Mock adapters mirror the FE3A duplicate, visit-status, overpayment, digital
  reference, verification, follow-up date/state, and payment-settlement rules.
- `DESIGN.md`, typography tokens, and FE3A styles document/use the Odonto
  Smart clay + restrained glass direction, Clash Display + Montserrat, data
  surfaces, bounded motion, and reduced-motion behavior.

## Verification already observed (not rerun for this checkpoint)

- `npm run openapi:generate`: passed before this checkpoint.
- `npm run typecheck`: passed.
- `npm test`: passed, **13 test files / 94 tests**.
- `npx next build --webpack`: passed.
- `npm run build`: passed after the build script was changed to use
  `next build --webpack && tsc -p tsconfig.backend.json`.
- The default Turbopack `next build` path failed twice with the observed
  `Operation not permitted` CSS-worker/port-bind error; the webpack build
  path passed.
- The writer's `./scripts/pilot-e2e.sh` attempt failed at its first database
  reset step with `psql: error:` because PostgreSQL on `localhost:5434` did
  not respond. Before the owner stop, the coordinator separately ran the
  deterministic pilot against the shared database and observed 14/14 tests
  pass; this does not close the manual-browser gate.
- Prior mock browser inspection rendered `Error de conexión con el servidor`
  with zero charge rows. No accepted manual-browser run, screenshots, or
  `.audit/fe3a-browser-real.json` exist yet; any Chromium/Playwright output is
  not accepted under the current owner harness rule.

## Unfinished surfaces and blockers

- The requested real evidence flow is unfinished. The existing Next server
  must be used rather than starting a second server in this worktree, and the
  owner now requires manual browser operation only.
- The writer saw PostgreSQL on `localhost:5434` unavailable and Docker report
  the port already allocated. The coordinator later used the existing shared
  database for the 14/14 pilot, then stopped the temporary activity-local
  backend; do not reset or destroy data on continuation.
- `Cobranza` currently offers refresh plus open/reschedule/close actions but
  does not yet expose the planned “vence hoy o antes” quick filter.
- After a successful follow-up mutation, `selected` remains populated while
  `followUpAction` is cleared, so the payment modal can become eligible to
  reopen; the continuation should clear the selected charge after that flow.
- The owner has now prohibited Chromium/Playwright for this activity. Any
  continuation must use the approved manual browser harness only; existing
  Playwright artifacts are not acceptable FE3A evidence.
- The writer's environment inspection reported the local listener/database as
  unavailable. The coordinator separately observed a deterministic pilot run
  pass (14/14) and a temporary CORS-enabled backend before the stop; those
  runtime processes are activity-local and must be stopped, not treated as a
  completed FE3A browser gate.

## Exact smallest continuation slice

1. On explicit continuation, inspect the existing database/runtime without a
   reset; restore only the minimum controlled data needed for manual evidence.
2. Apply the two bounded UI follow-ups above (due-date quick filter and clear
   selected charge after follow-up success).
3. Use the approved manual browser harness only to exercise checkout
   desktop/mobile, collections, partial digital payment, follow-up,
   fully-paid settlement, and shell/navigation/search preservation; save the
   requested evidence and record zero unexpected page/console/request errors.
4. Run only the final checks explicitly authorized after the pause, inspect
   the evidence, and report the exact HEAD, files, and blockers. Do not stage
   or commit this checkpoint or any product file until the integration lead's
   gate.
