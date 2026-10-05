# AGENTS.md — OdontoFlow Frontend

Operating contract for every agent (human or AI) working in this repository. Read before touching code.

## 1. What this repo is (and is not)

- It is the **React + Next.js App Router frontend** for OdontoFlow, a deterministic, multi-tenant clinic operations platform.
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
   With `NEXT_PUBLIC_USE_MOCKS=false` the app must consume **zero** mock business data. Mock mode exists for
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
npm test                                   # unit + adapter suites (91 tests)
npm run build                              # Next.js build + tsc backend
./scripts/pilot-e2e.sh                     # deterministic real-backend E2E (needs :5434 + backend venv)
# or manually:
NEXT_PUBLIC_USE_MOCKS=false NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8010 \
  npx vitest run --config vitest.e2e.config.ts   # pilot + agenda + patients integration
```

## 5. Test wiring (why some tests are excluded)

`vitest.config.ts` `test.exclude` keeps integration specs out of `npm test` (they need a live backend):
`test/agenda-integration.test.ts`, `test/patients-integration.test.ts`, `test/pilot-e2e.test.ts`.
`vitest.e2e.config.ts` includes exactly those three. `tsconfig.backend.json` (NodeNext) excludes them the
same way. A new integration spec must be registered in all three places.

## 6. Do not

- Do not inspect or modify `../../medistock` (read-only legacy).
- Do not modify the backend from this repo; backend defects get reported to the backend lead.
- Do not remove the generated-contract workflow to "simplify" — regeneration is the contract's source of
  truth.
- Do not treat `mockData.ts` as authoritative for anything beyond design-time visuals.

## 7. Design and agent workflow

- Before changing a user-facing view, load the relevant local skills in `.agents/skills/odontoflow-engineering/`,
  `odontoflow-visual-system/`, `clinical-workflow-ux/`, `clinical-data-storytelling/`, `clinical-motion/`,
  and `ux-visual-qa/`. Before reporting completion, apply `verification-before-completion/`. Keep the existing
  `frontend-design`, `web-design-guidelines`, `next-best-practices`, and React best-practice skills in force.
- Use the platform-specific agent names in `docs/agent-workflow.md`; Claude/Cursor use kebab-case names
  from `.claude/agents/`, while Codex uses snake_case names from `.codex/agents/`. Never pass a name from
  one catalog to another tool.
- Run read-only critiques in parallel if useful, then resolve one brief before implementation. Assign exactly
  one implementation agent to a route/file set at a time; do not start another implementer until that agent
  has handed off or stopped. The parent coordinates ownership and runs QA after implementation; the auditor
  reviews evidence but does not edit. UX owns safe workflow, role boundaries, and comprehension; visual
  design chooses expression within those constraints; the data analyst owns metric validity. Where they
  disagree, backend truth and workflow safety win.
- Product direction and screenshot scoring for A70/B30 are defined in `docs/odonto-visual-direction.md`; do
  not reinterpret A/B from memory or equate “Apple-like” with a specific vendor UI.
- Every chart or metric must identify its question, source, calculation, time window, and data status. Demo data
  stays visibly demo; absent backend fields remain unavailable rather than being inferred or fabricated.
- Before calling a view done, inspect its rendered desktop and mobile screenshots, exercise its primary flow in
  an isolated browser context, check keyboard/reduced-motion behavior, and record any unverified states.
- Precedence when guidance conflicts: generated backend contract and this `AGENTS.md` first; then these
  repo-specific skills; then third-party design/testing skills. In particular, never follow generic placeholder
  content advice if it would fabricate business facts, and use the repo's JS Playwright harness rather than
  generic Python instructions. The upstream `frontend-design` and `webapp-testing` files remain unmodified and
  hash-pinned; their generic placeholder and Python-harness advice is explicitly superseded for this repo by
  the data-truth rules above and `.agents/skills/ux-visual-qa/SKILL.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
