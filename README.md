# Odonto Smart — MVP de simulación

Base técnica aislada para simular agenda, confirmaciones y recordatorios de citas. No usa Google Calendar, WhatsApp, llamadas, pacientes ni cuentas reales.

## Requisitos

- Node.js 20+
- PostgreSQL 16+ (opcional para ejecutar la migración y los seeds)

## Inicio rápido

```bash
npm install
npm test
npm run typecheck
```

## Frontend ODONTO SMART

La SPA de gestión clínica está construida con React, TypeScript, Vite, React Router, Axios y TailwindCSS. Para iniciarla:

```bash
npm run dev
```

Abre `http://127.0.0.1:5173`. Las rutas disponibles son `/agenda`, `/agente`, `/pacientes`, `/caja`, `/inventario` y `/chat`.

Mientras `VITE_USE_MOCKS=true`, el frontend usa los datos ficticios tipados de `src/mockData.ts`. La conexión futura al backend queda centralizada en `src/api.ts` mediante `VITE_BACKEND_URL`.

La verificación funcional y las capturas se pueden regenerar con:

```bash
npm run test:visual
```

Para levantar una base local ficticia:

```bash
docker compose up -d db
psql postgresql://simulator:simulator@localhost:5432/odonto_simulator -f db/migrations/001_initial.sql
psql postgresql://simulator:simulator@localhost:5432/odonto_simulator -f db/migrations/002_simulated_channels.sql
psql postgresql://simulator:simulator@localhost:5432/odonto_simulator -f db/migrations/003_end_to_end_followup.sql
psql postgresql://simulator:simulator@localhost:5432/odonto_simulator -f db/seeds/001_simulated.sql
psql postgresql://simulator:simulator@localhost:5432/odonto_simulator -f db/seeds/002_end_to_end_demo.sql
```

Para borrar y recrear **solo esa base de simulación**:

```bash
psql postgresql://simulator:simulator@localhost:5432/odonto_simulator -v CONFIRM_SIMULATION_RESET=true -f db/reset.sql
```

El diseño completo está en [docs/architecture.md](docs/architecture.md).

## Bandeja local de simulación

Después de aplicar ambas migraciones, configura `DATABASE_URL`, compila e inicia:

```bash
npm run build
npm start
```

Abre `http://127.0.0.1:3000`. La interfaz permite avanzar el reloj, ejecutar el scheduler, responder mensajes ficticios y actualizar resultados de llamadas simuladas. El servidor escucha únicamente en `127.0.0.1` y no realiza peticiones externas.

El botón **Ejecutar demo Ana** reinicia únicamente la sesión ficticia end-to-end y reproduce automáticamente 09:00, 12:00, 16:00, confirmación en llamada, recordatorio del mismo día y reconfirmación una hora antes. Puede repetirse sin generar duplicados.

La guía completa desde cero está en [docs/run-demo.md](docs/run-demo.md).

## Límites de esta entrega

Incluye el modelo PostgreSQL, datos ficticios, reloj virtual y adaptadores simulados. No incluye API HTTP, dashboard, scheduler automático ni integraciones externas.
