# odontoflow-frontend — DEVELOPMENT

## Qué es este repo

**La SPA real de OdontoFlow.** React + Vite + TypeScript. Construida
originalmente por **Leonardo Panduro** (commit `8769f12`, "Implement ODONTO
SMART frontend") — todo lo que hay encima, incluido este archivo, se apoya en
ese trabajo.

**Estado verificado (2026-09-03):** typecheck limpio, 91 tests unitarios PASS,
Pilot E2E 12/12 contra el backend real. Detalle sin filtrar en
`odontoflow-planning/docs/handoffs/discovery/ODONTOFLOW_CTO_DISCOVERY_VERIFICATION.md`.

## Función de desarrollo — la regla que organiza todo el repo

Cada página se gatea con `useMocks` (de `src/api.ts`, controlado por
`VITE_USE_MOCKS`):

| Página | Estado |
|---|---|
| Agenda, Pacientes, Caja, Inventario | **REAL** — llaman al backend de verdad cuando `VITE_USE_MOCKS=false` |
| Chat, Agente IA | **PROTOTIPO** — datos mock siempre, incluso el llamado "modo real" apunta a endpoints (`/conversations`, `/agent/dashboard`) que **no existen en el backend todavía** |
| Asistente de voz | **PARCIAL** — detrás de `VITE_ENABLE_VOICE` (apagado por defecto), nunca hace HTTP en modo mock, produce solo borradores |

Desarrollar acá significa: si tu feature toca datos de negocio reales, síguele
el patrón `useMocks` a una página que ya lo hace bien (`CashPage.tsx` o
`InventoryPage.tsx` son los ejemplos más limpios) antes de escribir código
nuevo.

## Cómo arrancar

```bash
npm install
npm run dev              # modo mock por defecto
npm test                 # 91 tests
npm run typecheck
npm run test:e2e:pilot    # requiere backend + PostgreSQL reales
```

## El patrón para integrar una contribución externa — ya probado una vez

Cuando se portó la vista de voz de Alejandro (PR externo, rama
`alejandro/feat/asistente-voz`, nunca fusionada) al canónico, el patrón fue:

1. Nunca mergear/cherry-pick la rama donante directamente — el canónico ya
   había avanzado y el merge automático habría sido incorrecto.
2. Portar archivo por archivo, decidiendo caso a caso: directo, con
   adaptador, o solo como referencia de diseño.
3. La adaptación real que hizo falta: el donante no respetaba el gate
   `VITE_USE_MOCKS` — se corrigió en `src/voice.ts` antes de portar la UI.
4. El commit final acredita al autor original con `Co-authored-by`.

Detalle completo en `.audit/voice-v1/voice-ui-port.md`. Si vas a portar tu
propio trabajo (o el de alguien más) al canónico, sigue el mismo patrón.

## Diseño

`odontoflow-planning/VISUAL_BASELINE.md` tiene las 7 capturas originales de
Leonardo con hash verificado — es la referencia de intención de diseño, no
una especificación de UI. El simulador (`odontoflow-sim`) tiene su propio
lenguaje visual (estación oscura, monospace) — son dos líneas de diseño
distintas a propósito, no las mezcles sin decidirlo primero.

## Lo que falta

Nada de Chat/Agente es real todavía porque el backend no tiene esos
endpoints (ver `odontoflow-backend/DEVELOPMENT.md`). No construyas más UI
sobre esos mocks hasta que el backend exista — es exactamente el tipo de
"impresionante pero desconectado" que la discovery señala como el mayor
riesgo del proyecto hoy.
