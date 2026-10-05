# OdontoFlow · Día 1 de perfeccionamiento frontend

**Fecha de auditoría:** 27–28 sep 2026  
**Objetivo del día:** convertir la demo actual en una experiencia clínica premium que se entienda en segundos y use datos para orientar acciones. Ocho horas efectivas, con QA bloqueante por bloque.

Este día inicia el trabajo de perfeccionamiento; no promete rediseñar y cerrar todas las rutas en ocho horas. Se cierra el día con las tres pantallas de mayor impacto afinadas (Owner, Administrativo y Doctor), defectos secundarios priorizados y evidencia visual reproducible. El trabajo de integración real sigue dependiendo de contratos, identidad y backend.

## Criterio de producto

- **Dirección:** Apple Clinical Precision, proporción visual A70/B30. 70% calma clínica y precisión; 30% carácter analítico, composición y movimiento con propósito.
- **Acabado:** lienzo claro, tinta oscura, un acento clínico sobrio, estados semánticos apagados, tipografía de sistema, alineación estricta y profundidad ligera. Sin fluorescencia, gradientes decorativos, glassmorphism, brillos, cards repetidas ni textos que expliquen la interfaz.
- **WOW:** una idea visual propia por vista, construida desde el trabajo. Owner: observar el resultado y descubrir su causa. Administrativo: ver el siguiente evento y resolverlo. Doctor: preparar y cerrar la atención. Inventario: conciliar saldo, conteo y movimiento.
- **Regla para cada cifra:** pregunta que responde → definición y periodo → dato observado o derivado → desglose que explica → acción que abre el origen. Si falta fuente o denominador, se etiqueta como demo/no disponible o se oculta.
- **No simular:** identidad real, permisos de backend, conversión histórica, mínimo de stock, notas clínicas, comisión, boleta ni analítica API que no exista. Voz y Telegram conservan revisión humana y escritura demo explícita.

## Evidencia inicial

Playwright produjo capturas por rol y vista, y luego una matriz completa de rutas en escritorio y móvil. El build de producción y TypeScript pasan; el recorrido Doctor quedó corregido para preservar el estado demo y respetar la hora de la cita. El resultado vigente es **17/17 pruebas visuales/funcionales, 19 rutas capturadas por rol, cero errores de página y cero desbordes horizontales a 390/375 px**. La matriz de capturas está en `docs/qa/auditoria-2026-09-28/view-matrix/`; su `report.json` registra ruta, rol, heading, URL final y medidas de overflow.

Hallazgos visibles en las capturas:

| Vista | Lo que ya funciona | Lo que falta para que destaque |
|---|---|---|
| Owner · Inicio | Serie de cargos/pagos, filtro de periodo/sede y comparación conciliada por sede. | Un insight principal que nombre el driver; mejorar jerarquía y anotaciones del gráfico; evitar días vacíos que parezcan fallas; llevar cada hallazgo a la fila que lo explica. |
| Administrativo · Inicio | La siguiente cita aparece antes que la llegada y muestra teléfono/acción. | La jornada ocupa poco lienzo y queda mucho vacío; aprovechar el espacio para agenda inmediata/carga operativa sin inventar datos; convertir cifras superiores en contexto para resolver la cola, no en una franja comprimida. |
| Agenda | Filtros, detalle y creación de citas funcionan; distingue citas y llegadas. | Semana vacía domina la pantalla con pocos eventos; abrir en agenda diaria/lista temporal y dejar Semana como alternativa; cita seleccionada y detalle deben conservar contexto sin tapar el calendario. |
| Pacientes / Leads | Búsqueda, filtros, ficha, registro de paciente, asignación y promoción demo. | Hacer obvio el cambio Pacientes/Leads; recortar indicadores repetidos; mostrar la secuencia del lead solo con eventos existentes; distinguir “sin dato” de cero. |
| Caja | Abonos parciales, saldo pendiente y permiso de cobro operativo. | Sustituir IDs internos por paciente, concepto y fecha; dar prioridad visual al saldo; el Owner solo lectura y Administrativo cobra. |
| Inventario | Balance por sede, transferencia con historial y conteo revisable. | Hacer del balance y la variación la historia principal; explicar iconos con tooltip accesible; distinguir “cero en esta sede” de “sin stock global”; mínimo solo con contrato real. |
| Finanzas | Comparte las definiciones de Caja y permite periodo. | Comparación que explique el total por sede y lectura temporal; sin gráfico API hasta contar con agregados autorizados. |
| Sedes | Comparación con detalle operativo. | Evitar tarjetas clonadas; comparar dimensiones alineadas y abrir la causa desde el valor. |
| Comercial | Cola demo y acciones de contacto/promoción. | No duplicar Leads que ya viven en Pacientes; no presentar conversión real sin historial de etapas. |
| Producción | Lista ejecuciones y cargo vinculado. | Mostrar producción por profesional solo donde exista vínculo; drill-down a visita/cargo; no extrapolar comisión. |
| Mi día | Foco de siguiente paciente, visitas y no-shows existentes; orden y fechas locales claros, sin llegada prematura. | El paciente destacado se repite como primera fila y la Jornada pone 14:00 antes de una atención ya cerrada a las 10:30 del mismo día. Separar “Siguiente atención” de “Atenciones anteriores” o conservar una cronología estricta; nunca presentar pasado debajo de futuro como una sola línea temporal. |
| Mis pacientes | Tratamiento, visitas y siguiente hito. | Ordenar por decisión pendiente; ruta clínica compacta y documentación solo si está en la fuente; no duplicar fichas vacías. |
| Solicitudes / laboratorios | Cola demo compartida y cambio de estado. | Ordenar por urgencia/antigüedad con fecha real; separar el tipo clínico del paso siguiente; laboratorio no es capacidad real del API. |
| Atención / Registro | Abre desde una entidad y la ejecución crea su cargo en demo. | Mantener el paciente como contexto; secuencia clínica legible; nota demo claramente local; Doctor completa servicio, Caja cobra. |
| Chat / Ayuda contextual | Conversación local compartida con el paciente y borrador asociado a la fila. | Objeto primero, asistente después; sugerencias concretas según registro seleccionado; sin estética ni copy de chatbot genérico, sin acciones ocultas o automáticas. |
| Administración / Agente / Voz | Administración se declara futura; voz tiene flujo mock separado. | No vender endpoints o cifras fijas del Agente como observados; mantener Administración sin permisos falsos; la voz edita un borrador y requiere confirmación. |

### Riesgos de métrica detectados en revisión independiente

Estos defectos tienen prioridad sobre el pulido gráfico porque pueden inducir una decisión equivocada:

| Prioridad | Vista | Problema comprobable | Regla de corrección |
|---|---|---|---|
| P0 | Todas las métricas API | La identidad y el ámbito autorizados no están resueltos; faltan agregados, paginación y algunos campos/join del dominio. | Mostrar no disponible, no cero; no conectar datos reales hasta sesión autorizada y contrato aprobado. |
| P1 | Inicio Admin | El resumen junta citas del 14 ago., confirmaciones de 48 h, visitas acumuladas y saldo actual. | Contadores con una misma ventana/sede; sacar el saldo del resumen diario o rotularlo como saldo al corte. |
| P1 | Agenda | “Por confirmar” significa cita sin visita, no confirmación del paciente; API puede pintar 0 llegadas sin leer visitas. | Etiquetar “Sin visita registrada” cuando aplique y `N/D` si no se puede verificar; nunca convertir ausencia de dato en cero. |
| P1 | Pacientes | Los KPI “Leads” y “Con próxima cita” pueden quedar siempre en cero en API por adaptadores que no representan esos estados ni enlazan cita-paciente. | En API, retirar esos KPI o mostrar `N/D` hasta tener el vínculo correcto; no resolver por nombre. |
| P1 | Caja | Las tarjetas pueden sumar todos los cargos cargados, no el rango/filtro visible; saldo no tiene vencimiento. | Separar pagos por `paid_at` del saldo abierto al corte; no llamar vencido a un saldo sin vencimiento. |
| Resuelto en este corte | Inventario | La tarjeta “Unidades en stock” sumaba cajas, unidades y cartuchos. | Retirada; quedan productos, sedes y productos sin stock en sede. La tabla conserva saldo por SKU/unidad. `npm run typecheck`, 117 unit tests y suite visual 17/17 pasan después del cambio. |
| P1 | Owner | La línea de cobros invita a drill-down pero no abre la serie elegida; excepciones mezcla saldos parciales con cancelaciones y no-shows. | Conectar cada serie a su origen; separar cobro pendiente, cita cancelada y no-show como listas/tipos distintos. |
| P1 | Owner · Sedes · Producción | El saldo puede cambiar de alcance al cambiar periodo; Sedes mezcla cortes y Producción puede etiquetar demo como “Observado”. | Saldo al corte independiente del periodo; mismo corte en comparaciones; marcar Demo y separar ejecución de cargo/cobro. |
| P1 | Agente / Ayuda | Agente presenta KPI fijos (24/8/5/3) y selector de fecha sin filtro efectivo; Ayuda no cubre Home ni Agenda. | Retirar cifra como si fuera observada; declarar el agente prototipo y sumar ayuda contextual a las dos rutas centrales. |
| P1 | Responsive / Pacientes | El botón flotante de Ayuda tapa controles/filas en móvil; edición de ficha parece guardarse pero solo cambia el estado local de pantalla. | Reubicar el dock sin ocultar acciones; edición persiste en repositorio demo o declara claramente que es temporal. |

La auditoría de métricas y visualización fue independiente, estática y no cambió archivos. Sus conclusiones se integran como requisitos para la implementación y deben volver a probarse después de corregirlas.

## Historias que sí permiten contar los datos

**Owner, demo actual.** “Se crearon S/ 600 en cargos; se recibieron S/ 460; quedan S/ 140 de saldo vigente. Lince concentra S/ 420 de cargos y S/ 280 de cobros; Magdalena, S/ 180 y S/ 180.” Son valores observados del fixture demo, no pronóstico. El saldo es un snapshot actual, no flujo del periodo.

**Administrativo.** “La próxima cita es Carlos Rivas, sábado 15 a las 09:00 en Lince; Ana ya llegó y tiene S/ 140 por cobrar.” La fila y su próxima acción tienen que abrir la misma cita/cargo.

**Doctor.** “José Molina es la próxima atención; Ana tiene una visita cerrada y Lucía quedó como no-show tras terminar su cita.” No volver a presentar la cita futura como llegada ni inferir causa clínica.

**Inventario.** “Guantes de nitrilo: saldo 180 cajas en Lince; el conteo escrito/voz/Telegram propone una diferencia y espera revisión.” El demo no envía ni recibe Telegram real.

## Contrato de métricas

| Métrica | Fórmula y grano | Fuente hoy | Visual/acción |
|---|---|---|---|
| Cargos creados | Suma de cargos, fecha de creación, agrupada por día/sede. | Demo. API sin agregado global aprobado. | Columnas por día; seleccionar barra abre cargos por ID. |
| Cobros recibidos | Suma de pagos, fecha de pago, por día/sede. | Demo y pagos incluidos en Caja. | Serie de cobros; misma moneda/eje y periodo visible. |
| Saldo vigente | Cargos − pagos asociados, al momento de lectura; no es flujo del periodo. | Derivado de cargos y pagos demo/API de Caja. | Valor actual con etiqueta “vigente”; abre cargos con saldo. |
| Asistencia/no-show | Visita ligada a cita / cita confirmada elegible; no-show solo cuando la hora final ya pasó y no hay visita. | Derivado en demo; API requiere lectura/join suficiente. | Tendencia/cohorte solo con denominador explícito; fila para cada excepción. |
| Conversión de lead | Leads que avanzan de etapa / cohorte de leads elegibles de esa etapa y periodo. | No disponible históricamente en API; eventos solo demo. | Cola de aging y cohortes demo; ocultar porcentaje en API hasta disponer del historial. |
| Capacidad | Minutos reservados / minutos disponibles por sillón/profesional/intervalo. | No disponible sin turnos, duración y disponibilidad completa. | Mapa de ocupación solo cuando el contrato exista. |
| Stock | Saldo por SKU y sede; diferencia = contado − saldo. | Balance/movimientos; mínimos no disponibles. | Tabla de balance + delta; historial por producto. |
| Producción por profesional | Suma de precio ejecutado agrupada por ejecutor y fecha. | Demo enlaza ejecución/visita; API no incluye profesional en ejecución ni filtro suficiente en visitas. | No mostrar en API hasta cerrar join/lectura. Sin comisión inferida. |

## Plan de trabajo · 8 horas efectivas

**09:00–10:00 · Base visual y captura completa**  
Confirmar catálogo de rutas/roles, anchos, fuente de cada dato y estado demo/API. Capturar todas las rutas activas en 1440 y el set crítico en 390. Quitar solo ruido de shell que se repite o contradice.  
**Gate 1:** mapa cubre cada ruta permitida; sin navegación que muestre un rol distinto al actor; inventario de defectos P0/P1/P2; consola sin errores en recorridos base.

**10:00–12:00 · Métricas honestas y Owner**  
Primero alinear periodo, fecha de evento, unidad y denominador en Inicio Admin, Agenda, Pacientes, Caja e Inventario. Después pulir el gráfico dominante del Owner, separar sus excepciones y convertir la matriz por sede en comparación escaneable. Seleccionar cargos abre cargos; seleccionar cobros abre pagos; no mezclar ambos en una tabla diaria ambigua. El texto de insight describe variación, no inventa causa.  
**Gate 2:** cifras reconcilian por definición; filtros realmente controlan cifras y filas; unidades y ventanas visibles; API sin dato muestra `N/D`; cada serie abre su conjunto fuente o no ofrece drill-down.

**12:00–13:00 · Administrativo: jornada y agenda**  
Compactar Inicio alrededor de la siguiente decisión; contadores del mismo rango, sin mezclar agenda, visitas históricas y saldo al corte. Agenda abre día/lista temporal primero y conserva semana como opción; el calendario semanal no debe esconder columnas sin indicar desplazamiento; detalle opaco mantiene calendario y datos consistentes.  
**Gate 3:** jornada y agenda muestran la misma persona, hora local, sede y estado; “sin visita” no implica no-show; ninguna cita futura ofrece llegada; cola no mezcla “hoy” con mañana.

**13:00–14:00 · Pausa**

**14:00–15:00 · Pacientes y Leads**  
Clarificar tabs, búsqueda y contexto de sede; acción por fila; ficha enlaza cita, visita y cargo del mismo snapshot; eventos de Lead solo demo y sin porcentaje de conversión API.  
**Gate 4:** búsqueda/filtros conservan entidad y rol; crear paciente/lead no duplica; estados demo visibles; drill-down abre la persona correcta.

**15:00–16:00 · Caja e Inventario**  
Reemplazar identificadores internos por nombres; jerarquía del saldo; separar pagado en periodo de saldo vigente; mantener un único botón de cobro en Caja con abono parcial/sobrepago/idempotencia. En inventario, quitar sumatoria de unidades incompatibles, elevar saldo por producto+sede y movimiento, tooltip accesible y flujo de conteo revisable.  
**Gate 5:** pagos reconcilian y filtros alteran cifras/filas; Owner no cobra; balance por producto/unidad antes/después coincide con kardex; voz/Telegram no cambian stock antes de confirmar; modo API no muestra el demo.

**16:00–17:00 · Doctor y solicitudes clínicas**  
Completar Mi día con eventos ordenados y fecha local; distinguir visita abierta/cerrada y no-show; Mis pacientes prioriza el próximo hito; Registro permite guardar/ejecutar según permiso demo, sin Caja; Solicitudes no inventa laboratorio real.  
**Gate 6:** próxima cita primero; no-show solo tras la hora final; doctor no ve Caja; el servicio crea un cargo por ejecución; no existe CTA de llegada prematuro.

**17:00–18:00 · Chat, pulido transversal y cierre QA**  
Ayuda contextual acompaña la fila seleccionada; Chat usa el mismo snapshot y no asume acciones reales; validar shell, foco, teclado, movimiento reducido y responsividad. Revisar cada captura con rúbrica, corregir fallos críticos antes de entregar.  
**Gate final:** 3 roles; rutas permitidas; 1440, 1280, 390 y 375 px; cero scroll horizontal; consola limpia; 11/12 mínimo y ningún cero; capturas y flujos Playwright guardados; P0 en cero. Un FAIL mantiene abierto el bloque.

## QA visual y funcional

1. Ejecutar Playwright en Chromium sobre build de producción. Guardar capturas independientes bajo docs/qa/plan-dia-wow/screenshots/; nunca sobreescribir capturas previas.
2. Probar cada pantalla permitida por rol y al menos un recorrido cruzado: Administrativo Inicio→Agenda→Paciente→Caja; Owner Inicio→Sedes/Finanzas→origen; Doctor Mi día→Registro→Solicitud; Inventario texto/voz/Telegram demo→revisión→confirmación.
3. Repetir pantallas maestras en 1440, 1280, 390 y 375 px. Revisar recorte de texto y acciones, foco visible, labels accesibles y movimiento reducido.
4. Validar dato: cargos por fecha de creación, pagos por fecha de pago, saldo vigente, unidad de inventario, sede y zona horaria America/Lima; estados futuros nunca se llaman no-show.
5. Entregar captura inicial/final, matriz de defectos con severidad, prueba ejecutada y resultado por gate. No declarar terminado con botón inerte, cifra sin definición o demo presentada como real.

### Rúbrica de aceptación por vista

Puntuar cada criterio `0` falla, `1` parcial o `2` pasa (máximo 12). Para abrir el siguiente sprint: **mínimo 11/12, ningún cero y cero P0**.

1. En cinco segundos se entiende qué resolver.
2. Jerarquía y visual dominante sirven al rol: Owner analítico, operación en cola/agenda, Doctor en secuencia clínica.
3. Periodo, unidad, sede y alcance de cada cifra están claros.
4. Demo, derivado, observado y no disponible no se confunden.
5. Gráficos tienen alternativa accesible y drill-down correcto.
6. Paciente, cita, estado y saldo coinciden entre vistas.
7. El texto nombra el trabajo, no detalles de implementación.
8. Estados lleno, vacío, carga y error tienen diseño coherente.
9. No hay recortes ni solapamientos a 1440, 1280, 390 y 375 px, incluido el dock de Ayuda.
10. Teclado, foco, diálogos y controles semánticos funcionan.
11. Movimiento reducido se respeta; no hay fluorescencia ni animación ornamental.
12. Cada acción funciona en demo o se declara no disponible.

### Resultado de auditoría ejecutada

- Suite principal: **17/17 PASS**, incluyendo flujos por los tres roles; build de producción y TypeScript incluidos en la suite.
- Matriz: **23 rutas/roles** capturadas a 1440 px y repetidas a 390 y 375 px (**69 capturas**), incluyendo Atención, Agente y el fallback de voz; **0 fallos de ruta, 0 errores de página, 0 desbordes horizontales**.
- Evidencia visual: `docs/qa/auditoria-2026-09-28/view-matrix/`; resumen mecánico: `report.json` dentro de esa carpeta. La captura de voz verifica el fallback a Agenda cuando la voz está desactivada; no prueba micrófono ni transcripción real.
- Cobertura honesta: la matriz confirma render, encabezado, navegación y geometría; por sí sola no demuestra que cada control de cada ruta sea funcional ni sustituye la revisión visual humana. La suite 17/17 cubre recorridos seleccionados, no toda combinación de permiso/estado.
- Hallazgos que siguen abiertos: Inicio Administrativo necesita mejor uso del espacio; Mi día repite al paciente destacado y pone la cita de 14:00 antes de la atención cerrada de 10:30; Agenda semanal se siente vacía con pocos eventos; Caja conserva identificadores internos; y el gráfico del Owner necesita drill-down correcto y una lectura descriptiva, no causalidad inventada.
- Corrección hecha después de la revisión: se retiró en Inventario la suma inválida de cantidades con unidades incompatibles; ahora se conserva el saldo por producto/unidad/sede. Regresión posterior: typecheck, **117 tests unitarios** y **17/17 visuales** en PASS.
- La revisión independiente de UX/UI y métricas amplía los riesgos: alcance desigual del saldo al filtrar Owner; Sedes mezcla cortes; Producción muestra Demo como “Observado”; conteo Leads no coincide con su pestaña; edición de paciente no persiste; Ayuda tapa acciones en móvil. Son gates de producto, no un motivo para adornar más la UI.

## Trabajo posterior a este día

- Cerrar con backend el contrato de agregados por sede/periodo, visitas por profesional y producción por ejecutor antes de dibujar analítica API.
- Identidad humana, autorización real y aislamiento de datos por sede/profesional.
- Conexión real de Telegram/voz detrás de servidor, allowlist, trazabilidad e idempotencia; hasta entonces solo borrador demo.
- Avanzar vistas secundarias (Sedes, Comercial, Producción, Finanzas, Mis pacientes, Solicitudes, Administración futura, Registro) con los mismos gates, sin inflar el primer viewport.

## Criterio de éxito del día

El frontend se siente deliberado y clínico, no genérico: al entrar, cada rol reconoce qué importa; el Owner interpreta un resultado y su driver; Administrativo sabe qué cita sigue y qué puede resolver; Doctor ve su siguiente atención y sus pendientes reales. Las cifras coinciden entre vistas, los gráficos tienen una pregunta y las acciones abren el registro correcto. Todo lo no conectado conserva una etiqueta honesta.
