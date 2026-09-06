# Odonto Smart frontend brand contract

Status: extracted 2026-09-05 for FE0; implementation and screen restyling are
out of scope until the Next.js parity migration is complete.

Source of truth (read-only):

- `/home/miguel/projects/portfolio/ODONTO-SMART/DESIGN.md`
- `/home/miguel/projects/portfolio/ODONTO-SMART/src/app/globals.css`
- `/home/miguel/projects/portfolio/ODONTO-SMART/src/data/content.ts`
- `/home/miguel/projects/portfolio/ODONTO-SMART/src/data/pages-content.ts`

The values below are copied from the source tokens, not reconstructed from the
current operational frontend or from memory. The asset mapping is recorded in
[`public/brand/odonto-smart/BRAND_ASSETS.md`](../../public/brand/odonto-smart/BRAND_ASSETS.md).

## Brand colors

These are identity colors. They are not status meanings.

| Contract token | Source token | Value | Intended use |
| --- | --- | --- | --- |
| `brand-cyan` | `--color-brand-teal` | `#41D4CB` | brand technology/focus accent, icons, lines, dark-surface highlights |
| `brand-cyan-strong` | `--color-brand-teal-strong` | `#2BB5AD` | interaction and denser active surfaces |
| `brand-magenta` | `--color-brand-purple` | `#DE1BCE` | secondary identity accent, aesthetic emphasis and gradients |
| `brand-deep` | `--color-brand-deep` | `#1A0A2E` | deep brand surface and contrast |
| `dark-background` | `--color-bg-dark` | `#0A0F1A` | dark scenes, hero/CTA/overlay surfaces |
| `dark-footer` | `--color-footer-bg` | `#0C1322` | footer and secondary dark navigation |
| `canvas` | `--color-bg-page` | `#FAFBFC` | page canvas |
| `surface` | `--color-bg-main` | `#FFFFFF` | primary content surface |
| `surface-soft` | `--color-bg-soft` | `#F0FDFB` | lightly tinted clinical surface |
| `text-primary` | `--color-text-dark` | `#0F172A` | titles, names and primary body text |
| `text-secondary` | `--color-text-muted` | `#475569` | descriptions and supporting text |
| `text-on-dark` | `--color-text-light` | `#94A3B8` | auxiliary text on dark surfaces |
| `border` | `--color-border-subtle` | `#E2E8F0` | subtle borders and separators |

`#25D366` is the explicit WhatsApp channel color in the source. It is a
channel-specific token, not a general success color. The source gradients are
available as brand compositions, but must not be used for ordinary paragraph
text or operational status labels.

Accessibility constraints copied from the source: brand cyan and strong cyan
are not small text on white; magenta is not normal-sized text on white; muted
text is preferred for readable secondary text; cyan is strongest on the dark
background. Use visible focus treatment and preserve reduced-motion behavior.

## Semantic intent colors

Semantic roles are kept separate from the brand palette. These operational
values are the existing frontend status palette (`src/index.css`) and are not
identity substitutions:

| Semantic token | Value | Meaning |
| --- | --- | --- |
| `action-primary` | `brand-cyan-strong` (`#2BB5AD`) | primary user action; never implies success by itself |
| `focus` | `brand-cyan` (`#41D4CB`) | keyboard/focus indication, used as a ring or non-text treatment |
| `success` | `#0CA453` | completed, active or healthy state |
| `warning` | `#EC8A00` | pending, attention or low-stock state |
| `danger` | `#E51C3A` | failed, destructive or cancelled state |
| `info` | `#0872C9` | neutral informational state |

Never define `brand-magenta = danger` or `brand-cyan = success`. A status role
must remain understandable if the identity palette changes, and a brand accent
must not acquire a clinical or financial meaning accidentally.

## Typography contract

- **Clash Display** is for display headings and selected key metrics only.
- **Satoshi** is for operational UI: navigation, forms, tables, buttons and
  labels. Clash Display must not be used in dense tables.
- The source currently delivers both families through Fontshare CSS imports in
  `src/app/globals.css`. FE0 copies no font binaries. Future implementation
  must use that supported delivery mechanism or a separately verified,
  licensed delivery path before self-hosting.
- The source's historical “Inter Only” style-guide note is stale; it is not a
  typography authority for this contract.

## FE0 boundary

This contract is implementation guidance only. FE0 does not recolor logos,
rewrite application screens, replace the existing operational CSS, add a
component library, or redesign the experience. Next.js parity work must keep
FastAPI as business authority and must not introduce direct browser Supabase
access, Supabase Auth, Clerk configuration, or business logic in Next.js.
