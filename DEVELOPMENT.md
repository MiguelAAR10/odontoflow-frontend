# odontoflow-frontend — DEVELOPMENT

## Qué es este repo

**La aplicación real de OdontoFlow.** React + Next.js App Router + TypeScript. Construida
originalmente por **Leonardo Panduro** (commit `8769f12`, "Implement ODONTO
SMART frontend") — todo lo que hay encima, incluido este archivo, se apoya en
ese trabajo.

**Verificación histórica (2026-09-03):** typecheck limpio, 91 tests unitarios PASS,
Pilot E2E 12/12 contra el backend real en esa fecha. Detalle sin filtrar en
`odontoflow-planning/docs/handoffs/discovery/ODONTOFLOW_CTO_DISCOVERY_VERIFICATION.md`.
Para el estado y los comandos actuales, consulta [`README.md`](README.md).

## Función de desarrollo — la regla que organiza todo el repo

Cada página se gatea con `useMocks` (de `src/api.ts`, controlado por
`NEXT_PUBLIC_USE_MOCKS`):

| Página | Estado |
|---|---|
| Agenda, Pacientes, Caja, Inventario | **REAL** — llaman al backend de verdad cuando `NEXT_PUBLIC_USE_MOCKS=false` |
| Bandeja, Actividad (feed + Corridas), Productividad | **REAL** — `/agent/inbox`, `/activity`, `/agent-runs` y `/metrics/productivity` (solo personas; Productividad exige `audit.read`). El menú las muestra según los `permissions` de `/me`. |
| Chat | **PROTOTIPO** — la pantalla de diseño usa mocks; todavía no consume `/conversations`. |
| Asistente de voz | **PARCIAL** — detrás de `NEXT_PUBLIC_ENABLE_VOICE` (apagado por defecto), nunca hace HTTP en modo mock, produce solo borradores |
| Configuración | **VISTA PREVIA** — muestra áreas de administración, sin guardar cambios ni gestionar roles reales |

Desarrollar acá significa: si tu feature toca datos de negocio reales, síguele
el patrón `useMocks` a una página que ya lo hace bien (`CashPage.tsx` o
`InventoryPage.tsx` son los ejemplos más limpios) antes de escribir código
nuevo.

## Cómo arrancar

```bash
npm install
npm run dev              # modo mock por defecto
npm test                 # suite unitaria y de adaptadores
npm run typecheck
npm run test:e2e:pilot    # requiere backend + PostgreSQL reales
```

## BFF — el navegador solo habla con su propio origen

En modo real el navegador llama a `/api/backend/*` (base por defecto en
`src/env.ts`). El Route Handler `app/api/backend/[...path]/route.ts` delega en
`src/bff/proxy.ts`, que reenvía método, ruta, query y body al backend e inyecta
el bearer en el servidor. Qué bearer lo decide `src/bff/personas.ts`:

- cookie httpOnly `of_persona` con una persona conocida (`secretaria`,
  `administrador`) → el token humano de esa persona, tomado de
  `BACKEND_DEMO_HUMANS` (JSON del seed `[{role, display_name, token}]`);
- cookie con una persona desconocida → sin bearer (el backend responde 401),
  nunca el de otra persona;
- sin cookie, o rutas solo-integración (`/public/*`) → `BACKEND_DEMO_TOKEN`.

`app/api/session/route.ts` lista las personas (sin tokens) y fija o borra la
cookie (`POST {persona}` solo JSON y del mismo origen). Quién está dentro, con
sus roles y permisos, lo dice el backend en `GET /me`; el menú lateral y la
Bandeja se gobiernan solo con esos `permissions`.

- Variables solo de servidor: `BACKEND_URL` (default `http://127.0.0.1:8010`),
  `BACKEND_DEMO_TOKEN` y `BACKEND_DEMO_HUMANS` (opcionales). Nunca con prefijo
  `NEXT_PUBLIC_`; nada bajo `src/` las lee (lo vigila
  `test/bff-secret-guard.test.ts`).
- Solo pasan `content-type`, `accept`, `idempotency-key`, `x-request-id`; se
  descartan `authorization`/`cookie` del navegador. De vuelta pasa
  `Idempotent-Replay` para que la UI distinga un replay de una ejecución nueva. El envelope de error del
  backend pasa intacto (`toApiError` sigue igual).
- Rechazos propios: `..`/segmentos vacíos → 400 `BFF_BAD_PATH`; `/internal/*` →
  403 `BFF_FORBIDDEN_PATH`; backend caído → 502 `BACKEND_UNREACHABLE`.
- `NEXT_PUBLIC_BACKEND_URL` solo sirve para la suite de integración en Node
  (conexión directa); `test/setup-e2e-auth.ts` agrega el bearer si el proceso
  de test tiene `BACKEND_DEMO_TOKEN`.

## El patrón para integrar una contribución externa — ya probado una vez

Cuando se portó la vista de voz de Alejandro (PR externo, rama
`alejandro/feat/asistente-voz`, nunca fusionada) al canónico, el patrón fue:

1. Nunca mergear/cherry-pick la rama donante directamente — el canónico ya
   había avanzado y el merge automático habría sido incorrecto.
2. Portar archivo por archivo, decidiendo caso a caso: directo, con
   adaptador, o solo como referencia de diseño.
3. La adaptación real que hizo falta: el donante no respetaba el gate
   `NEXT_PUBLIC_USE_MOCKS` — se corrigió en `src/voice.ts` antes de portar la UI.
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
