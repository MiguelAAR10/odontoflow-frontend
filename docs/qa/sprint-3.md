# Sprint 3 QA — Leads y Pacientes separados

**Fecha:** 27 de septiembre de 2026  
**Resultado:** **IN PROGRESS — ciclo demo trazable; verificación con backend pendiente**

## Entregado y verificado

- Leads vive en la pestaña `/pacientes?tab=leads`; Pacientes continúa listando personas y mantiene fichas separadas.
- La lista demo permite buscar y filtrar por estado/sede, abrir ficha, asignar sede, registrar contacto y promover a paciente. Los eventos conservan `leadId`; la promoción guarda `patientId`, y la cita vinculada usa el mismo ID del lead/paciente sin hacer join por nombre.
- El harness ejecuta crear → asignar a Lince → contactar → promover, comprueba el vínculo a Pacientes y captura desktop/móvil: [`screenshots/leads-1440.png`](./sprint-3/screenshots/leads-1440.png) y [`screenshots/leads-390.png`](./sprint-3/screenshots/leads-390.png).
- La UI de acciones demo queda restringida a un actor Admin con capacidades. Comercial Owner es lectura y enlaza a la pestaña Leads.
- La capa de transporte expone operaciones API tipadas de listar, leer y crear lead. En modo API no se muestran asignación, actividad ni promoción como persistidas; solo acepta los tres orígenes del contrato.

## Pendiente / bloqueado

- No se ejecutaron listar/leer/crear contra el backend con sesión humana real. No se afirma cobertura E2E del contrato ni del catálogo de necesidades.
- Sede, fecha de alta, contacto e historial y conversión no están disponibles en el contrato API actual. La UI los deja como no informados/no disponibles y no inventa una tasa de conversión.
- La aprobación de dominio de Miguel sigue pendiente; por ello el sprint está implementado para demo, no aceptado formalmente.

## Evidencia

- `npm test -- --reporter=dot`: suite vigente de 112/112 pruebas PASS, incluida trazabilidad lead→paciente y rechazo de acciones no soportadas en API.
- Suite de navegador global vigente: 17/17 PASS y cero errores de página; flujo Leads incluido.
- El escenario visual usa datos sintéticos en memoria. No acredita persistencia ni permisos reales de backend.
