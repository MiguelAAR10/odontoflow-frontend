---
name: clinical-motion
description: Design and implement polished, restrained transitions for OdontoFlow interactions. Use when adding route, panel, chart, selection, confirmation, loading, or feedback motion.
---

# Clinical Motion

Motion should clarify what changed, preserve the user's sense of place, and make the interface feel precise. Do not animate for spectacle.

## Motion language

- Prefer short opacity/transform transitions and small layout changes; use the repo's existing tokens if present. Keep most interaction feedback in the 120–220 ms range and avoid spring/bounce by default.
- Animate user-triggered state changes: opening/closing a detail panel, switching a period, selecting a chart series, confirming an action, and revealing a result. Keep focus and text changes immediate.
- Use skeletons only when real loading occurs. Never animate a fake loading state or make chart data appear to change when only the filter label changed.
- Avoid `transition: all`, perpetual motion, parallax, confetti, 3D tilt, staggered entrance on every card, pulsing decoration, and hover motion that shifts layout.
- Use CSS transitions and existing React/CSS primitives first. Do not install a motion library for one or two small transitions.
- Respect `prefers-reduced-motion: reduce`; remove nonessential transforms and animation while keeping state changes and feedback understandable.
- Keep animations performant (opacity/transform where possible), and verify there is no layout shift, clipped focus ring, or obscured control on desktop and mobile.

## React / Next compatibility

Do not assume React View Transitions are supported by this project. The checked-in stack uses React 18.3.1 and Next.js 16.3.4. Before using a framework-level transition API, verify the exact installed API and read the matching local Next.js docs. Never switch to experimental/canary packages to achieve a decorative effect.

## Review

Test each interaction with motion enabled and reduced motion enabled. Confirm the control remains responsive, the final state is unambiguous, and the animation is still useful when disabled. Use Transitions.dev as a selective pattern reference only; do not copy its more theatrical effects into clinic operations.
