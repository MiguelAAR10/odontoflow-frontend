# FE0 bootstrap visual baseline

Captured 2026-09-05 local time, before any Next.js migration, from the current
Vite application in mock mode.

## Runtime

- Harness: `npm run test:visual`
- Browser: WSL Playwright Chromium at
  `/home/miguel/.cache/ms-playwright/chromium-1181/chrome-linux/chrome`
- Harness fallback: the package-resolved Chromium revision was absent; the
  harness selected the installed Chromium revision automatically. An explicit
  `VISUAL_BROWSER_PATH` override remains supported.
- Evidence directory: `.audit/fe0-bootstrap/baseline/`
- Page errors: `0`
- Console errors: `0`

## Captures

| Route/flow | Evidence |
| --- | --- |
| Agenda | `agenda.png` |
| Agent | `agente.png` |
| Patients | `pacientes.png` |
| Cash | `caja.png` |
| Inventory | `inventario.png` |
| Chat | `chat.png` |
| Responsive agenda | `agenda-mobile.png` |

All seven route screenshots exist and are current-browser evidence. The legacy
interaction runner also exposed two pre-existing expectation drifts without
page or console errors: it expects the Cash heading `Control de caja` while
the current page renders `Cobros`, and it selects Inventory options by label as
if their value were the label. Those assertions are recorded for FE0B; no
product UI or behavior was changed in FE0.

## SHA-256

```text
107fc57bfc764feb0fe6a924b58224f8d13b23835354c69155dfd31d9c1d6487  caja.png
5ddfca31103673750e7a93fa731a9810f9ea5446fa3ccd914bf178f945ed977c  agenda-mobile.png
67365caa9f3ab3a37fec9caad34cd135fdfd9f5b1f7c56e6771340d41c4688c8  inventario.png
8e9e5f68c3018641c559efad6e154146335cdfdda8d16b040047f4d640038b6a  agente.png
9e00ff4319f53075ac6095d5accc8175a8ea48c738301ae619ecc095a9e284ee  agenda.png
c373fa5282d4bd16bd1188354186ee13cdf99bb296450981af573121df2a608c  pacientes.png
d4fc3f6291e5c2a606563aae81baba1d4af25e47b7df9106aecdcfcdb96b091a  chat.png
```
