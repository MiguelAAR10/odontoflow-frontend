---
name: clinical-data-storytelling
description: Select and specify truthful, decision-oriented charts and metrics for Owner, Administrative, and Doctor experiences in OdontoFlow. Use before adding dashboards, KPIs, analytics, or chart interactions.
---

# Clinical Data Storytelling

Turn clinic records into a clear answer and an appropriate next decision. A chart is not decoration and a metric is not trustworthy merely because it can be calculated in the browser.

## Metric contract

For each proposed visual, specify:

- User question and decision it supports.
- Data source and available fields.
- Exact formula, numerator, denominator, unit, time window, timezone, and grouping.
- Status: `observed`, `derived`, or `demo`. Mark unavailable data as unavailable; do not fill the gap with estimates.
- Important caveat, sample size, and interpretation risk.
- Interaction: filter, select, drill into records, or none.

When any item cannot be stated, do not present the number as a trustworthy production insight. Do not infer causality from correlation or projection from historical data.

## Product/domain guardrails

- `AGENTS.md`, generated OpenAPI contracts, and adapter types are authoritative. Presentation code must not invent backend fields, history, permissions, events, or mutations.
- API mode must contain no fixture/demo business records. Demo mode must be visibly labeled and use the fixed scenario clock/timezone consistently.
- Financial values come from charge/payment records and their explicit relationships. Keep currency in PEN/Soles, respect decimal precision, distinguish charges, payments, and outstanding balance, and never silently treat projected revenue as collected revenue.
- Do not invent lead conversion rates without stage history/cohort definitions; do not invent stock minima, clinical outcome scores, commissions, EBITDA, NPS, invoices, or predictive confidence bands.
- Doctor scope is the treating practitioner's actual records. Never expose payment actions to the Doctor. Administrative insights should help run today's flow; Owner insights may compare locations only when location scope exists in the data.
- Avoid hidden denominators and ambiguous labels such as "performance", "productivity", "success", or "conversion" without an explicit definition.

## Choose the visual form

- Trend over time: line/area only with a meaningful time series and honest zero/missing periods.
- Compare a few categories: sorted horizontal bars, with common scale and readable labels.
- Compare locations or cohorts: small multiples or a common-scale grouped view; make scope and period explicit.
- Composition: stacked bars only when the parts share a meaningful total and remain comparable. Avoid pie/donut by default.
- Funnel: only when ordered stage events and a consistent cohort are available. Otherwise show a labeled count by current status, not conversion.
- Schedule, queue, aging, or exception handling: an agenda/table/timeline often beats a chart because people need exact names, times, and actions.
- Scenario/forecast: separate it from observed results, expose editable assumptions and uncertainty, and never imply guaranteed revenue.

Use Recharts, already installed, when it fits. Set responsive behavior, accessible text/table alternative, clear axes/units, meaningful tooltips, and deliberate empty/loading/error states. Avoid animations that delay or distort reading.

## Role narratives

- Owner: what changed across locations, which service/location drives the difference, and where intervention is warranted. Prefer a strong comparative story plus exceptions over a wall of cards.
- Administrative: what is happening next, where the day is delayed or overloaded, and which record needs action. Pair a visual summary with precise operational rows.
- Doctor: who is next, what stage/treatment is active, and what clinical task or document is still open. Keep personal production secondary and only when the real permission/data supports it.

## Proposal format

For each visual, provide: name; role; question; decision; source/formula/window; dimensions and filters; chart/encoding; drill-down; empty/error behavior; risk; and why the visual is more useful than a KPI card or table. Reject proposals that cannot meet this contract.
