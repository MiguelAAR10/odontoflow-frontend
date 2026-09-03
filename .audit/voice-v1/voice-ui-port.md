---
title: Voice UI port — V1 handoff
status: evidence
date: 2026-09-02
donor_pr: https://github.com/leonardopanduro-rgb/ODONTO-SMART-FRONT/pull/1
donor_ref: alejandro/feat/asistente-voz
donor_head: c0f418dc5b296715fa4b0a6cb8cbd0da9f7eba0f
donor_base: 8769f12f5e3144fe5c2032d0f8445861dc304c76
canonical_baseline: 9595abdc3f77437ddb10e6816caf435deac00cb8
voice_service: MiguelAAR10/odontoflow-voice @ eb9a4ee (donor history preserved)
---

# Voice UI port — V1

## Authorship

**The voice assistant view is the work of Alejandro Jesus Marcelo CH
(`AlejandroMarceloCh`).** The layout, the recording interaction, the stepper,
the live inventory table, the editable summary and the latency readout are his
design and his code, contributed as
[ODONTO-SMART-FRONT#1](https://github.com/leonardopanduro-rgb/ODONTO-SMART-FRONT/pull/1)
(`c0f418d`).

This commit is an **intentional port**, not a merge and not a rewrite. The
donor branch was never merged, cherry-picked or rebased; it stays intact at
`alejandro/feat/asistente-voz`. The canonical frontend it lands on is built on
**Leonardo Panduro**'s original ODONTO SMART frontend (`8769f12`).

Provenance and the full port map:
`odontoflow-planning/CONTRIBUTIONS.md` ·
`odontoflow-planning/.audit/contributions/voice/frontend-voice-port-map.md`.

## What was ported, and how

Applied onto canonical `9595abd` — which was **7 commits and 36 files ahead**
of the donor's base, so each file was handled on its own terms.

| File | Classification | What happened |
|---|---|---|
| `src/App.tsx` | PORT_DIRECTLY | Route added, **wrapped in the `voiceEnabled` flag** |
| `src/components/Navbar.tsx` | PORT_DIRECTLY | Nav item added, flag-gated; donor's `Mic` icon kept |
| `src/types.ts` | PORT_DIRECTLY | Donor's 9 `Voice*` types appended **verbatim** |
| `src/index.css` | PORT_WITH_ADAPTER | Donor's 99 `.voz-*` lines **verbatim**; navbar squeeze scoped (below) |
| `src/api.ts` | PORT_WITH_ADAPTER | Voice surface re-exported from the new `src/voice.ts` |
| `src/pages/AsistenteVozPage.tsx` | PORT_WITH_ADAPTER | Donor's page, two adaptations (below) |
| `src/voice.ts` | **new** | The adapter seam: flag gate + the donor's five client calls |
| `test/voice-adapter.test.ts` | **new** | 8 tests proving the gate |

Preserved from the donor, unchanged in substance: the `AsistenteVozPage`,
`MediaRecorder` interaction, conversation history, voice **and** text input,
latency feedback, inventory summary, consultation summary, field correction,
graceful disconnected state, and the reuse of `Badge` / `DataTable` / `Button`.

## The three adaptations, and why

**1. The mock-mode bypass — the one real defect.** The donor's voice calls were
not gated on `VITE_USE_MOCKS`, so with mocks on (the default) the page still
fired live HTTP. That breaks the M4 guarantee the pilot E2E depends on.
`src/voice.ts` now guards **before** the transport is touched, and the gate is
AND, not OR:

| `VITE_ENABLE_VOICE` | `VITE_USE_MOCKS` | behaviour |
|---|---|---|
| `false` (default) | anything | route not registered; no HTTP ever |
| `true` | `true` (default) | page renders, **no HTTP ever** |
| `true` | `false` | live, against `VITE_VOICE_URL` |

Understandable omission: the donor branched before that convention tightened.

**2. The navbar squeeze, scoped instead of global.** The donor tightened
`.nav-link` globally (min-width 160→118, gap 27→15; 135→104 / gap 8 at the
1450px breakpoint) to fit a 7th item, verified at 1280 and 1440. Since voice is
now opt-in, applying that globally would degrade the default 6-item layout for
everyone. Same numbers, scoped to `.main-nav__links--dense`, which is applied
only when voice is enabled. The author explicitly offered alternatives (an
overflow menu, or nesting under `/chat`) — that decision is still open.

**3. `Borrador` labelling.** V1 is transport + UI. The summaries are **drafts**
for a human to confirm; nothing writes a Visit, ServiceExecution,
ServiceConsumption, Charge, Payment or InventoryMovement. The badge and the
copy say so, so no one mistakes a dictation for a booked fact.

## Verification

| Check | Result |
|---|---|
| `npm run typecheck` | **clean** |
| `npm run test` | **91 passed** (83 baseline + 8 new voice) |
| `npm run build` | **PASS** (the `api.ts` dynamic-import warning is pre-existing) |
| Pilot E2E (`test/pilot-e2e.test.ts`, fresh `odontoflow_e2e`, real FastAPI) | **12/12 PASS** — matches the M4 baseline |
| Patients integration | PASS |

### Browser E2E — real mode, voice enabled

Drove `odontoflow-voice` (:8000) + the SPA (:5173) with
`VITE_ENABLE_VOICE=true VITE_USE_MOCKS=false` in a real browser:

- `/asistente` loads; nav item present; health check → **"Conectado"**.
- **Text flow** works over real HTTP.
- **Inventory draft**: live table; `Pasta 12 · Cepillo 3 · Enjuague 5 · Eyector 8`; the self-correction *"tres, no, cuatro resinas"* resolved to **4**; `listo` did **not** close and named the 7 missing items; `igual` closed 12/12 without overwriting dictated values.
- **Consultation draft**: 5 questions → `Juan Perez`, `Curación con resina + Profilaxis`, `Anestesia ×2 + Aguja ×4`, `S/ 120`, `yape`, `ninguna`.
- **Field correction**: editing "Insumos gastados" to *"tres anestesias y seis agujas"* re-parsed to **×3 / ×6** — the parser re-interprets, raw text is never stored.
- **Restart** clears the session and returns to the menu.
- **Service down**: killed :8000 → **"Sin conexión"** + "El asistente no responde"; the SPA stayed fully usable.
- **All voice traffic went to `VITE_VOICE_URL` (:8000) and nowhere else.**

### Browser E2E — mock isolation

With `VITE_USE_MOCKS=true VITE_ENABLE_VOICE=true` and the voice service **up
and healthy**: the page rendered, explained itself ("Modo demo: el asistente de
voz no se contacta…"), sending a message changed nothing, and the network log
showed **zero requests to :8000** — static included. Inventory still loaded its
6 mock products with no error.

With `VITE_ENABLE_VOICE=false`: `/asistente` **redirected to `/agenda`**, the
nav item was **absent** (6 items, original geometry), and again **zero requests
to :8000**.

## Audio E2E — UNVERIFIED, deliberately not faked

The transcription path (`POST /audio`, `MediaRecorder` → faster-whisper) was
**not verified**. Two independent reasons:

1. **No TTS on this machine** to generate test audio — `say` is macOS-only and
   none of `espeak`, `espeak-ng`, `pico2wave`, `festival`, `flite` is installed.
   The donor's own `auditar.py` is blocked by the same thing.
2. Headless Chrome has no microphone, so `getUserMedia` cannot be exercised.

The donor's latency figures (2.2 s mean / 3.6 s worst) remain **the author's
measurements on Apple Silicon** and must be re-measured here before OdontoFlow
quotes them. The smallest fix is committing audio fixtures to
`odontoflow-voice`, which also removes the TTS dependency and makes the audio
assertions deterministic.

## Known limitation found while testing (pre-existing, not from this port)

**The canonical backend has no CORS middleware.** A browser calling `:8010`
from `:5173` is blocked by the browser (the same request via `curl` returns
200; an `OPTIONS` preflight returns `405`). This is why the pilot E2E is a
**node** harness rather than a browser one, and it means the SPA has never been
exercised in a browser against the real backend.

It is **not** a regression from this port, and it was **not** fixed here — the
backend is out of scope for V1. The voice service, by contrast, does declare
CORS for `:5173`, which is why the browser E2E above worked.

## Deployment note

`MediaRecorder` + `getUserMedia` require a **secure context** — HTTPS, or
`localhost`. Served over plain HTTP on a LAN IP, the microphone will silently
fail. Text input still works, which is why the donor kept it alongside the mic.
