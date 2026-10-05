# Sprint 2 QA — fuente única y jornadas de recepción

**Fecha:** 27 de septiembre de 2026  
**Resultado:** **DEMO PASS — modo API conectada y aceptación formal pendientes**

## Entregado y verificado

- El contrato compartido de snapshot y comandos vive bajo `src/api/` y se exporta por `src/api.ts`. No quedan imports de `src/domain`, fixtures ni contratos privados desde las vistas/componentes de la aplicación.
- El snapshot demo permanece en memoria; la capa limpia el snapshot clínico legado de `sessionStorage`. El actor demo aporta capacidades y el reducer rechaza comandos no autorizados.
- La rama API construye el snapshot desde respuestas API sin incorporar fixtures demo. Los agregados de Owner y Workspace que no están en el contrato aparecen como no disponibles.
- Alta de cita demo desde el shell usa IDs de persona, sede, profesional y servicio; una sola mutación aparece en Agenda, Inicio Administrativo y Pacientes. El horario de creación se limita al tramo mostrado en Agenda.
- Cancelación, reprogramación, llegada, ejecución y pagos del mock pasan por comandos/repositorio comunes en las vistas correspondientes. QA global vigente: 112/112 unitarias; 17/17 recorridos visuales, cero errores de página.
- Las rutas operativas distintas de Inicio comparten estados de carga/error recuperables; el harness revisa Agenda en móvil y confirma que el reinicio devuelve la vista funcional. La ruta clínica muestra además el estado vacío de jornada.

## Pendiente / bloqueado

- No se ejercitó la rama API contra una sesión humana y backend disponible. El contrato de actor autenticado/permisos y el E2E real siguen pendientes; las pruebas actuales no equivalen a integración conectada.
- La unión API de citas depende de `lead_id`; los datos demo los relacionan únicamente por IDs. Una lectura de endpoint real con identidad/contrato faltante no se suple con joins por nombre.
- Al cerrar Sprint 2, Chat todavía usaba el transporte legado y se aplazó su integración por ownership. Ese estado quedó supersedido por la instrucción expresa de Alejandro del 27 de septiembre y el trabajo documentado en [Sprint 7 QA](./sprint-7.md): el flujo local Chat→Agenda→Inicio ya usa el repositorio común. Esto no afirma que se haya revisado o integrado código ausente de Leo.
- No hay pruebas reales que acrediten que las respuestas API vacías, 401 o 403 se comportan con una sesión autorizada de producción.

## Evidencia

- Capturas responsivas de Agenda en [`sprint-0/screenshots/`](./sprint-0/screenshots/) y de las pantallas maestras/estados en [`sprint-1/screenshots/`](./sprint-1/screenshots/).
- El flujo cross-surface de nueva cita se ejecuta en `scripts/visual-check.mjs`; invariantes del repositorio están en `test/odonto-repository.test.ts`.
- Capturas móviles de error y carga compartidos de Agenda en [`screenshots/`](./sprint-2/screenshots/).

## Siguiente criterio de cierre

Ensayar lecturas API vacías con contrato y sesión válidos; comprobar crear/mover/cancelar y los guardas de visita en navegador; verificar que una respuesta sin fixtures no retenga datos demo. Revisar cualquier entrega externa de Leo si se aporta, sin bloquear el flujo local ya autorizado. No se declara producto conectado ni aceptación formal mientras esas pruebas dependan de servicios/credenciales ausentes.
