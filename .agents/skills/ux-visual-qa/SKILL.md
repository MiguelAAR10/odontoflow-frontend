---
name: ux-visual-qa
description: Audit OdontoFlow screens and critical user flows with rendered Playwright evidence, role coverage, responsive checks, accessibility basics, and honest QA reporting.
---

# UX and Visual QA

Use the repository's existing JavaScript Playwright setup. `npm run test:visual` runs `scripts/visual-check.mjs` on an isolated Next server at port 5189; it does not exercise appointment reschedule/cancel. It builds the app and writes screenshots (and the script currently writes QA artifacts), so do not run it while the shared dev server/build output is in use unless working in a disposable checkout and directing all artifacts to a temporary directory.

`scripts/capture-view-audit.mjs` is a separate, non-NPM script. By default it targets the shared dev server at port 5173, writes under `docs/qa/`, and its interaction flow reschedules and cancels the Carlos fixture without restoring it. Never run it against a shared server or real API. Do not execute its mutation flow unless the parent has confirmed a disposable checkout, demo mode, isolated browser storage, and an explicit reset path. Otherwise report the flow as `not tested`.

Do not follow generic Python Playwright instructions if they conflict with this repo.

## Safety and test isolation

- Inspect current test scripts and server state before running them. Do not restart, build over, or mutate a shared demo server.
- Use an isolated browser context/profile and a resettable local demo snapshot for flows that change state.
- Never submit real API mutations, real Telegram/WhatsApp messages, real payments, or external communications during visual QA. Confirm the page is in demo/local mode first.
- For destructive demo actions such as cancel/reschedule/stock adjustment/payment, test only in a disposable isolated checkout/scenario; capture before/after evidence and reset it. A new browser context alone is not proof that the backend or build output is isolated. If isolation cannot be guaranteed, report the interaction untested rather than changing the shared scenario.

## Minimum view audit

For each route and each applicable role:

1. Capture desktop at 1440×900 and mobile at 390×844; include 375px width for overflow-sensitive views.
2. Inspect the first viewport and full page. Check clipping, overlap, excessive empty space, repeated card patterns, tiny chart labels, and chart/table legibility.
3. Exercise the primary action, a representative filter/tab, an empty state, an error state when safely reproducible, and the route's return/navigation path.
4. Check keyboard navigation, visible focus, accessible names for icon controls, contrast, semantic headings/table/chart alternatives, and `prefers-reduced-motion`.
5. Record console errors, failed requests, horizontal overflow, and screenshot paths.

## Evidence and verdict

Report each finding with severity, route/role/viewport, reproducible action, observed result, expected result, and screenshot or code reference. Separate verified behavior from source inspection and assumptions. Say `not tested` when it was not exercised. A passing unit suite is not proof of visual correctness or cross-role usability.

Critique the design against the OdontoFlow visual system: premium clinical precision, A70/B30 balance, useful chart-led insight, concise interface copy, no fluorescent/AI-looking decoration, and truthful data labels.
