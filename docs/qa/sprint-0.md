# Sprint 0 QA — guion para la demo

**Fecha:** 27 de septiembre de 2026  
**Resultado:** **PASS — smoke frontend demo repetible**

## Evidencia

- `npm run typecheck`: PASS (frontend y backend).
- `npm test -- --reporter=dot`: PASS, 112 pruebas en 13 archivos.
- `VISUAL_BROWSER_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:visual`: última corrida PASS, 17/17 recorridos y cero errores de página. El comando compila la app antes de abrir el navegador.
- Inicio Administrativo y Owner: PASS a 1440, 1280, 390 y 375 px; las rutas principales no desbordan el viewport. Capturas en [`sprint-1/screenshots/`](./sprint-1/screenshots/).
- Agenda: el alta elige persona por ID, y el harness verifica la nueva cita en Agenda, Inicio Administrativo y la próxima cita de Carlos en Pacientes.
- Leads: el flujo demo crea, asigna, contacta y convierte con vínculo explícito al nuevo paciente. Capturas en [`sprint-3/screenshots/`](./sprint-3/screenshots/).
- Finanzas: cifras Owner/Finanzas conciliadas con definición y periodo compartidos; capturas desktop/móvil en [`sprint-5/screenshots/`](./sprint-5/screenshots/).
- Doctor: llegada, nota sintética y cierre demo; vistas desktop/móvil en [`sprint-6/screenshots/`](./sprint-6/screenshots/).

## Recorridos

| Recorrido | Resultado | Observación |
| --- | --- | --- |
| Inicio administrativo | PASS | Muestra cola de citas y siguiente acción. |
| Owner | PASS | Cifras demo, filtros y detalle del origen del gráfico. |
| Agenda | PASS | Carga, filtros, detalle y cita vinculada al paciente por ID. |
| Agente IA | PASS | Pestañas y acciones revisadas por el harness. |
| Pacientes | PASS | Búsqueda, ficha y alta local; próxima cita considera horario futuro confirmado. |
| Leads | PASS | Lista, búsqueda, filtros y ciclo demo trazable. |
| Caja | PASS | Búsqueda y registro de cobro local. |
| Inventario | PASS | Balance, filtro de sede y Kardex existente. |
| Chat | PASS demo | Identidades y citas salen del repositorio común; una cita creada se abre por ID en Agenda y aparece en Inicio. Mensajería real sigue no conectada. |
| Responsive | PASS | Agenda/menú a 390 px; suite revisa además 1024 px. |

Las capturas del smoke están en `docs/qa/sprint-0/screenshots/`. Los datos y las mutaciones son sintéticos y en memoria; estas pruebas no acreditan persistencia, permisos del servidor ni operación conectada a clientes.

## Límite del resultado

PASS certifica el guion de frontend demo cubierto por el harness. No certifica mensajería externa de Chat, el backend real, autenticación ni producción. El recorrido actualizado de Chat está documentado en [Sprint 7 QA](./sprint-7.md); la aceptación visual final del plan sigue requiriendo la revisión explícita de Alejandro.
