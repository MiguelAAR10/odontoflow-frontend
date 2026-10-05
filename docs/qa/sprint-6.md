# Sprint 6 QA — jornada clínica del Doctor

**Fecha:** 27 de septiembre de 2026  
**Resultado:** **PASS — flujo frontend demo; modo API y aceptación formal pendientes**

## Implementado

- Mi día separa la cita futura, la visita ya registrada y la cita vencida sin visita; si la agenda está vacía muestra un estado explícito.
- Mis pacientes cuenta solo visitas y próximas citas del profesional actual; si no hay asignaciones muestra el estado vacío correspondiente.
- Registro clínico permite guardar una nota sintética y completar un servicio en el repositorio demo. El cargo nace desde la ejecución y Caja queda fuera de la ruta del Doctor.
- Un Doctor que abre manualmente un ID de visita de otro profesional ve un estado fuera de alcance; el formulario no carga la nota ajena en su estado de edición. Esta comprobación del frontend demo no equivale a autorización del servidor.
- La suite visual ejecuta llegada → nota sintética → ejecución/cargo, revisa los estados vacíos y comprueba el documento a 390 px tanto en Mi día como en Registro clínico.

## Restricciones y pendientes

- Las notas y operaciones son locales al escenario demo en memoria; no usar datos clínicos reales en esta prueba.
- El modo API no aporta sesión profesional, vínculo autorizado de visita/paciente ni contrato de historia clínica. No se afirma conexión ni persistencia de notas.
- Completar la revisión de dominio de Miguel. La firma visual final de Alejandro queda pendiente.

## Capturas

- [Mi día desktop](./sprint-6/screenshots/doctor-mi-dia-1440.png), [Mi día móvil](./sprint-6/screenshots/doctor-mi-dia-390.png), [Mi día vacío](./sprint-6/screenshots/doctor-mi-dia-empty-390.png).
- [Registro clínico desktop](./sprint-6/screenshots/doctor-registro-1440.png) y [Registro clínico móvil](./sprint-6/screenshots/doctor-registro-390.png).

## QA

- `npm run typecheck`: PASS; `npm test -- --reporter=dot`: 112/112 PASS.
- Suite visual global vigente: 17/17 PASS, cero errores de página.
