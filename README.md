# OdontoFlow · AIRI v10

Interfaz de operación clínica en Next.js, React y TypeScript. Conserva el diseño v10: personajes, hilo compartido, propuestas con revisión humana y Rastro. Una propuesta preparada no equivale a una operación aplicada.

## Demo visual y verificación pública

Requiere Node.js 24 (`.nvmrc`). El lockfile fija las dependencias; no se necesita el backend privado para estos comandos:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

Abre [localhost:5173](http://127.0.0.1:5173). Por defecto se usan datos de demostración, identificados como simulación. `npm start` sirve la compilación. La CI ejecuta instalación, typecheck, tests y build sin credenciales ni servicios de negocio.

## Datos reales

El backend FastAPI/PostgreSQL es un repositorio privado separado; este repositorio no instala ni ejecuta ese servicio. El modo real requiere una instancia compatible con el contrato exportado en [`docs/api/openapi.yaml`](docs/api/openapi.yaml), credenciales de personal autorizadas y configuración del BFF según [DEVELOPMENT.md](DEVELOPMENT.md) y [`.env.example`](.env.example). `NEXT_PUBLIC_USE_MOCKS=false` selecciona datos reales. Las credenciales permanecen en el servidor Next; el navegador usa `/api/backend/*`.

Agenda, pacientes, caja, inventario, conversaciones y Bandeja consultan el backend. Los personajes describen actividad del hilo actual, no métricas globales del turno. Mi Turno conserva las tareas accesibles al principal autenticado; completar una tarea no firma una ficha ni cambia su estado clínico. La disponibilidad de WhatsApp depende del contrato y configuración del backend, no de la demo. La voz es opcional y no sustituye autenticación ni catálogo canónico.

Los flujos nuevos requieren `GET /conversations/{id}/context`, `POST /conversations/{id}/reply` y `POST /conversations/{id}/resume`; `GET /inventory/count-context` y `POST /inventory/counts`; `GET /tasks`, `GET /tasks/assignees?location_id=…`, `POST /tasks/{id}/ack`, `POST /tasks/{id}/complete` y `POST /tasks/delegations`. El backend necesita la migración aditiva `0033_v10_agentic` y los esquemas de este snapshot. La aprobación sigue las rutas existentes de Bandeja. Si el canal de personal devuelve `not_configured`, AIRI lo muestra como no configurado: no acredita envío ni entrega por WhatsApp.

## Contrato de API

[`src/contracts/api.ts`](src/contracts/api.ts) se genera; nunca se edita a mano. El snapshot YAML se copia del exportador OpenAPI del backend, sin inventar ni modificar esquemas. Los comandos públicos usan ese snapshot:

```bash
npm run openapi:generate
npm run openapi:check
```

Para integrar una nueva versión, exporta primero el YAML en el backend, copia ese archivo a `docs/api/openapi.yaml` y regenera con el mismo origen:

```bash
OPENAPI_SPEC=../backend-integ-airi/docs/api/openapi.yaml npm run openapi:generate
OPENAPI_SPEC=../backend-integ-airi/docs/api/openapi.yaml npm test
```

`OPENAPI_SPEC` también funciona con `openapi:check`. Los fixtures AG-UI incluidos se validan con sus esquemas y hashes exportados; `AIRI_CONTRACT_DIR` permite además compararlos byte a byte con `contracts/airi-v10` de un backend local. Una ruta nueva necesita cliente tipado, adaptación real/demo y permiso explícito en el BFF. La integración y las pruebas de navegador con backend/PostgreSQL son una verificación aparte; `npm test` no envía WhatsApp ni requiere backend.

Lee [AGENTS.md](AGENTS.md) y [arquitectura frontend](docs/frontend-architecture.md) antes de contribuir. `src/domain`, `src/simulation` y `src/server.ts` son el simulador histórico, no la autoridad de negocio de AIRI.
