# Journeys de navegador I0

Ejecutar contra un stack **local, aislado, en development y sin mocks**. Cada ensayo
consume datos del seed: usar un RUN_ID y una base nuevos; no reutilizar una demo
ya aprobada. No ejecutar `pilot-e2e.sh`. No llama a un LLM ni a proveedores externos.

## Preparación y ejecución

Requisitos: Node según `package.json`, PostgreSQL, Python 3.10+, Chromium y las
bibliotecas Python (no se añaden dependencias npm):

```bash
npm ci
python3 -m venv .run/venv
. .run/venv/bin/activate
pip install playwright httpx sqlalchemy 'psycopg[binary]'
python3 -m playwright install chromium
```

Si está disponible en backend `dev`, levantar `scripts/demo_up.sh --mode A` y usar
el RUN_ID que genera. Consultar su `docs/run-demo.md` para arranque y parada.
El runner no arranca ni detiene servicios y lee exclusivamente `<run-dir>/env`.

```bash
npm run e2e:journeys -- --base http://127.0.0.1:3110 \
  --api http://127.0.0.1:8110 --run-dir /ruta/.run/RUN_ID --replay
```

`--journeys J1,J2,...` selecciona journeys. J3 incluye J1 automáticamente porque
utiliza su propuesta pendiente de Inventario; J5 puede usar la derivación pendiente
de UP1 o crear una mediante la herramienta canónica del agente sandbox.
No se aceptan RUN_ID con `journeys.json` existente: conservar el fallo y preparar otro.

El archivo `env` debe tener permisos 0600, líneas `CLAVE=valor` (JSON crudo o
valores entre comillas), y contener:

- `APP_ENV=development`, `DATABASE_URL` de la base nueva (SQLAlchemy + psycopg).
- `BFF_ACCESS_CODE` usado por el selector del frontend.
- `SANDBOX_DISPATCHER_TOKEN` y `SALES_AGENT_V0_CREDENTIAL` del seed de esa base.

No imprimir ni versionar este archivo. El runner guarda capturas/texto en `shots/`,
resultados, IDs, propuestas, claves de intención, snapshots y conteos SQL en
`journeys.json`; agrega `journeys` al `manifest.json` existente conservando sus claves.
Devuelve exit 1 ante cualquier fallo. La tabla marca FAIL también los journeys que
no llegaron a ejecutarse. La evidencia debe permanecer fuera de git; por ejemplo,
añadir `.run/` al exclude local del worktree.

## Alternativa manual si UP1 aún no está en dev

`dev_up.sh` sirve de referencia para la secuencia DB → migraciones → seed → API.
Ese script carga `.env.local` del backend: **no ejecutarlo contra una base compartida**.
En un checkout de demo propio, configurar allí una DB nueva y ejecutar
`API_PORT=8110 scripts/dev_up.sh`. Si no se puede modificar ese checkout, ejecutar
sus mismos pasos con variables de entorno privadas, sin tocar archivos del backend:

1. Crear dos bases nuevas (ERP y memoria del agente), con nombres exclusivos del
   RUN_ID; abortar si ya existen. Configurar `DATABASE_URL` y
   `SALES_AGENT_DATABASE_URL` apuntando a ellas, `APP_ENV=development`,
   `ERP_ANONYMOUS_COMPAT=false`, `REQUIRE_HTTPS=false`, `API_HOST=127.0.0.1`,
   `API_PORT=8110`, `SALES_AGENT_BASE_URL=http://127.0.0.1:8110` y
   `SANDBOX_BASE_URL=http://127.0.0.1:8110` en el env privado.
2. Desde backend, con esas variables en el proceso, ejecutar
   `.venv/bin/python -m alembic upgrade head` y
   `.venv/bin/python scripts/seed_demo.py --issue-staff-credential --env-file /ruta/.run/RUN_ID/credentials`.
   El seed usa hoy en Lima como ancla. Integrar las líneas del archivo de credenciales
   en `env` sin mostrarlas y eliminar el archivo intermedio.
3. Añadir al mismo env `BACKEND_URL=http://127.0.0.1:8110`,
   `NEXT_PUBLIC_USE_MOCKS=false`, `BACKEND_DEMO_HUMANS` del seed y generar
   `BFF_SESSION_SECRET` y `BFF_ACCESS_CODE` aleatorios; aplicar chmod 600.
4. Inyectar el env en cada proceso, arrancar API desde backend con
   `.venv/bin/python -m app.run`. Desde frontend, ejecutar
   `NEXT_PUBLIC_USE_MOCKS=false npm run build` y luego
   `node node_modules/next/dist/bin/next start -p 3110 -H 127.0.0.1`.

Para inyectar el archivo sin imprimir secretos ni interpretar JSON como shell,
este wrapper sirve para cualquiera de los comandos anteriores (ejecutar desde FE,
ajustar el `cwd` al backend cuando corresponda):

```python
import os, subprocess, sys
from pathlib import Path
sys.path.insert(0, 'e2e')
from journeys import envfile
private = envfile(Path('/ruta/.run/RUN_ID/env'))
subprocess.run(['npm', 'run', 'build'], env={**os.environ, **private}, check=True)
```

No iniciar un dispatcher automático paralelo: el runner reclama solo sandbox y
verifica el receptor `/internal/sandbox/receive` y el resultado `delivered`.
Detener únicamente los procesos creados por el ensayo al terminar.

## Qué demuestra

| Journey | Evidencia (tres capturas enlazadas) |
| --- | --- |
| J1 | Lucía → Carlos → Lucía, `/me` humano; Inventario 403; tarjeta sin Aprobar para Lucía, POST de aprobación 403 conservando sesión; logout 401 y selector. Espera 2 s por cambio/logout y cuenta respuestas tardías. |
| J2 | Ejecutar Cobranza → propuesta → aprobación humana → outbound/mensaje delivered con recibo sandbox único; chat muestra el recordatorio. |
| J3 | Propuesta de traspaso → Carlos aprueba → dos movimientos, origen antes − cantidad y destino antes + cantidad, sin balances hardcodeados. |
| J4 | Cita de Fiorella del seed I0 cancelada desde Agenda a menos de 48 h → Backfill → aprobación → ofertas entregadas. El ID y horario se descubren en SQL. |
| J5 | Actividad correlaciona creación por agente y aprobación humana; chat y cola de derivaciones → Tomar → asignación persistida al humano. Fixture adicional rotulada `[DEMO E2E1]` cuando hace falta. |

`--replay` repite cada aprobación y claim con el humano, cuerpo y UUIDv4 capturados
en el clic: exige 200, `Idempotent-Replay: true` y resultado idéntico; con UUID nuevo
exige 409. Compara filas completas en una transacción de lectura consistente antes
y después (propuestas, outbounds, mensajes, movimientos, recibos, derivaciones,
conversaciones y citas). No suavizar una discrepancia del backend a PASS.

## Límites

No demuestra WhatsApp, aceptación del paciente, silla reservada ni cobro de un pago:
Cobranza envía un recordatorio y Backfill entrega una oferta. No certifica todas las
combinaciones de roles/tenants ni fuerza artificialmente una respuesta de red tardía.
Los snapshots solo leen SQL; las mutaciones pasan por UI/BFF o herramientas sandbox.
La suite se detiene ante el primer fallo y conserva la evidencia disponible.

## Verificaciones complementarias

```bash
npm run typecheck
npm test
NEXT_PUBLIC_USE_MOCKS=false npm run build
# Inyectar BFF_ACCESS_CODE del env privado; Carlos tiene acceso a todas las rutas.
VISUAL_BASE_URL=http://127.0.0.1:3110 npm run test:visual -- --real
```

Si Node no encuentra su Chromium, configurar `VISUAL_BROWSER_PATH` con el ejecutable
instalado. `--real` construye/arranca con mocks desactivados y autentica al humano
(`VISUAL_PERSONA`, Carlos Vega por defecto). Sin `--real` mantiene el modo de diseño.

Estado observado en backend `5129feba7a67ede5ce3bf92515318d401f6ebd16`:
las tres aprobaciones cumplen el replay, pero repetir el claim con una clave nueva
y el mismo humano devuelve 200 y crea otro `command_receipts` (9 → 10 en el ensayo).
La suite devuelve FAIL; requiere resolver ese comportamiento en backend antes de
certificar los dos ensayos con exit 0. Se mantiene la exigencia de 409 del brief.
