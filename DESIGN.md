# OdontoFlow ERP — Odonto Smart visual contract

This document is the canonical visual contract for the OdontoFlow operational
frontend. It translates the public Odonto Smart identity into a readable,
responsive clinic workspace. It is intentionally not a copy of the landing
page contract: an ERP must privilege scanning, focus, data density, clear
states, and dependable controls over cinematic presentation.

## Brand DNA

Odonto Smart is premium health-tech with a human, editorial edge:

- clinical trust comes from white space, precise type, clear status language,
  and real operational context;
- identity comes from cyan motion/energy, magenta moments, and a deep dark
  shell that frames the workspace;
- the tooth mark and official wordmark are authored assets, never recreated
  with icons or text;
- depth is selective: one shell, one overlay, one purposeful accent surface.

The ERP should feel like the same brand as the public experience while being
calmer, more legible, and more task-oriented.

## Material language — owner decision

OdontoFlow ERP uses **Odonto Smart branded claymorphism as the primary
interactive material** and **restrained glassmorphism as a secondary layering
material**. These are interaction and hierarchy tools, not a license to turn
the workspace into a decorative effects surface.

The four material classes are:

| Class | Role | Allowed treatment |
| --- | --- | --- |
| `brand-dark` | identity shell, dark navigation, identity moments | `#0A0F1A`/`#1A0A2E`, controlled cyan/magenta radial depth, optional subtle grain; readable light text and visible focus |
| `clay-interactive` | buttons, filters, summary cards and other actionable or glanceable controls | a light `surface`/`surface-soft` body, a small border and restrained directional shadow/highlight that communicates pressable depth; never status semantics |
| `glass-overlay` | topbar context, drawers, popovers and overlays where a surface sits above another scene | translucent dark or light layer, controlled blur, solid fallback, strong border/scrim and readable content; only where content exists behind the layer |
| `flat-data` | calendar, tables, dense forms and data grids | solid `surface`, `surface-muted` or `canvas`, borders and semantic status treatments; no blur, decorative glow or blanket shadow |

Material rules:

- Calendar, table and data-grid regions remain primarily `flat-data` so dates,
  names, statuses and numeric values stay scannable.
- Filters, buttons and summary cards may use `clay-interactive` for tactile
  hierarchy. The depth must stay shallow and must not imply success, failure,
  payment or clinical state.
- The topbar, drawers and overlays may use restrained `glass-overlay`. A solid
  background fallback is required, and the treatment must not hide focus,
  labels or error copy.
- Cyan and magenta remain brand accents, never status colors. Confirmed,
  pending, cancelled, error and informational meaning always use semantic
  tokens with text, not identity color alone.
- Operational surfaces must remain WCAG-readable. Do not globally add blur,
  glow, gradients or shadows to every component; borders and spacing carry the
  majority of separation.

The approved landing grain, radial depth and premium shell effects are allowed
only on `brand-dark` identity surfaces and selected `glass-overlay` contexts.
They are not allowed behind normal calendar/table rows, filters as decoration,
or dense inventory and patient data. A material effect is successful only when
it clarifies the layer or the action it belongs to.

## Landing → ERP translation

| Public identity | ERP expression |
| --- | --- |
| dark cinematic canvas | persistent dark sidebar and restrained dark overlay treatment |
| cyan/magenta energy | active navigation, primary actions, demo context, small identity accents |
| editorial display type | page titles and rare KPI/identity moments only |
| operational sans type | navigation, search, filters, forms, tables, badges, body copy |
| organic glow/noise/halos | shell depth or login/onboarding only; never behind dense data |
| photography | reserved for future login/onboarding; not used as a workspace background |

Allowed landing effects in ERP:

- a quiet cyan/magenta radial depth behind the sidebar;
- a restrained deep surface in shell/overlay contexts;
- a very subtle grain only on an identity surface when it does not reduce
  contrast or legibility.

Not allowed in normal workspace surfaces: blanket gradients, glassmorphism,
blurred cards, decorative glow behind tables, noisy page backgrounds, or
recolored/filtered logo artwork.

## Logo usage and provenance

Use `BrandLogo` and the verified transparent PNGs under
`public/brand/odonto-smart/logos/`:

- `logo-horizontal-marca-premium.png` for the desktop sidebar and topbar,
  including the compact mobile topbar lockup;
- `logo-circular-emblema-marca.png` for a genuinely emblem-only compact
  surface when one is introduced;
- `logo-principal.png` only when a compact wordmark surface needs it.

The official artwork is rendered as an image with explicit dimensions. Do not
rebuild ODONTO SMART from text, Lucide icons, CSS borders, filters, shadows, or
color overrides. Do not use the source SVG with its opaque background trap.
The source/destination/hash ledger is
`public/brand/odonto-smart/BRAND_ASSETS.md`; it is the asset provenance
authority for this repository. FE1A requires no additional asset copy.

## Typography

The source-approved Fontshare delivery mechanism is used in
`src/index.css`; no font binaries are checked in.

- `Clash Display`: major page headings, section identity, and rare key metric
  moments. Keep it out of long operational copy.
- `Satoshi`: navigation, search, filters, forms, tables, buttons, badges,
  statuses, and all normal body copy.
- Inter is not the visible application default and Google Fonts is not used.

The operational type scale is intentionally compact: page titles are roughly
26–34px, section titles 18–20px, body copy 13–16px, labels 10–12px, and data
should use tabular or stable numerals where comparison matters.

## Tokens

Raw brand primitives live in `src/tokens.css` and are consumed through
semantic roles in shared CSS. The canonical values are:

| Role | Value |
| --- | --- |
| cyan | `#41D4CB` |
| cyan strong | `#2BB5AD` |
| magenta | `#DE1BCE` |
| deep | `#1A0A2E` |
| dark | `#0A0F1A` |
| canvas | `#FAFBFC` |
| surface | `#FFFFFF` |
| surface soft | `#F0FDFB` |
| text primary | `#0F172A` |
| text secondary | `#475569` |
| border | `#E2E8F0` |

Accessible ink derivatives (`#0E6E68` and `#96108C`) are for text or icon
contrast when the luminous brand colors are not readable. Status colors are a
separate semantic family: success `#0A7F45`, warning `#B4690E`, danger
`#C4183C`, info `#1A6FC4`, and neutral `#475569`, each with a light surface
and border token. Never use magenta or cyan as a substitute for danger,
success, or warning.

## Surface hierarchy

1. `canvas` is the quiet page background.
2. `surface` is the primary card, table, form, and calendar surface.
3. `surface-soft` supports active/selected/agent context without competing
   with the data.
4. `surface-sunken`/`surface-muted` support table headers, message history,
   and secondary wells.
5. `shell` and `shell-raised` are reserved for navigation, identity, and
   elevated overlays.

Borders carry most separation. Shadows are sparse: small on cards, medium on
the topbar/dropdowns, and large only for a drawer or modal.

Material mapping for the ERP is explicit: shell and identity surfaces are
`brand-dark`; actionable controls and compact summaries are
`clay-interactive`; topbar context, drawers and overlays are
`glass-overlay`; calendars, tables, forms and inventory grids are `flat-data`.
When a component contains both data and an action, the data remains flat and
only the action affordance receives clay depth.

## Texture, depth, spacing, radii, and shadows

- The sidebar may use controlled cyan/magenta radial depth over `#0A0F1A`.
- Workspace tables, calendars, inventories, and forms stay solid and
  readable.
- Drawers and modals use controlled elevation and a dark scrim; no blanket
  glass effect.
- Use the 4px spacing base with 8/12/16/20/24/32/40/48px steps. Prefer
  generous page gutters and compact data rows rather than arbitrary one-off
  spacing.
- Use 6px for small controls, 10px for fields/cards, 14px for major panels,
  20px for feature surfaces, and pill radii only for statuses/demos.
- Use `shadow-sm` for cards, `shadow-md` for popovers/topbar emphasis, and
  `shadow-lg` for modal/drawer elevation.

## Motion

The source easing family is `cubic-bezier(0.22, 1, 0.36, 1)`. ERP motion is
short and functional: 120ms for hover/focus feedback, 180ms for drawer and
state transitions. Keep content changes stable; do not animate table rows or
use decorative loops. `prefers-reduced-motion: reduce` disables nonessential
transitions and animation.

## Responsive rules

- Desktop: persistent 248px sidebar, sticky topbar, fluid workspace.
- Tablet: persistent compact 220px sidebar, reduced context density, and
  wrapped page actions; content remains scrollable rather than squeezed into
  the top navigation.
- Mobile: the sidebar becomes a drawer with a visible scrim and keyboard/
  screen-reader close action; the topbar keeps menu, the compact horizontal
  official logo lockup, local context, and a floating New Appointment action.
- Calendar and wide tables may scroll within their data region. The shell and
  page body must not create accidental horizontal overflow.
- Focus remains visible at every breakpoint and controls preserve a practical
  44px touch target.

## Navigation and shell

The operational shell is sidebar + topbar + workspace. Navigation groups are
fixed to the current product surface:

- `OPERACIÓN`: Agenda, Pacientes
- `GESTIÓN`: Caja, Inventario
- `IA & CANALES`: Agente IA, Chat, and Asistente only when the existing voice
  flag is enabled

The topbar preserves working global patient search, a neutral location context
slot, a notification slot, a clearly local/demo user slot, and New Appointment.
Until FE1B/Clerk, the user slot says `Contexto local / Sin sesión`; it must not
present a fictional authenticated person. The location label `Todas las sedes`
is a neutral workspace context and is not a replacement for backend location
authority.

## Controls

### Buttons

Primary actions use cyan with deep readable ink. Secondary actions use a white
surface and border. Danger uses the danger semantic family. Ghost actions are
reserved for low-emphasis navigation or inline dismissal. Every button keeps
its existing public behavior and supports a visible focus state.

### Inputs and selects

Fields use white surfaces, `#E2E8F0` borders, clear labels, and the accent
focus ring. Placeholder copy is secondary and never the only label. Selects
keep their native keyboard behavior; decorative chevrons are not the only
affordance.

### Badges and status

Badges are compact pills with text plus color, not color alone. Existing
business status mappings stay intact. Cyan/magenta identity accents must not
erase success, warning, danger, info, or neutral meaning.

### Tabs

Tabs are used only for an actual view filter, such as the Agent activity
filter. The active state is visible through text, border, and pressed state.
Arrow/Home/End keys move focus and the filter remains operable as a native
button for existing flows.

### Drawers and modals

The mobile navigation drawer has an explicit close action and scrim. Modals
retain Escape and backdrop dismissal, a labelled dialog heading, readable
forms, and stable focus-visible controls. FE1A does not change workflow
semantics or API behavior.

## Domain surfaces

### Tables

Tables use readable solid surfaces, scoped column headers, consistent row
height, hover only as a low-key affordance, and a scroll region on narrow
screens. Empty/loading/error states are explicit and announced where the
existing view supports it.

### Calendar

The Agenda calendar keeps its current week grid, appointment selection,
cancellation, and reschedule behavior. The visual layer improves contrast,
surface hierarchy, and responsive scrolling without changing scheduling logic.

### Inventory

Inventory keeps its existing product, balance, movement, entry, adjustment,
transfer, and Kardex actions. Stock bars and movement/status labels use
semantic status colors. No inventory authority moves into the brand layer.

### Agent and channels

Agent cards, automation steps, attention queues, Chat, and Voice use the same
shell and primitives. Agent/Chat context may use a restrained soft cyan
surface; human attention and operational statuses remain semantic. Voice is
visible in IA & CANALES only when `NEXT_PUBLIC_ENABLE_VOICE=true`.

## Accessibility

The contract requires keyboard navigation, visible focus, semantic headings,
labelled controls, scoped table headers, adequate contrast, text alternatives
for the official logo, reduced-motion support, and no information conveyed by
color alone. Verify with the real browser at desktop, tablet, and 390px mobile
widths. Accessibility fixes must not invent auth or business data.

## Data boundary and presentation

Brand/public data is limited to identity, assets, terminology reference, and
public clinic context. It is not runtime business state. Operational data
continues to flow browser → typed client → FastAPI → canonical PostgreSQL.
Landing services/locations are not backend truth. Mock mode is permitted for
development and visual evidence only and is always marked `DATOS DEMO` in the
shell. Real-mode errors remain visible instead of being disguised as empty
success states.

## Do / don't

| Do | Don't |
| --- | --- |
| use the official transparent PNG through `BrandLogo` | draw a tooth with CSS or an icon and call it the logo |
| put cyan on a primary action and magenta on a small identity moment | turn every card into a neon gradient |
| keep tables white and calm | put noise, blur, or glow behind dense rows |
| show `Contexto local / Sin sesión` before Clerk | hardcode Leonardo or any fictional signed-in person |
| mark mock data visibly | make synthetic patients look like backend truth |
| preserve existing Agenda/Inventory interactions | use a visual refresh to alter scheduling or stock behavior |

## Screenshot and evidence references

FE1A evidence is stored outside the protected product screenshot directory:

- before baseline: `.audit/fe1a-visual/before/mock/`;
- final shell/route captures: `.audit/fe1a-visual/after/`;
- final browser verification report: `.audit/fe1a-browser-verification.json`;
- planning handoff: `../odontoflow-planning/docs/handoffs/plans/2026-09-06-fe1a-odonto-smart-visual-foundation.md`.

FE2 evidence is stored under `.audit/fe2-browser-real/`:

- report: `.audit/fe2-browser-real.json`;
- Agenda captures: `agenda-1440-after-create.png`, `agenda-1024.png`, and
  `agenda-390.png`;
- appointment captures: `appointment-drawer-1440.png`,
  `appointment-after-reschedule.png`, `cancellation-confirmation.png`, and
  `appointment-cancelled.png`;
- shell/inventory captures: `shell-mobile-drawer-390.png` and
  `inventory-1440.png`.

The FE2 handoff records the exact dimensions, route checks, console/page
errors, official logo/font checks, contract map, and any deviations observed
in the real browser.
