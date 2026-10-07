# FE0-a — Reparaciones Sonnet para re-review, 2026-10-04

Paquete enfocado implementado y congelado: NB3/4/5/6/8 corregidos en código; NB1/7 aceptados y documentados conforme a decisión del coordinador; NB2 conserva el gate browser/I0. **Pendiente re-review Sonnet; no PASS nuevo de revisión ni cierre Q2.** Chat desc/BE0b e integración siguen pendientes y no se iniciaron.

Writer frontend Sol6.1 xhigh, misma sesión Herdr `wX:pA`, destino coordinador `wX:p2`. CWD `/home/miguel/projects/portfolio/AI-EdgeRunners/odontoflow/.worktrees/frontend-erp`, rama `erp/frontend`. Fuente de reparación, sólo lectura: `../../odontoflow-planning/.audit/erp-demo-2026-10-04/sonnet-fe0-a-review.md` (PASS estático limitado, cero blockers, ocho NB) y decisiones explícitas del coordinador. No nueva auditoría de alcance.

## Diffs y preservación

- **Sólo este paquete**, contra el freeze FE0-a original: [review-fixes-only.diff](review-fixes-only.diff), 9009 bytes, SHA256 **`fe9f626fa2d5d132e8e6b8e0e31044f1bc35bd5135823760defd19c5ebf437db`**; [sidecar](review-fixes-only.diff.sha256).
- **Diff final completo contra HEAD**, con ambos tests untracked: [frontend-fe0-a-final.diff](frontend-fe0-a-final.diff), 71572 bytes, SHA256 **`fb500697e0bee51acd9616144aa6cdc15f2f37c87e945a590b4c7ef0941122d2`**; [sidecar](frontend-fe0-a-final.diff.sha256).
- [review-subset-hashes-final.json](review-subset-hashes-final.json): los seis paths cambiados desde el freeze. [source-hashes-final.json](source-hashes-final.json): los 19 paths totales contra HEAD, incluido README sin nuevos cambios. [ownership-hashes-final.json](ownership-hashes-final.json): toda la superficie original, contrato generado y BFF incluidos.
- [preservation-final.json](preservation-final.json), [original-freeze-hashes-before.json](original-freeze-hashes-before.json), [original-freeze-hashes-after.json](original-freeze-hashes-after.json), [tools-manifest-final.json](tools-manifest-final.json), `git-{head,status,inherited-commits}-final.log` y [freeze-validation.log](freeze-validation.log).

Los **64 archivos de evidencia del freeze original** bajo `../fe0/` permanecen byte a byte intactos, incluido su reporte/diff/hashes/logs. SHA originales: reporte `58592db0651846290c44d488a1266f465dab391418051791921d9baed8dabaa2`, diff `f2f03294da34c8def5b59ff79c53eae9627b3c2c81f29a66fa1cdce5c6d1d326`. El manifiesto fuente original describe aquel punto histórico; este paquete autorizado cambia seis de esos archivos y aporta un manifiesto vigente separado. Las copias base para el incremental se conservan como `.snapshot`, fuera del discovery de tests.

HEAD continúa `842b8318ab7f810ad8b2397dc7fa72484a4f4f73`. Los cinco commits heredados, su diff y los **118 archivos de herramientas untracked** mantienen paths/tamaños/hashes. Staged diff: 0 bytes. `git diff --check` y `git apply --reverse --check` para ambos diffs: exit 0, sin aplicar cambios. Todos los paths del ownership original fuera del subset de reparación permanecen idénticos al freeze, incluidos README, cliente/transporte, `src/contracts/api.ts`, BFF y tests BFF.

Sin commits/merge, backend/planning, deps/lockfiles/config, secretos, componente Modal/shared ni contrato generado modificados. Sin DB/migraciones/pytest/E2E/browser/servidores/puertos, paneles/agentes nuevos ni Orca. Lease backend respetado. P0/Q0 y sus hashes de autoridad permanecen los del handoff original.

## Resolución de los ocho NB

| NB | Decisión y cambio concreto | Verificación / límite |
|---|---|---|
| **NB1** | Aceptado/documentado en `docs/run-demo.md`: backend ya recorta preview a 80 y no proyecta `truncated`. No se usa `>=80`, no se cambia `src/chat.ts` ni se amplía API/BE0b por esto. | Limitación de contrato conservada; BE0b sigue limitado a desc. |
| **NB2** | Se mantiene I0/browser para carreras y efectos reales. No tests de líneas, hooks sustituidos ni helpers nuevos sin wiring. | Los dos tests nuevos son render estático del **PersonaProvider real**, sólo para gate inicial; no reemplazan pruebas de componentes interactivos. |
| **NB3** | `src/components/AppShell.tsx`: Cancelar usa el mismo `closeAppointment` guardado por `saving` y queda disabled; `Modal.onClose` usa ese callback, por lo que Escape/backdrop/X tampoco ocultan un guardado en vuelo. Éxito conserva cierre/toast/evento originales; no replay de mutación. | Se leyó el wiring real de `Modal` y `useFocusTrap`, sin editarlos. Guardas de identidad conservadas. El cambio de identidad invalida/cierra el modal incluso en mock, donde AppShell permanece montado, para no dejar un guardado descartado bloqueando el formulario. Cierre durante respuesta lenta y evento/refresco requieren I0. |
| **NB4** | AppShell usa `Promise.allSettled`: llena cada lista exitosa, vacía sólo la fallida y muestra los mensajes de todos los rechazos. El ticket/identidad se comprueba antes de cualquier resultado y también en catch. | 401 global sigue descartando el árbol real; 403 permite los resultados parciales sin logout. Transporte 401/403/noreplay conserva tests vigentes. Parcialidad visible con lectura 403 requiere I0. |
| **NB5** | `src/views/AgendaPage.tsx`: `closeDetail` invalida tickets y reinicia explícitamente `detailLoading` y `rescheduleLoading`. | Cambio directo de estado; finally viejo permanece descartado. Apertura/cierre interactivos pendientes I0. |
| **NB6** | `src/views/ApprovalsPage.tsx`: retirado `appointment-created` del catch de error de propuesta. “Volver a cargar” conserva `refresh()` propio. | No se emite falsa creación ni se reconstruye recarga/guards. |
| **NB7** | Aceptado/documentado en runbook: 401 por código incorrecto durante cambio vuelve al selector y descarta la identidad anterior, aunque su cookie pudiera seguir válida. | Comportamiento central y test de sesión existentes sin cambios; I0 confirmará UX acordada. |
| **NB8** | `src/components/PersonaContext.tsx`: gate vuelve a `!useMocks && (...)`, conservando loading/switching/persona/identity y las guardas en real. Modo diseño muestra sus children mientras carga. | El efecto existente sigue leyendo la identidad de la persona mock vigente. TDD con render inicial real/mock, sin efectos ni browser: RED 1/5 → GREEN 5/5. |

Subset exacto de este paquete: `src/components/AppShell.tsx`, `src/components/PersonaContext.tsx`, `src/views/AgendaPage.tsx`, `src/views/ApprovalsPage.tsx`, `docs/run-demo.md`, `test/demo-view-races.test.ts`. No otros paths de producto/tests cambiaron desde el freeze.

## Verificación nueva, serial y con logs completos

[verification-index.json](verification-index.json) registra comandos, overrides, tiempos, exits y SHA de cada log. Cada ejecución conserva `.log`, `.json`, `.exit`; los logs ignorados por Git existen localmente.

| Ejecución | Exit | Resultado |
|---|---:|---|
| `persona-render-red` inicial | 1 | 4 fallos/4 pasados en 2 archivos: 1 fallo real de gate mock y 3 fallos de imports de una copia de evidencia descubierta por Vitest. Se conserva completa. |
| `persona-render-red-scoped` | 1 | Tras renombrar las copias de evidencia a `.snapshot`, sin cambiar configuración: **1 fallo de gate mock, 4 pasados, 1 archivo**. |
| `persona-render-green` | 0 | **5/5 tests, 1 archivo**, incluye ambos renders iniciales y las tres pruebas anteriores de seam; 2.056 s de comando. |
| `npm run typecheck` | 0 | Ambos tsconfigs, sin diagnósticos; 9.681 s. |
| `npm test` | 0 | **372/372 tests, 30 archivos**; 19.052 s de comando, sin discovery de snapshots. |
| `npm run build`, sandbox | 1 | Fallo conservado: `Could not parse output from TypeScript's --showConfig.`; 3.196 s. |
| Mismo `npm run build`, escalación normal autorizada | 0 | Next completo, 15 páginas, seguido de tsc backend; 34.865 s. |

Logs: [persona-render-red.log](persona-render-red.log), [persona-render-red-scoped.log](persona-render-red-scoped.log), [persona-render-green.log](persona-render-green.log), [typecheck-final.log](typecheck-final.log), [unit-final.log](unit-final.log), [build-sandbox.log](build-sandbox.log), [build-escalated.log](build-escalated.log). La incidencia de discovery se explica además en [snapshot-discovery-note.md](snapshot-discovery-note.md); no se borró ninguna salida fallida.

Todos los comandos pesados terminaron antes de iniciar el siguiente. Sólo tests fijan los cuatro `VITEST_*THREADS/FORKS=1`, un worker. Build mantiene exactamente `next build --webpack && tsc -p tsconfig.backend.json`, sin overrides ni cambios de controles/configuración. El fallo de captura/proceso coincide con el diagnóstico acotado P0 y permanece sin atribución subyacente; no se hizo otro diagnóstico ni un bypass. Warning negativo de secret corto en BFF esperado por su fixture.

`vitest.config.ts` conserva la exclusión de `test/agenda-integration.test.ts`, `test/patients-integration.test.ts`, `test/pilot-e2e.test.ts`, `test/service-to-cash-integration.test.ts`. No se ejecutaron esas suites, setup E2E ni harness contra DB; `end-to-end-followup` sigue siendo in-memory. No dependencias nuevas para montaje.

Context7 React 18 (`/reactjs/react.dev/__branch__v18`) consultado para callback/state y `renderToStaticMarkup`: genera HTML no interactivo. **Estos tests no montan DOM, no ejecutan useEffect ni prueban carreras/cierre de modal en browser.** Son cobertura del wiring de render inicial, con fallo observado antes del fix; el gate I0 de NB2 continúa íntegro.

## Próximo gate

El coordinador puede entregar el incremental y los hashes/manifiestos vigentes a Sonnet para re-review. I0 deberá confirmar Esc/backdrop/X/Cancelar durante guardado lento, éxito/refresco sin cierre prematuro, selector parcialmente 403 frente a 401, cleanup de spinners, cambio de identidad/código inválido y carreras de vistas reales. No se reclama esa evidencia a partir de unidad/SSR/build.

No FE0-b ni integración iniciada. Chat mantiene ASC y contrato actual; la regeneración y consumo desc esperan BE0b. Q2 completo sigue pendiente. Tras este handoff frontend queda congelado e idle esperando TASK del coordinador.
