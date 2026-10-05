---
name: odontoflow-engineering
description: Implement and review OdontoFlow frontend changes against this repository's API, role, and data-truth contracts. Use before editing application code.
---

# OdontoFlow Engineering

This is a repository-local replacement for a previously dangling cross-repository link. It is based on the current `AGENTS.md` and frontend contracts; it does not claim to reproduce an unavailable original skill.

## Before editing

1. Read `AGENTS.md`, the generated API contract, `src/api.ts`, the relevant adapter, and the target route.
2. Confirm the requested role, route, data source, and explicit file ownership with the parent agent.
3. Read the relevant visual, workflow, data-storytelling, motion, and QA skills before changing a user-facing view.

## Engineering constraints

- This repository owns frontend presentation and view models. The backend and generated OpenAPI contract own domain behavior, permissions, prices, stock, payments, and availability.
- Do not invent endpoints, request fields, role permissions, business facts, or API data. Keep all data access behind `src/api.ts` and the existing adapters.
- In API mode, do not merge fixtures into API responses. In demo mode, label demo data and preserve domain rules.
- Preserve unrelated dirty files. Do not edit the backend or generated contract by hand.
- One implementer owns a route/file set at a time. Do not edit overlapping files while another implementer owns them; hand off changes and verification before ownership moves.
- Prefer existing dependencies and local patterns. Add focused tests for behavior changes and report untested states plainly.

## Completion evidence

Run the relevant checks fresh. For user-facing changes, use the repository's JavaScript Playwright harness in an isolated checkout and inspect desktop/mobile captures. Never run the appointment action-capture script against the shared port or real API. Follow `docs/agent-workflow.md` and `docs/odonto-visual-direction.md`.
