# OdontoFlow visual direction

This document translates the user's A70/B30 preference into a screenshot-scored product direction. The original A/B reference images are not stored in this repository; this is an explicit verbal interpretation, not a claim that the source images have been pixel-matched. If those images are added later, revisit this definition with the user.

## A70: composed clinical clarity

The dominant language is a quiet, premium clinical workspace: bright neutral surfaces, restrained color, precise alignment, legible typography, deliberate spacing, concise labels, and controls that feel immediate and dependable. Reuse the existing `DESIGN.md` and CSS tokens. Do not introduce fluorescent color, decorative gradients, glass effects, or a generic card-wall dashboard.

## B30: expressive data storytelling

The smaller expressive layer comes from the information itself: a strong chart or visual comparison, clear emphasis on the most important change, compact annotation, and carefully timed interaction feedback. Use a distinctive chart composition or one restrained accent where it helps interpretation. Do not add ornamental illustration or motion unrelated to a user action.

## Screenshot acceptance

Score each route/role screenshot at 1440×900 and 390×844 against the ten binary checks below. A check passes only when the evidence is visible in the screenshot or in the paired interaction capture; do not infer it from source code. Record `pass/fail` and a screenshot region for each. A screen passes this direction only with **7/7 A checks and at least 2/3 B checks**. Any fabricated/unsupported data, neon treatment, unreadable chart, or overlapping content is an automatic fail regardless of score.

### A: seven clarity checks

1. A light neutral canvas and existing design tokens dominate; no fluorescent/neon color, glow, decorative gradient, blur panel, or copied Apple branding.
2. Content aligns to one consistent grid; title, primary content, and controls share deliberate edges.
3. One clear type hierarchy distinguishes page title, section labels, values, and supporting text; no clipped or competing headings.
4. Copy is limited to labels and decision context; no explanatory paragraphs that narrate the UI.
5. The primary action is visually identifiable and its consequence is clear; secondary actions do not compete with it.
6. The role's leading task/answer is apparent in the first viewport, with no decorative card wall or empty hero region.
7. Mobile preserves readable type, chart/table labels, touch targets, and a deliberate content order without horizontal overflow.

### B: three expression checks

1. On a dashboard/home with supportable data, one leading visualization or visual comparison communicates a specific role-relevant question; operational detail remains in a queue/table when precision is needed.
2. Any additional visualization contributes a different measure, segmentation, or time window. In the desktop first viewport, the primary visual gets a visibly dominant region (at least one-third of the main content width or height); on mobile it becomes a full-width, readable section rather than a thumbnail. For non-dashboard workflows, the selected record/timeline may be the leading visual instead.
3. One restrained visual signature (chart composition, semantic accent, or action feedback) makes the screen recognizable; animation is limited to a real state change and respects reduced motion.

For comparison across revisions, use identical route, role, data snapshot, viewport, and browser zoom; place baseline and candidate captures side by side and score the same checks. The A/B labels describe this fixed 7+3 review weighting, not literal pixel coverage. When visual expression and clinical trust conflict, clinical trust wins; improve the data composition rather than adding decoration.
