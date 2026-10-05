---
name: verification-before-completion
description: Require fresh, relevant evidence before reporting a fix, passing test, completed task, commit, or pull request in OdontoFlow.
---

# Verification Before Completion

Evidence before claims. This is a portable, OdontoFlow-specific skill inspired by the locally installed Superpowers `verification-before-completion` skill (MIT, v6.3.0); it is not a copy of that plugin's unavailable backend-linked target.

Before reporting completion:

1. List the claims you intend to make and the exact command or observation that proves each one.
2. Run the full relevant command in the current checkout and inspect its exit status and failure count. A prior run, agent report, changed source, or partial check is not proof.
3. For browser behavior, inspect the actual rendered route and role. For state-changing flows, use an isolated demo scenario with an explicit reset. A fresh tab alone does not isolate backend or shared server state.
4. For visual changes, inspect screenshots at the required desktop and mobile sizes and score them with `docs/odonto-visual-direction.md`. Passing unit tests is not visual acceptance.
5. Separate verified results from source inspection, assumptions, and `not tested` items. Do not convert missing evidence into a pass.

Never mutate the shared demo, real API, payments, inventory, appointments, Telegram, WhatsApp, or other external state to manufacture QA evidence. If safe isolation is unavailable, report that flow as `not tested` and keep the task open.

Use the repository's JavaScript harness, not generic Python Playwright instructions. `scripts/capture-view-audit.mjs` changes the Carlos demo appointment and does not restore it; do not run it against shared port 5173.
