# Auditoría visual OdontoFlow

**Estado:** capturas regeneradas correctamente; matriz renderizada sin errores técnicos. Esto no significa que todas las vistas estén listas para producción.

## QA ejecutada

- Suite principal Playwright: **17/17 PASS** (build, TypeScript y recorridos seleccionados).
- Matriz de vistas: **23 pares rol/ruta**, cada uno a 1440, 390 y 375 px (**69 capturas**), incluyendo Atención, Agente y fallback del Asistente.
- **0** rutas fallidas, errores de página o overflow horizontal del documento. El fallback de `/asistente` a `/mi-dia` para Doctor es por acceso de rol, no una falla visual.
- El capturador se corrigió para restaurar el viewport desktop antes de cada ruta; imágenes verificadas como 1440 px reales.
- La matriz prueba render, rol elegido, encabezado, URL y geometría. No afirma que cada botón de cada superficie haya sido probado.

## Revisión visual por superficie

| Superficie | Evidencia | Observación y trabajo propuesto |
|---|---|---|
| Owner · Inicio | `view-matrix/owner-_-1440.png` | Buen núcleo analítico: cargos, cobros, sedes y excepciones caben en una lectura. Añadir una conclusión corta solo descriptiva; conectar ambos conjuntos de datos al drill-down correcto; separar saldo parcial, cancelación y no-show; evitar cualquier insight causal que la muestra no soporte. |
| Owner · Sedes | `view-matrix/owner-_sedes-1440.png` | Mantener comparación alineada entre sedes y navegación desde la cifra a su origen. Evitar duplicar en Inicio todo el contenido de Sedes. |
| Owner · Finanzas | `view-matrix/owner-_finanzas-1440.png` | Mantener exactamente la definición de Caja; mostrar fechas de cargo y pago por separado, saldo al corte fuera del flujo del periodo. Ningún total/API sin agregación autorizada. |
| Owner · Comercial | `view-matrix/owner-_comercial-1440.png` | Cola accionable de Leads; estados actuales no son conversión. No duplicar el módulo dentro de Pacientes ni presentar una tasa sin cohortes/historial. |
| Owner · Producción | `view-matrix/owner-_produccion-1440.png` | Hacer visible la fuente de cada ejecución y llegar a la visita/cargo. Producción por doctor y comisión quedan no disponibles si falta el vínculo contractual. |
| Owner · Inventario | `view-matrix/owner-_inventario-1440.png` | Balance por SKU/sede en unidad nativa, historial y diferencias de conteo. No sumar unidades incompatibles ni afirmar “stock bajo” sin mínimo acordado. |
| Owner · Caja | `view-matrix/owner-_caja-1440.png` | Solo lectura. Ocultar cualquier acción de cobro; distinguir total pagado en periodo de saldo vigente al corte. |
| Owner · Administración | `view-matrix/owner-_administracion-1440.png` | Mantener como futuro explícito; no simular gestión de usuarios/permisos reales. |
| Admin · Inicio | `view-matrix/admin-_-1440.png` | La próxima decisión y sus acciones son claras, pero la jornada ocupa poco espacio y deja un gran vacío. Reequilibrar con cola temporal real; no llenar con tarjetas. Alinear métricas al mismo día/sede. |
| Admin · Agenda | `view-matrix/admin-_agenda-1440.png` | Con dos citas, la semana queda vacía; la columna de viernes se corta junto al resumen lateral y los botones de doctores usan azul demasiado dominante para la dirección sobria. Abrir en día/lista temporal; dejar semana como opción y corregir clipping/responsive interno. |
| Admin · Pacientes/Leads | `view-matrix/admin-_pacientes-1440.png` | La tab Leads funciona, pero en móvil la tabla muestra columnas cortadas y los KPI se apilan antes de la tarea. Cambiar filas por resumen compacto en móvil; quitar KPI API que resulten artificialmente en cero. |
| Admin · Caja | `view-matrix/admin-_caja-1440.png` | Buen punto de entrada al saldo pendiente. En móvil la tabla se corta; sustituirla por filas apiladas con paciente/concepto/saldo. Cambiar ID interno y `Ejecución #0` por datos comprensibles. Hacer que filtros afecten también los totales. |
| Admin · Inventario | `view-matrix/admin-_inventario-1440.png` | Conteo escrito demo está visible y el saldo por producto/unidad puede ser el centro. Ya se quitó la tarjeta que sumaba unidades incompatibles. Conteo de voz/Telegram debe producir borrador revisable y confirmación separada. |
| Admin · Solicitudes | `view-matrix/admin-_solicitudes-1440.png` | Mantener una cola ordenada por estado/fecha y acción siguiente; diferenciar estados demo de API. Laboratorios no deben aparecer como integración real sin contrato. |
| Admin · Conversaciones | `view-matrix/admin-_chat-1440.png` | Objeto/conversación primero, ayuda contextual después. La API de conversación no está disponible: no afirmar mensajes reales, SLA ni respuesta enviada. |
| Doctor · Mi día | `view-matrix/collaborator-_mi-dia-1440.png` | No ofrece llegada prematura, pero duplica al paciente destacado y ordena 14:00 antes de una atención cerrada a las 10:30. Separar “Siguiente atención” de “Atenciones anteriores” o preservar una cronología estricta; no mezclar pasado y futuro como una sola línea temporal. |
| Doctor · Mis pacientes | `view-matrix/collaborator-_mis-pacientes-1440.png` | Priorizar por próxima acción/hito clínico y abrir registro desde el paciente. No sugerir notas clínicas reales si el estado es demo local. |
| Doctor · Solicitudes | `view-matrix/collaborator-_solicitudes-1440.png` | Mostrar solicitudes pertinentes a su actor y paso siguiente; API/permiso sin contrato sigue no disponible, no autorizado por selector demo. |
| Doctor · Registro clínico | `view-matrix/collaborator-_visitas_visit-ana-1440.png` | Mantener paciente, tratamiento y estado como contexto. Doctor completa servicio; nunca presentar Caja/pago como acción clínica. Nota demo debe indicar alcance local. |
| Admin · Atención | `view-matrix/admin-_atencion_visit-ana-1440.png` | El stepper no debe sugerir que Pago o Boleta ocurren en Atención; limitarlo al estado clínico/operativo y enlazar Caja cuando ya exista cargo. |
| Owner/Admin · Agente | `view-matrix/owner-_agente-1440.png` | Prototipo con métricas fijas no debe confundirse con rendimiento observado. Retirar del flujo normal de demo o dejar solo interacción exploratoria sin KPI engañosos. |
| Doctor · Asistente de voz | `view-matrix/collaborator-_asistente-1440.png` | Si la voz está apagada, el fallback a Agenda debe ser transparente. Cuando esté activo: grabar, transcribir, revisar, confirmar; sin cambio silencioso de stock ni halo ornamental. |

## Reglas analíticas bloqueantes

1. Nunca dibujar un cero cuando la API no entregó el dato. Usar `N/D` o esconder el indicador.
2. Cargos se agrupan por `created_at`; pagos por `paid_at`; saldo pendiente es un estado actual al corte, no el ingreso del periodo.
3. No sumar cantidades entre SKU con unidades distintas. Inventario se compara por producto y unidad.
4. “Cita confirmada” no significa “paciente confirmó asistencia”; cita futura sin visita no es no-show.
5. “Saldo pendiente” no es “vencido” mientras no haya fecha de vencimiento.
6. La etapa actual de Leads no prueba conversión; no hay tasa sin cohorte e historial de eventos.
7. Ninguna cifra de Agent (`24/8/5/3`), comisión, asistencia/API o productividad se presenta como observada si su fuente no lo permite.

**Resuelto tras la auditoría:** se quitó la tarjeta “Unidades en Lince” que sumaba cajas, unidades y cartuchos. La captura `screenshots/inventario.png` muestra los balances por producto y unidad. La batería volvió a pasar tras ese cambio (typecheck, 117 pruebas unitarias y 17/17 visuales); la matriz de 57 capturas se regeneró para reflejar el estado corregido.

## Capturas

El índice completo y medidas de cada captura están en [`view-matrix/report.json`](view-matrix/report.json). Las imágenes usan `{rol}-{ruta}-{1440|390|375}.png`.

## Skill aplicada

La revisión siguió `disruptive-product-design` para dirección Apple Clinical Precision y carácter propio, y `build-dashboard` para definición, fuente, denominador, historia y drill-down. A70/B30 es una jerarquía de producto, no una licencia para agregar gráficos decorativos: gráficas en Owner cuando explican una decisión; colas/listas en superficies clínicas y de operación.
