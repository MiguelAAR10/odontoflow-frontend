# Sprint 7 QA — Ayuda contextual, Chat y productividad

**Fecha:** 27 de septiembre de 2026  
**Resultado:** **Chat local y recorrido de citas demo: QA PASS; mensajería externa no conectada**

## Ayuda contextual

- Dock lateral disponible en Pacientes, Caja, Inventario, Mi día, Mis pacientes, Solicitudes, Comercial y Producción. Mantiene la fila activa y muestra un resumen tipado con enlace a su fuente.
- Prepara borradores locales para seguimiento, recordatorios y conteo escrito. Preparar solo cambia el texto editable; no envía mensajes, registra pagos ni mueve stock.
- Caja calcula importes en centavos enteros. Las acciones están deshabilitadas en modo API.
- Desktop reserva una columna; móvil coloca el panel bajo el contenido sin ensanchar el documento.
- `/agente` no aparece en la navegación principal. `/asistente` conserva el dictado de voz y no se presenta como ayuda contextual.

## Chat y citas compartidas

- Chat deriva pacientes y leads del repositorio común, filtra por sede para el perfil administrativo y asocia las citas por ID de paciente o lead.
- Cada contacto tiene una conversación de muestra identificada por `patient:<id>` o `lead:<id>` del snapshot compartido. Enviar agrega un mensaje solo al estado local de la vista; **Demo** lo identifica y **Restablecer** devuelve el hilo a los tres mensajes de muestra. No llama a WhatsApp ni a otro servicio externo.
- El perfil administrativo puede crear una cita demo con la capacidad `appointments.create`. Servicio, sede y profesional deben coincidir con una combinación presente en las citas del snapshot. La cita aparece en Agenda y en la jornada de Inicio con la misma persona y combinación.
- En modo API Chat explica que el endpoint de conversaciones no está disponible y no presenta datos demo.
- El owner puede consultar contactos, pero no ve la acción para crear citas porque no tiene esa capacidad.
- Agenda abre la cita enlazada por ID y, al cerrar el drawer, quita el parámetro de la URL para que no vuelva a abrirse.
- La verificación en navegador cubre filtros de leads, permiso del Owner, envío/reset local en desktop y 390 px, ausencia de solicitudes no-lectura al enviar, creación desde Chat, apertura de la misma cita en Agenda y presencia en Inicio.
- El fallback API de Chat muestra el endpoint como no disponible sin leer ni mutar datos demo. La suite visual corre en modo demo y no ejercita esa rama API.

## Límites y aceptación

- La suite valida únicamente el escenario demo compartido. Voz y Telegram siguen desconectados; el flujo real requiere sus integraciones y autenticación del backend.
- La evidencia técnica no reemplaza el visto bueno visual de Alejandro ni la revisión de dominio de Miguel.

## Capturas

- [Chat desktop](./sprint-7/screenshots/chat-1440.png), [cita creada en Chat](./sprint-7/screenshots/chat-appointment-1440.png) y [Chat móvil](./sprint-7/screenshots/chat-390.png).
- [Pacientes desktop](./sprint-7/screenshots/help-patient-1440.png) y [móvil](./sprint-7/screenshots/help-patient-390.png).
- [Caja desktop](./sprint-7/screenshots/help-cash-1440.png) e [Inventario desktop](./sprint-7/screenshots/help-inventory-1440.png).

## QA global vigente

- `npm run typecheck`: PASS; `npm test -- --reporter=dot`: 117/117.
- Verificación focalizada en navegador: PASS. Ana conserva el ID `patient:patient-ana`; sus valores iniciales son Blanqueamiento, Lince y Valeria. La cita de las 15:30 se ve en Agenda e Inicio bajo esa misma combinación. El envío/reset local pasó en desktop y móvil, sin solicitudes no-lectura ni overflow horizontal. Owner ve los dos leads permitidos sin acción de crear cita; Admin conserva esa acción.
- La ejecución visual amplia de este cambio no produjo un informe final; el recorrido focalizado anterior cubre los flujos afectados. La rama API de Chat tampoco se ejercitó en navegador.
