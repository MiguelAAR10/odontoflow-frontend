# FE0-a — Frontend congelado para Sonnet, 2026-10-04

FE0-a independiente implementado y verificado localmente. **Diff congelado; revisión Sonnet, contrato descendente Chat/BE0b e integración I0 pendientes. No se declara Q2 completo.** P0 quedó cerrado antes de FE0-a en [frontend-baseline.md](../p0/frontend-baseline.md), conservando su fallo de build sandbox y reintento autorizado.

Writer: frontend Sol6.1 xhigh, panel Herdr existente `wX:pA`; coordinador `wX:p2`. CWD `/home/miguel/projects/portfolio/AI-EdgeRunners/odontoflow/.worktrees/frontend-erp`, rama `erp/frontend`. Sin agentes/paneles nuevos, Orca, commits, staging ni merge. Ninguna DB, migración, pytest, suite de integración, browser o servidor iniciado; lease backend `wX:p9` respetado.

## Handoff congelado

- Diff completo contra HEAD, incluidos ambos tests nuevos sin staging: [frontend-fe0-a.diff](frontend-fe0-a.diff), 68442 bytes, **SHA256 `f2f03294da34c8def5b59ff79c53eae9627b3c2c81f29a66fa1cdce5c6d1d326`**; sidecar [frontend-fe0-a.diff.sha256](frontend-fe0-a.diff.sha256).
- Inventario y hashes de los **19 archivos cambiados**: [source-hashes-final.json](source-hashes-final.json). README está incluido.
- Hashes de toda la superficie autorizada y contrato generado: [ownership-hashes-final.json](ownership-hashes-final.json).
- Preservación: [preservation-final.json](preservation-final.json), [tools-manifest-final.json](tools-manifest-final.json), `git-{head,status,inherited-commits}-final.log`, `git-inherited-final.patch`, `git-diff-staged-final.log` y `git-diff-check-final.log`.
- Resultados, comandos, tiempos, env overrides y hashes de logs: [verification-index.json](verification-index.json). Cada ejecución conserva también su `.log`, `.json` y `.exit`; los logs ignorados por Git existen en este directorio.
- `git diff --check` y `git apply --reverse --check frontend-fe0-a.diff`: exit 0. La segunda comprobación fue sólo lectura; no aplicó/revirtió cambios.

Freeze: `2026-10-04T08:13:25.391393+00:00`. No cambios de producto posteriores al freeze. Este reporte y sus sidecars son evidencia propia bajo el audit ya autorizado.

## Autoridad y preservación

Se consumieron AGENTS/CONTROL/CONTEXT, FE0 y SPEC bajo el Q0 aprobado por addendum Opus; no se abrió otra auditoría. Bindings de P0 permanecen autoridad:

- `../../odontoflow-planning/docs/handoffs/plans/2026-10-04-erp-demo-implementation.md`: `016ec7699eb2a7874d718787805eaf214e1461575a05d795e8f8eef4f75a4459`.
- `../../odontoflow-planning/docs/handoffs/plans/2026-10-04-erp-demo-spec.md`: `129fa54521e9a583e80359df4d0e8f0ae0dc4822f402c3219f61cf08b4b75528`.
- Gate: `../../odontoflow-planning/.audit/erp-demo-2026-10-04/opus-spec-review.md`.

HEAD conserva `842b8318ab7f810ad8b2397dc7fa72484a4f4f73`; `main` local conserva `e508b85e61131aa95ed14d783f1e569574b96979`. Los cinco commits heredados (`01c7d48`, `1eb0141`, `5611aae`, `3e80b7d`, `842b831`) y su diff permanecen idénticos. Los **118 archivos de herramientas untracked heredados** conservan paths/tamaños/SHA256. Staged diff: 0 bytes. Los únicos untracked adicionales fuera de las evidencias autorizadas son los dos tests nuevos del ownership.

No modificaciones en backend/planning, secretos, dependencias, lockfiles o configuración. `src/contracts/api.ts` permanece idéntico a HEAD: SHA256 `42d18ff42489d766141d2270c2ee29686cb041c595087feb65d0a9a70d92b86c`. No regeneración OpenAPI ni query descendente anticipada. README cambió exclusivamente su nota original sobre `npm start` (una línea retirada y una añadida), conforme a ampliación explícita del coordinador.

## Comportamiento entregado

| Superficie exacta cambiada | Resultado |
|---|---|
| `src/views/ApprovalsPage.tsx`, `src/approvals.ts`, `test/approvals-adapter.test.ts` | Pestaña “Aprobadas/en proceso”; un elemento approved no ofrece ni acepta reaprobar. `INVALID_INPUT`, `SLOT_BLOCKED`, `APPOINTMENT_CONFLICT` de propuestas de cita tienen mensajes españoles y acción de recarga; errores genéricos conservan envelope/código. Lecturas y resolución de intentos descartan resultados de tab/persona anteriores. |
| `src/contracts/client.ts`, `src/session.ts`, `src/components/PersonaContext.tsx`, `test/session-expiry.test.ts` | Invalidación compartida ante 401 de Axios o sesión fetch: elimina identidad/persona/código temporal y presenta selector. Versiones de identidad descartan respuestas anteriores, incluido un 401 tardío de otra persona. 403 conserva sesión; mutación 401 no se reproduce. El selector carga opciones antes de `/me` para conservarlas al caducar. |
| `src/views/AgendaPage.tsx`, `src/api.ts`, `test/agenda-adapter.test.ts`, `test/demo-view-races.test.ts` | Guardas para agenda/detalle/horarios y cleanup; éxito, error y finally obsoletos no ganan. “Hoy” toma el día de timezone de sede; elección de fecha conserva vista día/semana. Ventana semanal backend usa medianoches locales, con prueba DST. |
| `src/views/ChatPage.tsx`, `src/chat.ts`, `src/types.ts`, `test/chat-adapter.test.ts` | Guardas de paginación conversaciones/derivaciones/mensajes y deduplicación; se conservan guards iniciales existentes, ASC, cuatro páginas iniciales y “Ver mensajes más recientes”. Preview de 80 caracteres no añade elipsis; >80 sí. Proyecta ID real de contacto y contexto de cita, sin fabricar vínculo clínico. |
| `src/components/AppShell.tsx` | “Crear cita” desde Chat abre modal real con IDs conversación/contacto y copy de falta de vínculo. El operador selecciona explícitamente lead backend por ID; no matching por nombre ni creación ficticia. Selectores/horarios/mutación del modal descartan respuestas anteriores; cuerpo de booking conserva campos del contrato. |
| `package.json`, `docs/run-demo.md`, nota autorizada de `README.md` | `npm start` ejecuta `next start -p 5173 -H 127.0.0.1`. El entrypoint previo queda como `npm run start:legacy`. Runbook coherente con Next actual/BFF, flags de build, secretos server-only, puertos propios y límites BE0b/I0. No se ejecutó ninguno de esos servidores. |

`src/bff/proxy.ts`, `test/bff-session.test.ts` y `test/bff-guard.test.ts` estuvieron dentro del ownership, **sin modificaciones**. Se verificó el BFF existente mediante sus suites y las de persona/proxy/secret-guard en la unidad completa; no se reconstruyó su seguridad ni allowlist. Nombres server-only y prefijo `ofk_`: cero apariciones en 38 JS de `.next/static`, según [bundle-marker-scan.json](bundle-marker-scan.json). Es una búsqueda de marcadores literales, no una prueba de ausencia de cualquier secreto codificado; no se leyeron valores de secretos.

El contrato vigente sólo aporta `contact_identity_id`; la decisión del coordinador autoriza contexto y selección explícita de lead. “Crear cita” no convierte ese contacto en patient/lead ni inventa un contrato nuevo.

## TDD y verificación serial

Tests críticos nuevos/ampliados en límites públicos: transporte Axios/fetch, selección approved, errores de cita, ownership de respuesta, preview/contexto y fechas timezone. Nuevos archivos: `test/session-expiry.test.ts` (5 tests) y `test/demo-view-races.test.ts` (3 tests). Los imports runtime de esos tests evitan arrastrar el grafo frontend al tsconfig NodeNext histórico sin cambiar configuración. No dependencias añadidas.

| Evidencia | Exit | Resultado |
|---|---:|---|
| `approvals-red` → `approvals-green` | 1 → 0 | 4 fallos de comportamiento nuevo → 36 tests pasados |
| `session-red` → `session-green` | 1 → 0 | 5 fallos por seam ausente → 5 tests pasados |
| `races-red` → `races-green` | 1 → 0 | 3 fallos por seam ausente → 8 tests pasados en 2 archivos (incluye sesión) |
| `chat-agenda-red` | 1 | 5 fallos nuevos, 27 tests pasados |
| `chat-agenda-green` | 1 | 1 fallo restante por reexport ausente, 31 pasados; no se oculta por el nombre del log |
| `focal-1` | 0 | **168/168 tests, 7 archivos**; incluye corrección del reexport y BFF existente |
| `typecheck-final` | 0 | `npm run typecheck`, ambos tsconfigs; 20.691 s |
| `unit-final` | 0 | `npm test`: **370/370 tests, 30 archivos**; comando 25.097 s |
| `build-sandbox` | 1 | `npm run build`, fallo conservado de captura `tsc --showConfig`; 4.979 s |
| `build-escalated` | 0 | Mismo `npm run build`, escalación normal autorizada; Next completo + tsc backend, 15 páginas; 66.301 s |

Logs finales directos: [typecheck-final.log](typecheck-final.log), [unit-final.log](unit-final.log), [build-sandbox.log](build-sandbox.log), [build-escalated.log](build-escalated.log); exits/metadata adyacentes. Typecheck/unidad/build finales corresponden al código congelado. El focal inicial también se conserva y toda su cobertura fue reejecutada por `unit-final`.

Todos los comandos pesados se ejecutaron en serie. Sólo tests usaron `VITEST_MAX_THREADS=1 VITEST_MIN_THREADS=1 VITEST_MAX_FORKS=1 VITEST_MIN_FORKS=1`, un worker. Build conservó flags, configuración y sus nueve workers habituales. El warning de secreto corto en `bff-session` es su fixture negativo esperado.

Antes de ejecutar se comprobó la exclusión de las cuatro suites reales: `test/agenda-integration.test.ts`, `test/patients-integration.test.ts`, `test/pilot-e2e.test.ts`, `test/service-to-cash-integration.test.ts`. Permanecen registradas en `vitest.e2e.config.ts`; ninguna se ejecutó. El test histórico `end-to-end-followup` es in-memory, no DB/E2E real.

## Build: diagnóstico conservado, sin fixes de entorno

Reapareció exactamente `Could not parse output from TypeScript's --showConfig.` dentro del sandbox. Se conserva el exit 1. P0 ya reprodujo stdout vacío mediante subprocess Node frente a JSON válido ejecutando tsc directamente; el build original pasó fuera del sandbox. FE0-a reutilizó ese diagnóstico acotado y reintentó **el mismo comando** con el mecanismo normal de escalación; exit 0, sin overrides para build, cambios de deps/tsconfig/config o desactivación de controles. La causa subyacente de captura/proceso sigue sin atribuirse.

Se usaron docs locales Next 16.3.4 (`node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md` y `05-config/01-next-config-js/useTypeScriptCli.md`) y Context7 para las APIs modificadas: React 18 `/reactjs/react.dev/__branch__v18`, Axios `/axios/axios/v1.7.9`, Next `/vercel/next.js`. No se modificó producto para hacer verde el fallo sandbox.

## Pendientes y límites para Sonnet/coordinador

1. Revisar este diff congelado y su SHA, especialmente transición 401/persona, guardas success/error/finally y modal real. Los tests de carreras verifican la seam pública, **no componentes montados ni browser**; no se presenta eso como prueba I0.
2. Esperar entrega BE0b/OpenAPI estable. Luego regenerar `src/contracts/api.ts` exclusivamente por generador e integrar lectura descendente/anteriores en `src/contracts/client.ts`, `src/chat.ts`, `src/api.ts`, `src/types.ts`, `src/views/ChatPage.tsx`, `test/chat-adapter.test.ts`. No historia anterior simulada ni query inventada en esta entrega.
3. I0 bajo lease exclusivo del coordinador/backend: browser real sin mocks, >100 mensajes, cambios rápidos de filtro/persona/hilo, respuestas fuera de orden, 401 caducado/403, booking desde Chat, permisos y BFF. Servir Next en loopback se documentó y compiló; su ejecución HTTP sigue pendiente por prohibición actual de servidores.
4. Q2 completo requiere revisión y la parte de Chat dependiente BE0b + integración real. Ninguna aceptación completa de demo/Q2/Q8 está declarada.

El frontend queda congelado e idle tras entregar este handoff al coordinador por el Herdr existente. No inicia FE0-b ni integración por cuenta propia.
