# OdontoFlow Frontend

Interfaz de operación clínica construida con Next.js App Router, React y TypeScript. El frontend adapta las respuestas del backend FastAPI; el backend es la autoridad para disponibilidad, precios, cobros, inventario y permisos.

## Iniciar la interfaz

Requiere Node.js 24 (versión indicada en `.nvmrc`).

```bash
npm ci
npm run dev
```

Abre [http://127.0.0.1:5173/agenda](http://127.0.0.1:5173/agenda). Por defecto se usan datos de demostración; no hace falta levantar el backend para revisar el diseño. Las variables disponibles están explicadas en [`.env.example`](.env.example).

Para conectar el backend, crea `.env.local` con `NEXT_PUBLIC_USE_MOCKS=false`, `BACKEND_URL=http://127.0.0.1:8010` y (si el backend lo exige) `BACKEND_DEMO_TOKEN=<credencial>` — ambas solo de servidor: el navegador habla con `/api/backend/*` y Next reenvía al backend (ver "BFF" en `DEVELOPMENT.md`) —, e inicia FastAPI y PostgreSQL según el README del repositorio `odontoflow-backend`. Chat aún no consume el contrato de conversaciones de ese backend.

## Estado de los módulos

| Ruta | Estado actual |
| --- | --- |
| `/agenda` | Citas y disponibilidad conectadas al backend en modo real. El calendario y los filtros son de la interfaz. Editar/eliminar una cita y agregar un usuario a la lista son interacciones de demostración; el backend ofrece reprogramar y cancelar, no borrar. |
| `/pacientes` | Lectura y registro conectados a `/patients` en modo real. |
| `/caja` | Cargos y pagos conectados a `/charges` y `/charges/{id}/payments` en modo real. |
| `/inventario` | Productos, saldos por sede, movimientos, entradas, ajustes y transferencias conectados en modo real. |
| `/chat` | Prototipo para explorar conversaciones, filtros y transferencia. Las asignaciones de secretarias son temporales en modo demo; no hay persistencia de chats en el backend actual. |
| `/agente` | Prototipo visual; sus métricas y actividad no provienen del backend operativo. |
| `/configuracion` | Mapa de secciones previsto para el administrador; aún no edita usuarios, roles ni ajustes. |
| `/asistente` | Asistente de voz opcional. Oculto por defecto; `NEXT_PUBLIC_ENABLE_VOICE=true` muestra la pantalla. En modo demo no envía peticiones al servicio de voz. |

El nombre de administrador mostrado en modo demo es una muestra visual, no una sesión autenticada. El panel de notificaciones también es una vista previa sin servicio conectado.

## Comandos

```bash
npm run typecheck    # TypeScript de la interfaz y del simulador histórico
npm test             # pruebas unitarias y de adaptadores (94 actualmente)
npm run build        # compilación Next.js y TypeScript del simulador
npm run test:visual  # compila, abre las rutas actuales y genera capturas locales
```

`test:visual` requiere Chromium, Chrome o Edge. Puedes indicar el ejecutable con `VISUAL_BROWSER_PATH`. Escribe las capturas en `screenshots/`, una carpeta ignorada por Git; también admite `VISUAL_SCREENSHOT_DIR` y, para comprobar un servidor ya iniciado, `VISUAL_BASE_URL`.

Las pruebas de integración (`npm run test:e2e`) y el piloto (`npm run test:e2e:pilot`) necesitan el backend real y PostgreSQL. No forman parte de `npm test`. Para regenerar los tipos de la API tras un cambio de contrato, coloca el backend como repositorio hermano y ejecuta `npm run openapi:generate`; [`src/contracts/api.ts`](src/contracts/api.ts) es generado y no debe editarse a mano.

**Nota sobre `npm start`:** ese comando inicia el simulador histórico desde `dist/src/server.js`, no la interfaz Next.js. Para servir una compilación de Next.js usa `npx next start -p 5173 -H 127.0.0.1` después de `npm run build`.

## Estructura

```text
app/                    Rutas y layouts de Next.js
src/views/              Pantallas de la interfaz
src/components/         Componentes compartidos
src/api.ts              Adaptación entre contratos, vistas y datos demo
src/contracts/          Tipos OpenAPI generados y cliente HTTP
src/mockData.ts         Datos para diseño y pruebas en modo demo
test/                   Pruebas unitarias, de transporte e integración
scripts/visual-check.mjs  Verificación visual actual
```

`src/domain/`, `src/simulation/`, `src/server.ts`, `db/`, `docker-compose.yml` y [`docs/run-demo.md`](docs/run-demo.md) pertenecen al simulador anterior. Siguen disponibles como referencia y para sus pruebas, pero no forman parte de la interfaz Next.js. Los informes y capturas de `.audit/` son evidencia histórica; pueden mostrar diseños de versiones anteriores.

Lee [AGENTS.md](AGENTS.md) antes de cambiar código y [docs/frontend-architecture.md](docs/frontend-architecture.md) para entender la separación entre contratos, adaptadores y vistas.
