# P0 — Baseline frontend, 2026-10-04

Resultado: **baseline local ejecutado y documentado**. Typecheck y tests pasaron. El build inicial falló en sandbox; el mismo comando, reintentado mediante escalación normal autorizada, pasó. El fallo inicial permanece como evidencia. No se implementó FE0 ni se certificaron Q1–Q9/demo completo.

Responsable: frontend Sol6.1 xhigh, panel existente `wX:pA`; coordinador `wX:p2`. CWD efectivo de las herramientas: `/home/miguel/projects/portfolio/AI-EdgeRunners/odontoflow/.worktrees/frontend-erp`, rama `erp/frontend`. Herdr identificó el panel correcto; su metadata de terminal todavía mostraba el checkout planning, por lo que se verificó el CWD real de ejecución explícitamente. No se creó ningún panel/agente ni se usó Orca.

## Fuentes y alcance

Se leyeron `AGENTS.md` frontend y, de sólo lectura, `../../odontoflow-planning/AGENTS.md`, `../../odontoflow-planning/orchestration/current-activity.yaml`, `../../odontoflow-planning/orchestration/project.yaml`, `../../odontoflow-planning/CONTEXT.md`, las secciones P0/FE0 del plan y el addendum final Q0. La instrucción actual acota P0 frontend a este baseline: no runner browser, cambios funcionales, tests nuevos ni reparaciones.

Binding Q0 consumido, sin revisión nueva:

- `../../odontoflow-planning/docs/handoffs/plans/2026-10-04-erp-demo-implementation.md`: SHA256 `016ec7699eb2a7874d718787805eaf214e1461575a05d795e8f8eef4f75a4459`.
- `../../odontoflow-planning/docs/handoffs/plans/2026-10-04-erp-demo-spec.md`: SHA256 `129fa54521e9a583e80359df4d0e8f0ae0dc4822f402c3219f61cf08b4b75528`.
- Gate heredado: `../../odontoflow-planning/.audit/erp-demo-2026-10-04/opus-spec-review.md`, addendum final PASS de SPEC+plan. Hashes coinciden con su binding; no equivalen a PASS de producto.

## Git y preservación

Antes y después de los comandos:

- HEAD: `842b8318ab7f810ad8b2397dc7fa72484a4f4f73`.
- `main` y `origin/main` locales: `e508b85e61131aa95ed14d783f1e569574b96979`; no fetch.
- Los cinco commits, en orden: `01c7d48` → `1eb0141` → `5611aae` → `3e80b7d` → `842b831`.
- Diff tracked y staged: **0 bytes**. Historia y diff `origin/main...HEAD` idénticos antes/después.
- Los **118 archivos untracked** heredados bajo `.agents/`, `.claude/` y `.codex/` conservaron paths, tamaños y SHA256. No se añadieron paths untracked fuera de `.audit/erp-demo-2026-10-04/p0/`.
- Nuevas evidencias sólo bajo este directorio audit; outputs habituales de compilación locales permitidos. No commits, staging, reset, stash, clean, cambios de dependencias, configuración, producto, tests ni secretos.

Evidencia: [preservation.json](preservation.json), [snapshot-before.json](snapshot-before.json), [snapshot-after.json](snapshot-after.json); `git-head-{before,after}.log`, `git-status-{before,after}.log`, `git-status-porcelain-{before,after}.log`, `git-diff-{before,after}.log`, `git-diff-staged-{before,after}.log`, `git-inherited-commits-{before,after}.log`, `git-inherited-diff-{before,after}.log`, `git-inherited-stat-{before,after}.log`, `tools-manifest-{before,after}.json`. Los `.log` se conservan aunque Git los ignore.

## Exclusiones comprobadas antes de ejecutar

`npm test` ejecuta `vitest run` con `vitest.config.ts`, sin setup E2E. Su `test.exclude` actual contiene `node_modules/**`, `dist/**` y **cuatro** suites de integración:

1. `test/agenda-integration.test.ts`
2. `test/patients-integration.test.ts`
3. `test/pilot-e2e.test.ts`
4. `test/service-to-cash-integration.test.ts`

`vitest.e2e.config.ts` incluye esas mismas cuatro y `test/setup-e2e-auth.ts`; no se ejecutó. `tsconfig.backend.json` también excluye las cuatro de su compilación. AGENTS.md enumera sólo tres: discrepancia documental registrada, sin cambios. Compilar un archivo de integración incluido por `tsconfig.json` no ejecuta sus tests.

Lectura puntual confirmó transporte axios/fetch mocked y simulación in-memory. `test/end-to-end-followup.test.ts`, incluido en la suite unitaria, usa `InMemorySimulationRepository`; no es un ensayo contra backend/DB. No se ejecutaron `scripts/pilot-e2e.sh`, migraciones, reset, consultas DB, suites de integración ni browser E2E. Lease DB/E2E exclusivo del backend `wX:p9` respetado. Configuración fuente conservada en [test-scope.log](test-scope.log).

## Resultados frescos, ejecución serial

Runtime: Node `v24.12.0`, npm `11.6.2`, Next.js `16.3.4`, TypeScript `5.9.3`, Vitest `3.2.7`. No se instalaron ni actualizaron paquetes.

| Ejecución | Exit | Resultado actual | Duración | Log completo / exit / metadata |
|---|---:|---|---:|---|
| `npm run typecheck` | 0 | Ambos tsconfigs, sin diagnósticos | 15.489 s | [typecheck.log](typecheck.log), [typecheck.exit](typecheck.exit), [typecheck.json](typecheck.json) |
| `npm test` | 0 | **352 tests pasados, 28 archivos pasados**, sin fallos | 29.386 s | [test.log](test.log), [test.exit](test.exit), [test.json](test.json) |
| `npm run build`, sandbox | 1 | Next aborta al parsear `tsc --showConfig`; no llega al `tsc` backend posterior | 3.594 s | [build.log](build.log), [build.exit](build.exit), [build.json](build.json) |
| Mismo `npm run build`, escalación autorizada | 0 | Build Next completo y `tsc -p tsconfig.backend.json`; 15 páginas generadas | 58.324 s | [build-escalated.log](build-escalated.log), [build-escalated.exit](build-escalated.exit), [build-escalated.json](build-escalated.json) |

Cada ejecución terminó antes de iniciar la siguiente. Sólo para `npm test` se fijaron `VITEST_MAX_THREADS=1`, `VITEST_MIN_THREADS=1`, `VITEST_MAX_FORKS=1`, `VITEST_MIN_FORKS=1`: un worker, sin cambiar suite/config. El build mantuvo sus opciones originales y usó los nueve workers que registra Next. RSS máximo de descendiente registrado por comando: 417392 / 189700 / 129472 / 661816 KiB respectivamente; no es una medición de RAM total agregada.

El warning del test de secret corto en `bff-session` corresponde al escenario probado y no produjo fallo. El build sólo registró el nombre `.env.local`; no se leyó su contenido ni se imprimieron valores de secretos.

## Diagnóstico acotado del build inicial

Mensaje conservado: `Could not parse output from TypeScript's --showConfig.`

La documentación local `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/useTypeScriptCli.md` y Context7 (`/vercel/next.js`) confirman el uso por defecto del CLI TypeScript local. La implementación instalada `node_modules/next/dist/lib/typescript/runTypeScriptCli.js:221` captura la consulta y parsea `result.stdout` como JSON; el error aparece en ese parseo. Se consultaron también las fuentes primarias [runTypeScriptCli.ts](https://github.com/vercel/next.js/blob/canary/packages/next/src/lib/typescript/runTypeScriptCli.ts) y [load-jsconfig.ts](https://github.com/vercel/next.js/blob/canary/packages/next/src/build/load-jsconfig.ts). La versión instalada fue la autoridad para reproducir el caso.

Observaciones, sin reparar nada:

- El helper real de Next devuelve exit 0, stdout/stderr **0 bytes**: [showconfig.json](showconfig.json), [showconfig.stdout.log](showconfig.stdout.log), [showconfig.stderr.log](showconfig.stderr.log).
- La misma consulta de `tsc`, ejecutada directamente desde Python, devuelve exit 0 y **5606 bytes de JSON válido**: [showconfig-direct.json](showconfig-direct.json), [showconfig-direct.stdout.log](showconfig-direct.stdout.log). Se confirmó usando también el mismo binario Node absoluto: [showconfig-absolute.json](showconfig-absolute.json).
- La captura mediante subprocess Node nativo y cross-spawn, con/sin detached, reproduce stdout vacío: [process-capture.json](process-capture.json). No depende sólo del helper Next ni de detached.
- El comando original completo pasa fuera del sandbox, sin overrides de entorno, flags de bypass ni modificaciones de archivos fuente.

Conclusión limitada: el fallo depende del contexto de proceso/entorno de esta ejecución; la diferencia de captura está reproducida y el reintento normal escalado pasa. No se identificó la causa subyacente del sandbox/captura ni se atribuyó un defecto funcional a producto. No se cambió `experimental.useTypeScriptCli`, `ignoreBuildErrors`, tsconfig, dependencias ni límites de seguridad.

## Pendientes FE0 del plan existente, sin ejecutar

No son hallazgos nuevos ni autorización para implementarlos en este TASK. Fuente: FE0/Q2 del plan con el binding de arriba.

| Pendiente ya definido | Paths de ownership del plan |
|---|---|
| Pestaña “Aprobadas/en proceso”, estado approved separado de ejecución | `src/views/ApprovalsPage.tsx`, `src/approvals.ts`, `test/approvals-adapter.test.ts` |
| Errores de propuestas de cita en español y recarga apropiada; conservar códigos genéricos | `src/approvals.ts`, `src/api.ts`, `src/views/ApprovalsPage.tsx`, `test/approvals-adapter.test.ts` |
| 401 invalida sesión/persona/código centralmente; 403 no caduca; no replay automático de mutación dudosa | `src/contracts/client.ts`, `src/session.ts`, `src/components/PersonaContext.tsx`, `src/components/AppShell.tsx`, `src/bff/proxy.ts`, `test/bff-session.test.ts`, `test/bff-guard.test.ts`, nuevo `test/session-expiry.test.ts` |
| Chat reciente/anteriores sin duplicación ni salto de scroll; **espera BE0b/OpenAPI estable** | `src/views/ChatPage.tsx`, `src/chat.ts`, `src/api.ts`, `src/types.ts`, `src/contracts/client.ts`, `test/chat-adapter.test.ts`; `src/contracts/api.ts` únicamente por generador |
| Descartar respuestas tardías de Agenda y paginación Chat/persona; respetar guardas iniciales existentes | `src/views/AgendaPage.tsx`, `src/views/ChatPage.tsx`, `src/components/PersonaContext.tsx`, `test/agenda-adapter.test.ts`, `test/chat-adapter.test.ts`, nuevo `test/demo-view-races.test.ts` |
| “Crear cita” desde Chat con IDs reales patient/lead y modal real; “Hoy” y selector día/semana | `src/views/ChatPage.tsx`, `src/views/AgendaPage.tsx`, `src/chat.ts`, `src/api.ts`, `src/types.ts`, `test/agenda-adapter.test.ts`, nuevo `test/demo-view-races.test.ts` |
| Elipsis sólo >80; `npm start` sirve Next actual en loopback tras build; documentar ejecución | `src/views/ChatPage.tsx`, `package.json`, `docs/run-demo.md` |

FE0 mantiene pendiente revisar cookie firmada/código/same-origin/allowlist/ausencia de tokens en bundle, y pasar focales + typecheck/test/build después de sus cambios. Este baseline unitario no certifica integración real ni aceptación browser. El runner P0 `scripts/demo-browser-e2e.mjs` previsto por el plan no se creó en este TASK acotado. Backend y planning no se tocaron, no se inició dev server ni se usaron/alteraron puertos ajenos.

Tras entregar esta evidencia al coordinador por Herdr existente, frontend queda idle esperando el siguiente TASK; no comienza FE0 automáticamente.
