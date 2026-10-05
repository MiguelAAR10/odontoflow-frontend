# OdontoFlow agent workflow

Project-local Claude Code agents live in `.claude/agents/`; Codex custom agents live in `.codex/agents/`. The reusable design skills live under `.agents/skills/` and are linked into `.claude/skills/` for Claude Code discovery.

These locations and formats follow the vendors' documented project-level conventions: [Codex skills and subagents](https://developers.openai.com/codex/skills), [Claude Code skills](https://code.claude.com/docs/en/skills) and [subagents](https://code.claude.com/docs/en/sub-agents), and [Cursor skills](https://cursor.com/docs/skills) and [subagents](https://cursor.com/docs/subagents). Recheck these docs when upgrading a coding tool; local files alone cannot guarantee runtime support in an older client version.

`CLAUDE.md` imports `AGENTS.md` because the installed Claude Code 2.1.241 predates automatic `AGENTS.md` discovery. The five third-party skills remain unchanged and listed in `skills-lock.json`. The OdontoFlow skills are first-party repo files and are tracked directly. Repo-specific data, design, and QA rules below explicitly override incompatible generic advice from third-party skills.

## Recommended sequence

Use the name from the active tool's own catalog. Claude Code and Cursor names are kebab-case; Codex names are snake_case:

| Responsibility | Claude Code / Cursor | Codex |
|---|---|---|
| Clinical workflow critique | `clinical-ux-designer` | `clinical_ux_designer` |
| Visual product critique | `visual-product-designer` | `visual_product_designer` |
| Metric/story critique | `data-storytelling-analyst` | `data_storytelling_analyst` |
| Implementation | `frontend-product-engineer` | `frontend_product_engineer` |
| Evidence audit | `ux-accessibility-auditor` | `ux_accessibility_auditor` |

1. Run the clinical UX and visual product critics in parallel for a route or workflow. Give both the route, role, and current screenshot. The UX designer owns task clarity, role boundaries, and safe action; the visual designer owns presentation within those constraints.
2. When charts or metrics are involved, run the metric/story critic separately. Require source, formula, denominator, period, and data-status label for every proposal.
3. Resolve disagreements against `AGENTS.md`, `DESIGN.md`, generated API contracts, and `docs/odonto-visual-direction.md`. Backend truth and workflow safety take precedence; the metric analyst decides whether a metric is supportable.
4. Give the resolved brief and an explicit route/file ownership list to exactly one implementation agent. No second implementation agent may edit overlapping routes or files until the first has handed off or stopped. Parallel work is allowed only for disjoint, explicitly assigned files with a parent coordinating integration.
5. The parent runs a safe visual harness in an isolated checkout and passes screenshots/reports to the evidence auditor. The auditor cannot execute commands or mutate data; it marks missing evidence `not tested`.

These definitions use GPT-6 Luna with high reasoning in Codex; Claude Code inherits its selected model. In Cursor, all non-implementation Claude agent definitions declare `readonly: true`. This is a coordination rule for the parent/orchestrator; agent files alone cannot provide a distributed lock across concurrently launched agents.

## Reference policy

- Keep the installed Anthropic frontend-design and webapp-testing guidance, plus Vercel's React, Next.js, and web-design-guidelines skills, as implementation and review foundations. Their source pins are recorded in `skills-lock.json`.
- Use [Godly](https://godly.website/) as a visual-reference index, not a dashboard template.
- Use [Hallmark](https://www.usehallmark.com/) to critique generic visual patterns and extract specific reference qualities; do not let it override the product's clinical information hierarchy.
- Use [Design Skills](https://designskills.dev/) as a discovery directory only. Each linked skill has its own author, maintenance, license, and risk profile; directory inclusion is not a safety or quality endorsement.
- Treat [Taste Skill](https://www.tasteskill.dev/) as optional design-critique inspiration, not an authority. Verify the relevant skill version and whether its scope fits data-heavy operational dashboards before adopting it.
- Use [Transitions.dev](https://transitions.dev/) as a selective pattern catalog for real state changes. Avoid theatrical examples when they compete with clinical clarity, performance, or reduced-motion support.
- Do not install global CLIs or execute third-party skill scripts to obtain design guidance. Prefer reviewed text instructions and repo-local skills; add a dependency only after a separate security and compatibility review.
- The old cross-repository targets for `odontoflow-engineering` and `verification-before-completion` are unavailable. The dangling links have been replaced by portable repo-local skills with those names; the verification skill records its provenance, and the engineering skill explicitly does not claim to reproduce the missing original.
- The actual runtime is Next.js 16.3.4, React 18.3.1, TypeScript, Recharts 3.10.1, CSS Modules/Tailwind, Vitest, and Playwright-core. Use current repository contracts and local docs over generic claims from an external skill.
