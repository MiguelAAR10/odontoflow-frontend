# OdontoSmart Frontend

SPA de gestión clínica (React + TypeScript + Vite) + harness de simulación aislado para
agenda, confirmaciones y recordatorios de citas. Repositorio hermano de
[`odontoflow-backend`](../odontoflow-backend/) (la autoridad de dominio).

> **Estado**: MVP de simulación funcional. La integración con el backend real está definida por contrato
> (ver [Integración](#integración)); el primer vertical es **Agenda ↔ Scheduling**.

## Stack

| Capa | Elección |
|---|---|
| SPA | React 18 + TypeScript + Vite + TailwindCSS |
| Navegación | React Router (`/agenda`, `/agente`, `/pacientes`, `/caja`, `/inventario`, `/chat`) |
| HTTP | Axios (`src/api.ts`, `baseURL = VITE_BACKEND_URL`) |
| Simulación | Node + PostgreSQL dedicado (`db/`, puerto 5432 local de simulación) — ver [Simulador](#simulador) |
| Tests | Vitest (`test/`) + script visual (`npm run test:visual`) |

## Requisitos

- Node.js 20+
- PostgreSQL 16+ (opcional: solo para ejecutar la simulación)

## Inicio rápido

```bash
npm install
npm test        # vitest: simulación + recordatorios + e2e followup
npm run typecheck
npm run dev     # SPA en http://127.0.0.1:5173
```

Mientras `VITE_USE_MOCKS=true`, la SPA usa los datos tipados de `src/mockData.ts` (clonados por llamada).
La conexión futura al backend queda centralizada en `src/api.ts` mediante `VITE_BACKEND_URL`.

## Variables de entorno

| Variable | Default | Uso |
|---|---|---|
| `VITE_BACKEND_URL` | `http://localhost:8080` | Base URL del backend real (ver contrato de integración) |
| `VITE_USE_MOCKS` | `true` | `true` → todo desde `mockData.ts`; `false` → llamadas HTTP reales |

Ver `.env.example`.

## Estructura

```
src/
  App.tsx           # rutas SPA
  api.ts            # cliente HTTP + fallback mock (punto de integración)
  types.ts          # tipos de UI (los tipos de API se generarán desde OpenAPI)
  mockData.ts       # datos ficticios (diseño/prototipo, nunca autoritativos)
  pages/            # Agenda, Agente, Pacientes, Caja, Inventario, Chat
  components/       # AppShell, Header, Badge, DataTable, KpiCard, Modal, ...
  domain/           # tipos/ports del dominio de simulación (independiente de la UI)
  simulation/       # FollowupEngine, ReminderScheduler, SimulationClock, adapters
  server.ts         # harness HTTP de simulación (127.0.0.1:3000)
test/               # vitest (simulation, reminder-flow, end-to-end-followup, ui)
db/                 # schema + seeds de la simulación (PostgreSQL dedicado)
docs/               # architecture.md (FollowupEngine = referencia), run-demo.md
```

## Simulador (referencia, no integrable)

El harness (`src/server.ts`, puerto 3000, con su propia base PostgreSQL `odonto_simulator`) simula el ciclo
de confirmación de citas: reloj virtual en hora de Lima, motor de seguimiento (`FollowupEngine`:
recordatorio día antes 09:00, llamadas 12:00/16:00, mismo día 09:00, una hora antes), scheduler de
recordatorios y procesador de eventos (confirmar/cancelar/reprogramar/sin respuesta), con persistencia
idempotente por sesión.

**Decisión de arquitectura**: este comportamiento es **referencia** para un futuro módulo de seguimiento en
el backend; **no se copia** a OdontoFlow ni se conecta a la SPA real.

```bash
# Base local de simulación
docker compose up -d db
psql postgresql://simulator:simulator@localhost:5432/odonto_simulator -f db/migrations/001_initial.sql
psql postgresql://simulator:simulator@localhost:5432/odonto_simulator -f db/migrations/002_simulated_channels.sql
psql postgresql://simulator:simulator@localhost:5432/odonto_simulator -f db/migrations/003_end_to_end_followup.sql
psql postgresql://simulator:simulator@localhost:5432/odonto_simulator -f db/seeds/001_simulated.sql
psql postgresql://simulator:simulator@localhost:5432/odonto_simulator -f db/seeds/002_end_to_end_demo.sql

# Borrar y recrear solo esa base de simulación
psql postgresql://simulator:simulator@localhost:5432/odonto_simulator -v CONFIRM_SIMULATION_RESET=true -f db/reset.sql
```

## Integración

El contrato con el backend (matriz acción → endpoint, mapeo de tipos/errores, idempotencia, primer vertical
**Agenda ↔ Scheduling**) está definido en:

- [`odontoflow-backend/docs/integration/frontend-current-state.md`](../odontoflow-backend/docs/integration/frontend-current-state.md)
- [`odontoflow-backend/docs/integration/frontend-backend-contract.md`](../odontoflow-backend/docs/integration/frontend-backend-contract.md)
- [`odontoflow-backend/docs/integration/module-integration-map.md`](../odontoflow-backend/docs/integration/module-integration-map.md)
- [`odontoflow-backend/docs/integration/data-flow.md`](../odontoflow-backend/docs/integration/data-flow.md)

Principios: FastAPI/PostgreSQL es la autoridad de dominio; el diseño visual React se conserva; los tipos de
API se generan desde OpenAPI; las pantallas sin autoridad de backend (Caja, Inventario, Chat, Agente)
permanecen como prototipo mock.
