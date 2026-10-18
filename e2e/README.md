# Journeys de navegador I0 y E1

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
npm run e2e:journeys -- --base http://127.0.0.1:3120 \
  --api http://127.0.0.1:8120 --run-dir /ruta/.run/RUN_ID --replay
```

Los argumentos `--base` y `--api` prevalecen sobre `E2E_BASE_URL` y `E2E_API_URL`.
Sin esas URL, se usan `FRONTEND_PORT` (3120) y `API_PORT` (8120):

```bash
export API_PORT=8120 FRONTEND_PORT=3120
export RUN_ID="$(date -u +%Y%m%d_%H%M%S)_a"
export DB_NAME="odontoflow_e2e1_${RUN_ID}"
npm run e2e:journeys -- --run-dir "/ruta/.run/$RUN_ID" --replay
```

`DB_NAME` selecciona la base al preparar el stack; el runner lee exclusivamente
`DATABASE_URL` del env privado. Crear otra DB/RUN_ID para el segundo ensayo y
reiniciar ambos servicios con su env; no basta cambiar el env del runner.

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
`API_PORT=8120 scripts/dev_up.sh`. Si no se puede modificar ese checkout, ejecutar
sus mismos pasos con variables de entorno privadas, sin tocar archivos del backend:

1. Crear dos bases nuevas (ERP y memoria del agente), con nombres exclusivos del
   RUN_ID (`DB_NAME=odontoflow_e2e1_${RUN_ID}` y `${DB_NAME}_agent`); abortar si
   ya existen o si el nombre excede 63 caracteres. Configurar `DATABASE_URL` y
   `SALES_AGENT_DATABASE_URL` apuntando a ellas, `APP_ENV=development`,
   `ERP_ANONYMOUS_COMPAT=false`, `REQUIRE_HTTPS=false`, `API_HOST=127.0.0.1`,
   `API_PORT=${API_PORT:-8120}`, `FRONTEND_PORT=${FRONTEND_PORT:-3120}`,
   `SALES_AGENT_BASE_URL=http://127.0.0.1:${API_PORT}` y
   `SANDBOX_BASE_URL=http://127.0.0.1:${API_PORT}` en el env privado (guardar los
   valores expandidos, el lector no expande variables shell).
2. Desde backend, con esas variables en el proceso, ejecutar
   `.venv/bin/python -m alembic upgrade head` y
   `.venv/bin/python scripts/seed_demo.py --issue-staff-credential --env-file /ruta/.run/RUN_ID/credentials`.
   El seed usa hoy en Lima como ancla. Integrar las líneas del archivo de credenciales
   en `env` sin mostrarlas y eliminar el archivo intermedio.
3. Añadir al mismo env `BACKEND_URL=http://127.0.0.1:${API_PORT}` (expandido),
   `NEXT_PUBLIC_USE_MOCKS=false`, `BACKEND_DEMO_HUMANS` del seed y generar
   `BFF_SESSION_SECRET` y `BFF_ACCESS_CODE` aleatorios; aplicar chmod 600.
4. Inyectar el env en cada proceso, arrancar API desde backend con
   `.venv/bin/python -m app.run`. Desde frontend, ejecutar
   `NEXT_PUBLIC_USE_MOCKS=false npm run build` y luego
   `node node_modules/next/dist/bin/next start -p "$FRONTEND_PORT" -H 127.0.0.1`.

Para concretar el paso 1 con variables de entorno, exportar `BACKEND_DIR` (checkout
backend en dev), `RUN_DIR` (ruta nueva), `RUN_ID`, `DB_NAME`, `API_PORT` y
`FRONTEND_PORT`. Ejecutar desde FE con el Python del venv; el bloque crea las dos
bases y el env inicial, sin imprimir DSN ni modificar el backend:

```python
import os, secrets, sys
from pathlib import Path
import psycopg
from psycopg import sql
from sqlalchemy.engine import make_url
sys.path.insert(0, 'e2e')
from journeys import envfile
root = Path(os.environ['RUN_DIR'])
root.mkdir(parents=True, exist_ok=False)
name = os.environ.get('DB_NAME', 'odontoflow_e2e1_' + os.environ['RUN_ID'])
assert name.startswith('odontoflow_e2e1_') and len(name + '_agent') <= 63
admin = make_url(envfile(Path(os.environ['BACKEND_DIR']) / '.env.local')['DATABASE_URL'])
assert admin.host in ('localhost', '127.0.0.1', '::1')
with psycopg.connect(host=admin.host, port=admin.port, user=admin.username,
                     password=admin.password, dbname='postgres', autocommit=True) as db:
    for database in (name, name + '_agent'):
        assert not db.execute('SELECT 1 FROM pg_database WHERE datname=%s', (database,)).fetchone()
        db.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(database)))
api_port = os.environ.get('API_PORT', '8120')
url = 'http://127.0.0.1:' + api_port
private = {
    'DATABASE_URL': admin.set(database=name).render_as_string(hide_password=False),
    'SALES_AGENT_DATABASE_URL': admin.set(database=name + '_agent').render_as_string(hide_password=False),
    'DB_NAME': name, 'APP_ENV': 'development', 'ERP_ANONYMOUS_COMPAT': 'false',
    'REQUIRE_HTTPS': 'false', 'API_HOST': '127.0.0.1', 'API_PORT': api_port,
    'FRONTEND_PORT': os.environ.get('FRONTEND_PORT', '3120'),
    'BACKEND_URL': url, 'SALES_AGENT_BASE_URL': url, 'SANDBOX_BASE_URL': url,
    'NEXT_PUBLIC_USE_MOCKS': 'false', 'BFF_SESSION_SECRET': secrets.token_urlsafe(48),
    'BFF_ACCESS_CODE': secrets.token_urlsafe(18),
}
with (root / 'env').open('x', opener=lambda path, flags: os.open(path, flags, 0o600)) as file:
    file.write(''.join(f'{key}={value}\n' for key, value in private.items()))
```

Continuar con migración/seed del paso 2; incorporar las credenciales generadas al
env privado con `envfile`, sin sobrescribir las URL, puertos ni secretos iniciales.

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
| J1 | Lucía → Carlos → Lucía, `/me` humano; Inventario 403; tarjeta sin Aprobar para Lucía, POST de aprobación 403 conservando sesión; logout 401 y selector. Observa desde antes de invalidar sesión hasta 2 s después; atribuye solicitudes por generación de sesión y cuenta respuestas tardías, incluso entre logins del mismo nombre. |
| J2 | Ejecutar Cobranza → propuesta → aprobación humana → outbound/mensaje delivered con recibo sandbox único; chat muestra el recordatorio. |
| J3 | Propuesta de traspaso → Carlos aprueba → dos movimientos, origen antes − cantidad y destino antes + cantidad, sin balances hardcodeados. |
| J4 | Cita de Fiorella del seed I0 cancelada desde Agenda a menos de 48 h → Backfill → aprobación → ofertas entregadas. El ID y horario se descubren en SQL. |
| J5 | Actividad correlaciona creación por agente y aprobación humana; chat y cola de derivaciones → Tomar → asignación persistida al humano. Fixture adicional rotulada `[DEMO E2E1]` cuando hace falta. |
| cobro-verificado | E1: Caja de M1 → Conciliación → Preparar revisión → Bandeja enfocada → aprobar → recargar Dirección y Rastro; concurrencia, replay, referencia ausente, versión vencida, anulación y permisos/sede/organización. Se selecciona por separado. |

`--replay` repite cada aprobación y claim con el humano, cuerpo y UUIDv4 capturados
en el clic: exige 200, `Idempotent-Replay: true` y resultado idéntico; con UUID nuevo
exige 409. Compara filas completas en una transacción de lectura consistente antes
y después (propuestas, outbounds, mensajes, movimientos, recibos, derivaciones,
conversaciones y citas). No suavizar una discrepancia del backend a PASS.

## Límites

J1–J6 no demuestran WhatsApp, aceptación del paciente, silla reservada ni cobro de un pago:
Cobranza envía un recordatorio y Backfill entrega una oferta. E1 verifica un pago
digital ya registrado; no registra un pago nuevo. No certifica todas las
combinaciones de roles/tenants ni fuerza artificialmente una respuesta de red tardía.
Los snapshots solo leen SQL; las mutaciones pasan por UI/BFF o herramientas sandbox.
E1 añade sondas HTTP de identidades desde Python y una fixture IAM local mediante
el servicio público `set_membership_active`; las credenciales nunca pasan al navegador.
La suite se detiene ante el primer fallo y conserva la evidencia disponible.

## E1 · Ejecución de cobro verificado

La escritura de FE3 corresponde a O2. La corrida real corresponde a O3, tras
integrar BE1a, BE1b, BE2, M1 y FE2. Un dry run no acredita los casos reales ni
cierra E1. No usar el dispatcher ni ejecutar J1–J6 en la misma corrida.

En este worktree, usar exclusivamente PostgreSQL `127.0.0.1:5434`, usuario y
contraseña `odontoflow`, base nueva `odontoflow_test_fe_e1_fe3`. Crearla antes de
migrar; abortar si existe. El dueño del ensayo la elimina al terminar, después de
archivar la evidencia. No arrancar/detener contenedores ni usar una base compartida.
El runner no crea bases, migra, siembra ni arranca servicios.

1. Preparar el stack aislado y el env privado como arriba, con
   `DATABASE_URL=postgresql+psycopg://odontoflow:odontoflow@127.0.0.1:5434/odontoflow_test_fe_e1_fe3`,
   `NEXT_PUBLIC_USE_MOCKS=false` también al construir el frontend, y puertos 3120/8120.
2. Ejecutar el seed de M1 con un `--run-id` nuevo y conservar **su JSON de salida**
   como `<run-dir>/e1-seed.json`; `--emit-csv` escribe la plantilla de medición.
   El seed usa el día Lima, se niega a empezar en los últimos 30 minutos del día y
   repetir un run-id no restablece pagos. Ejemplo con rutas absolutas (inyectar el
   env del ensayo en el proceso, sin cargar otro `.env.local`):

   ```bash
   /ruta/absoluta/backend/.venv/bin/python /ruta/absoluta/backend/scripts/seed_e1_cobro.py \
     --org 1 --run-id ensayo-01 --emit-csv /ruta/absoluta/ensayo-01/medicion.csv \
     > /ruta/absoluta/ensayo-01/e1-seed.json
   ```

3. Configurar en el BFF las dos personas humanas que imprime M1:
   `E1 sintético ensayo-01 · caja` y `E1 sintético ensayo-01 · recepcion`, con
   credenciales emitidas para esos IDs. No ampliar sus grants: Caja tiene sus
   cuatro permisos solo en Lince; Recepción carece de `payments.manage`.
4. Para probar otra organización, provisionar **otra organización sintética en
   la misma base aislada**, ejecutar el mismo seed con su `--org` y otro run-id,
   guardar `e1-other-seed.json` y emitir una credencial humana con permisos de
   pagos/propuestas solo en esa organización. No inventar IDs inexistentes: el
   runner debe demostrar el rechazo sobre recursos que sí existen.
5. Añadir al env 0600 `E1_OTHER_HUMAN_CREDENTIAL`, `SALES_AGENT_V0_CREDENTIAL`
   (principal agente real), `E1_BACKEND_DIR=/ruta/absoluta/backend` y, si su venv
   no está allí, `E1_BACKEND_PYTHON=/ruta/absoluta/al/python`. Mantener una persona
   de control del seed base con acceso a Miraflores: `Carlos Vega` por defecto,
   configurable con `E1_CONTROL_PERSONA`. Se usa solo para preparar la fixture de
   otra sede; el recorrido principal y las decisiones usan Caja de M1.

El caso 8 desactiva la membresía de Caja **después** de preparar una propuesta,
exige 403 al aprobar y restaura la membresía en `finally`. Usa el servicio público
IAM en un subproceso con el mismo env y base; no escribe SQL directamente. Si se
mata el proceso a la fuerza, comprobar/restaurar esa membresía antes de continuar.

Desde cualquier directorio, ejecutar:

```bash
npm --prefix /ruta/absoluta/frontend run e2e:journeys -- \
  --base http://127.0.0.1:3120 --api http://127.0.0.1:8120 \
  --run-dir /ruta/absoluta/ensayo-01 --journeys cobro-verificado --replay
```

Los JSON se pueden ubicar con `--seed-summary /ruta/absoluta/e1-seed.json` y
`--other-seed-summary /ruta/absoluta/e1-other-seed.json`. El journey solo consume
`lotes.pruebas`; comprueba que `medicion` permanezca intacto. Los números del JSON
M1 seleccionan los pagos: no se escoge el primer pendiente global de la UI.

| Caso | Aserción y evidencia |
| --- | --- |
| 1–3 | Doble clic en Preparar revisión, URL enfocada en `agent_proposal:ID`, tarjeta con alcance/efecto, recarga, doble clic en Aprobar y estado SQL `verified`; Dirección Lince, mismo día Lima, pendiente −X, verificado +X, total igual; `/activity` y DOM de Rastro con AIRI, Caja y hora. |
| 4–5 | Dos preparaciones concurrentes con claves distintas → una propuesta abierta en SQL; cada clave repite su cuerpo original incluido `created`. Reintento de la aprobación capturada tras ejecutar/recargar → mismo cuerpo, `Idempotent-Replay: true`, un solo `payment.verified` en `audit_events`. |
| 6 | Tarjeta sin referencia de M1: preparar y verificar manual devuelven 422 `INVALID_INPUT / missing_reference`; pago y eventos intactos. |
| 7 | Tarjeta abierta, verificar manualmente o anular y luego aprobar → `PROPOSAL_SUPERSEDED` o estado `failed`, sin otro efecto. Carrera anular/aprobar: registra ganador; si ganó anular no hay `payment.verified`, si ganó aprobar hay uno anterior a la anulación. Verificar un anulado devuelve 422 `reversed`. |
| 8 | Recepción y agente reciben 403 al verificar/aprobar/reintentar; agente también al preparar. Revocación de la membresía entre preparar y aprobar → 403 y pago intacto. |
| 9 | Otra sede y otra organización: leer cargo/pagos/propuesta, preparar, verificar, aprobar y reintentar → 403/404, sin filtración en la lista de pagos ni cambios financieros. |

`--replay` vuelve a intentar las intenciones capturadas en los clics con las claves
UUIDv4 originales y compara snapshots SQL completos. Una clave nueva para aprobar
una propuesta ejecutada exige 409; para preparar un pago ya verificado exige 422
`already_verified`. Ningún rechazo se convierte en PASS por tolerancia al backend.
La carrera registra qué operación ganó; un solo ensayo no certifica todos los
órdenes posibles del planificador de PostgreSQL.

Para validar selección y forma del JSON sin servicios ni mutaciones:

```bash
python3 /ruta/absoluta/frontend/e2e/journeys.py \
  --run-dir /ruta/absoluta/ensayo-01 --journeys cobro-verificado --dry-run
```

La salida rotula `DRY_RUN`, casos 1–9 `NOT_RUN` y caso 10 `PENDIENTE`.

## E1 · Medición 10 manual + 10 AIRI

La comparación usa exclusivamente las 20 filas `medicion` del CSV de M1, con el
mismo `run_id`, operador, sede Lince y día Lima. Reservar `pruebas` para H1/FE3.
Antes de medir comprobar los 20 pagos pendientes; medir los 10 manuales tras
M1 + BE1b y los 10 AIRI después de H1. Alternar pares cuando ambas rutas estén
disponibles. Conservar el JSON y CSV originales, sin reemplazar tiempos por los
del robot ni completar huecos con estimaciones.

Cronómetro: empezar cuando el pago aparece en Caja → Conciliación; detener al ver
`verified` persistido después de recargar. Contar todas las acciones del recorrido,
incluida la recarga. Registrar `segundos`, `acciones` y `total_antes/total_despues`
en soles; ambas cifras de Dirección deben conservar sede/día y ser iguales.
M1 aporta los IDs, lotes y rutas; no renombrar sus columnas. `--operator` declara
quién hizo ambas rutas: el CSV de M1 no contiene esa identidad y el runner no
puede comprobarla por sí solo.

Después de registrar las 20 observaciones, evaluar sin iniciar navegador:

```bash
npm --prefix /ruta/absoluta/frontend run e2e:journeys -- \
  --run-dir /ruta/absoluta/ensayo-01 \
  --measure-csv /ruta/absoluta/ensayo-01/medicion.csv --operator 'Nombre del operador'
```

Guarda `e1-medicion.json` sin sobrescribir evidencia previa; permite usar el
run-dir que ya tiene `journeys.json`. Lee SQL sin mutarlo y exige 20 IDs únicos
exactos, 10 por ruta, medidas completas/finitas, acciones enteras, pagos equivalentes
por importe/método/receptor, misma sede/día y todos verificados sin anulación.
Publica medianas de segundos y acciones, suma de acciones por ruta, reducción
`1 − mediana_AIRI / mediana_manual`, hashes del CSV/seed y conteos SQL de eventos.

**Cumple** solo con reducción ≥20 %, mediana y suma de acciones AIRI no superiores,
total recibido igual antes/después y exactamente un `payment.verified` por pago.
Si falla una meta escribe `estado_e1=PENDIENTE`, `cumple=false` y sale 1. Un CSV
incompleto, otra corrida, pruebas mezcladas o una fixture inválida también salen 1;
no producen una certificación. Sin CSV real o sin corrida O3, el cierre de E1
permanece pendiente aunque el dry run y los tests unitarios pasen.

## Verificaciones complementarias

```bash
npm run typecheck
npm test
NEXT_PUBLIC_USE_MOCKS=false npm run build
# Inyectar BFF_ACCESS_CODE del env privado; Carlos tiene acceso a todas las rutas.
VISUAL_BASE_URL=http://127.0.0.1:3120 npm run test:visual -- --real
```

Si Node no encuentra su Chromium, configurar `VISUAL_BROWSER_PATH` con el ejecutable
instalado. `--real` construye/arranca con mocks desactivados y autentica al humano
(`VISUAL_PERSONA`, Carlos Vega por defecto). Sin `--real` mantiene el modo de diseño.

Estado observado en backend `5129feba7a67ede5ce3bf92515318d401f6ebd16`:
las tres aprobaciones cumplen el replay, pero repetir el claim con una clave nueva
y el mismo humano devuelve 200 y crea otro `command_receipts` (9 → 10 en el ensayo).
La suite devuelve FAIL; requiere resolver ese comportamiento en backend antes de
certificar los dos ensayos con exit 0. Se mantiene la exigencia de 409 del brief.
