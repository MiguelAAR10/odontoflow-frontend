---
name: odontoflow-visual-system
description: Product-specific visual design direction for OdontoFlow's clinical operations frontend. Use when redesigning a route, composing role dashboards, choosing components, or reviewing whether a screen feels premium, clear, and sufficiently informative.
---

# OdontoFlow Visual System

Create a distinctive, premium clinical product: calm and precise like a great Apple product, with enough visual character to feel memorable. This is a design direction, not permission to copy Apple's interface or branding.

## Product priorities

1. Trust and clinical clarity.
2. A strong first-viewport composition with an immediate role-specific insight or next decision.
3. Useful visual data density, especially charts that explain pace, mix, variance, workload, or change.
4. Operational actions that remain obvious and easy to complete.
5. Minimal copy: labels should orient, not narrate the interface.

The user's visual reference is A70/B30; the repo-local, testable translation is defined in [`docs/odonto-visual-direction.md`](../../../docs/odonto-visual-direction.md). Use it as a review rubric. If reference images later become available in the repo, update that document from the actual images rather than guessing what A or B meant.

## Visual rules

- Begin from the existing `DESIGN.md`, `src/index.css`, component patterns, and actual route screenshots. Extend the product's visual language instead of replacing it with a generic dashboard kit.
- Use a restrained light clinical canvas, crisp typography, deliberate whitespace, precise alignment, subtle borders, and a limited teal/green semantic accent. No fluorescent/neon colors, purple-blue gradients, gratuitous glows, blur panels, oversized rounded cards, or AI-generated-dashboard tropes.
- Spend visual emphasis in one or two places per viewport. Build hierarchy with scale, alignment, chart form, and whitespace before adding color or decoration.
- Avoid identical card grids. Use a composed canvas: one dominant insight or workflow, supporting visualizations, and a compact actionable list or table where the data requires precision.
- Do not leave role homes as blank space. Use real, role-relevant schedules, status distributions, trends, service mix, capacity, unresolved work, or workload views when available. Do not add a chart just to occupy space.
- Keep labels short and user-facing. Remove implementation vocabulary, explanatory paragraphs, redundant headings, noisy uppercase eyebrows, and labels that repeat nearby content.
- Keep controls familiar: icon buttons for tools, segmented controls for mutually exclusive modes, menus for option sets, and visible text for consequential actions. Preserve visible focus and adequate touch targets.
- Maintain responsive compositions: desktop may pair a dominant chart with a work queue; mobile should reflow into a readable sequence, not shrink a desktop dashboard into illegible miniatures.

## Before implementation

1. Inspect the route, role, existing data source, design tokens, and screenshots. Check the current backend contract before proposing new information.
2. Write a short design intent: user question, leading visual, supporting evidence, primary action, and what must stay out of the viewport.
3. Sketch the layout at desktop and mobile sizes. Identify the one memorable visual moment; keep surrounding UI quiet.
4. Implement with the existing stack and libraries. Do not add a dependency when CSS, existing primitives, or Recharts suffice.

## Repository overrides

- This repo's data and backend contract rules override any generic design skill that suggests inventing placeholder copy, example patients, or business facts. Use existing demo fixtures only when explicitly in demo mode and visibly labeled; otherwise show unavailable/empty states honestly.
- This skill and `docs/odonto-visual-direction.md` override generic visual recipes when they conflict. `AGENTS.md` defines source precedence; do not edit the hash-pinned upstream skill files to change project policy.

## Critical review

Review actual rendered screenshots, not only source code. Ask:

- Is the first useful answer visible without scrolling?
- Does every region either communicate information or enable a task?
- Is the surface visually rich without repetitive cards, excessive copy, or fake data?
- Can a busy clinic user scan the hierarchy in seconds?
- Does the design still feel intentional at 1440px, 390px, and 375px?
- Are observed, derived, and demo values unmistakable?

If a screenshot feels empty, first improve the information architecture and the use of valid data, not decoration. If it feels crowded, remove duplicate labels and weaker visuals before shrinking everything.
