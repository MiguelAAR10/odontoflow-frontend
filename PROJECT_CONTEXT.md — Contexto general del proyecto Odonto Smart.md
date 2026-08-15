# PROJECT_CONTEXT.md — Contexto general del proyecto Odonto Smart

## 1. Propósito de este documento

Este archivo define el contexto permanente del proyecto que nuestro equipo está trabajando para **Odonto Smart**.

Su objetivo es que cualquier agente de IA, especialmente Codex, pueda entender:

- Qué negocio estamos analizando.
- Qué problemas queremos resolver.
- Qué dolores tienen prioridad.
- Qué información necesitamos descubrir.
- Qué debe evaluar cuando revise documentación del proyecto.
- Qué cosas todavía NO deben asumirse como solución.

Este documento describe principalmente **el problema y el contexto del negocio**, no una arquitectura tecnológica definitiva.

---

# 2. Cliente / caso de estudio

El proyecto se desarrolla alrededor de **Odonto Smart**, una clínica odontológica con **tres sedes en Lima**:

- Lince.
- Jesús María.
- Magdalena.

El negocio atiende pacientes mediante diferentes tratamientos odontológicos y coordina diariamente:

- Pacientes.
- Leads o potenciales pacientes.
- Recepción / secretaría.
- Odontólogos.
- Especialistas.
- Administración.
- Pagos.
- Inventario.
- Proveedores.
- Laboratorios dentales.
- Diferentes sedes.

Actualmente existen diversos procesos que dependen considerablemente de:

- WhatsApp.
- Comunicación manual.
- Seguimiento humano.
- Excel.
- Memoria del personal.
- Coordinación entre personas.
- Registro manual de información.

Nuestro trabajo consiste en **entender estos procesos, identificar pérdidas, errores, tareas repetitivas y oportunidades de mejora**.

---

# 3. Problema central

Odonto Smart tiene procesos comerciales, administrativos y operativos que dependen demasiado de intervención manual.

Esto puede provocar:

- Leads que nunca se convierten en pacientes.
- Pacientes que dejan de responder.
- Citas olvidadas.
- Cancelaciones tardías.
- No-shows.
- Horarios médicos desaprovechados.
- Falta de seguimiento.
- Información dispersa.
- Errores de registro.
- Trabajo administrativo repetitivo.
- Problemas de coordinación.
- Falta de visibilidad entre sedes.
- Pérdidas de oportunidades comerciales.
- Dificultad para tomar decisiones con datos.

El objetivo del proyecto es identificar **cómo reducir estas ineficiencias y pérdidas en toda la operación de la clínica**.

---

# 4. Dolores principales que debemos resolver

## 4.1 Captación de nuevos pacientes

Cuando un potencial paciente consulta por:

- WhatsApp.
- Redes sociales.
- Página web.
- Publicidad.
- Recomendación.
- Otros canales.

existe riesgo de que la oportunidad se pierda por falta de respuesta rápida o seguimiento.

### Dolor

Un lead interesado puede consultar precios o tratamientos y luego dejar de responder.

Actualmente el resultado puede depender demasiado de que una persona recuerde volver a contactarlo.

### Consecuencia

- Leads perdidos.
- Menor conversión.
- Dinero invertido en marketing desperdiciado.
- Menos citas.
- Menos tratamientos vendidos.

---

# 4.2 Seguimiento de leads

No todos los interesados agendan inmediatamente.

Algunos:

- Preguntan precios.
- Consultan tratamientos.
- Comparan clínicas.
- Dicen que responderán después.
- Dejan la conversación abierta.

El seguimiento debe evitar que estas oportunidades simplemente desaparezcan.

Este es uno de los problemas prioritarios identificados en el proyecto.

---

# 4.3 Confirmación y recordatorio de citas

Existen pacientes que:

- Olvidan sus citas.
- Llegan tarde.
- Cancelan el mismo día.
- No asisten.

### Consecuencia

Una hora reservada que no se utiliza representa capacidad médica desperdiciada y potencial pérdida económica.

Los recordatorios y confirmaciones de citas forman parte de los problemas prioritarios identificados.

---

# 4.4 Recuperación de cancelaciones y espacios vacíos

Cuando un paciente cancela, aparece un espacio disponible en la agenda.

El problema no termina en registrar la cancelación.

La clínica debería poder identificar si existe:

- Otro paciente interesado.
- Un paciente esperando cita.
- Un tratamiento pendiente.
- Un lead que podría atenderse.
- Alguien que solicitó una fecha más cercana.

### Dolor

Actualmente recuperar ese horario puede requerir búsqueda y contacto manual.

Los espacios que no se recuperan representan ingresos potenciales perdidos.

---

# 4.5 Coordinación de agenda de doctores y especialistas

Odonto Smart trabaja con odontólogos y especialistas que pueden tener:

- Horarios determinados.
- Días específicos.
- Diferentes sedes.
- Diferentes pacientes.
- Cambios de último momento.

### Dolor

Recepción debe mantener correctamente informados a los profesionales.

Cambios de agenda pueden provocar:

- Confusión.
- Falta de información.
- Descoordinación.
- Tiempo perdido.
- Errores en citas.

La actualización de agenda de doctores es uno de los procesos que debemos estudiar.

---

# 4.6 Recuperación de pacientes que no asistieron

Un paciente que falta a una cita no debería simplemente desaparecer del proceso.

Debemos analizar:

- Qué ocurre después de un no-show.
- Quién hace seguimiento.
- Cuándo se realiza.
- Cuántos pacientes se recuperan.
- Cuántos terminan abandonando.

El seguimiento de pacientes ausentes está identificado como un problema específico del negocio.

---

# 4.7 Fidelización y reactivación de pacientes

La clínica ya posee pacientes históricos.

Dentro de esa base pueden existir personas que necesitan:

- Controles.
- Limpiezas.
- Continuar tratamientos.
- Retomar tratamientos interrumpidos.
- Nuevos procedimientos.
- Revisiones periódicas.

### Dolor

Si nadie analiza o utiliza esta información, estas oportunidades comerciales permanecen dormidas.

La reactivación de pacientes existentes es una prioridad del proyecto.

---

# 4.8 Registro de atención y pagos

Parte de la operación puede requerir ingresar manualmente información como:

- Paciente.
- Tratamiento.
- Profesional.
- Precio.
- Pago.
- Método de pago.

### Dolor

Cuanto mayor sea el registro manual:

- Mayor carga administrativa.
- Mayor posibilidad de errores.
- Mayor posibilidad de información incompleta.
- Más tiempo dedicado a tareas repetitivas.

La reducción del registro manual es otro problema identificado.

---

# 4.9 Cierre de caja y conciliación

La clínica recibe pagos mediante diferentes medios:

- Efectivo.
- Yape.
- Plin.
- Transferencias.
- Otros medios.

Secretaría o administración debe posteriormente verificar que los registros coincidan con los pagos recibidos.

### Dolor

El cierre de caja puede requerir:

- Revisiones manuales.
- Comparación de registros.
- Cálculos.
- Correcciones.

Esto aumenta tiempo administrativo y riesgo de errores.

---

# 4.10 Inventario entre las tres sedes

La clínica necesita controlar materiales e insumos utilizados diariamente.

Debemos entender procesos como:

- Entrada de productos.
- Consumo.
- Stock disponible.
- Stock mínimo.
- Reposición.
- Compras.
- Traslado entre sedes.
- Préstamos entre clínicas.
- Proveedores.

### Dolor

Sin suficiente trazabilidad pueden producirse:

- Faltantes.
- Compras urgentes.
- Sobrecompra.
- Material vencido.
- Stock incorrecto.
- Préstamos no registrados.
- Diferencias entre inventario real y registrado.

El control de inventario entre sedes está identificado como problema prioritario.

---

# 4.11 Falta de visión consolidada del negocio

La administración necesita saber qué está ocurriendo en cada sede.

Información relevante:

- Pacientes.
- Citas.
- Cancelaciones.
- No-shows.
- Ventas.
- Producción.
- Pagos.
- Deudas.
- Tratamientos.
- Inventario.
- Rendimiento.
- Resultados comerciales.

### Dolor

Si estos datos están distribuidos entre diferentes archivos, conversaciones y personas, obtener una visión real del negocio requiere mucho trabajo.

La consolidación de información y auditoría de resultados es uno de los problemas identificados.

---

# 4.12 Decisiones comerciales poco apoyadas en datos

La clínica genera información histórica constantemente.

Sin embargo, necesitamos determinar cuánto de esa información realmente se utiliza para responder preguntas como:

- ¿Qué pacientes tienen tratamientos pendientes?
- ¿Qué pacientes probablemente regresarán?
- ¿Qué tratamientos venden más?
- ¿Qué campañas generan pacientes?
- ¿Qué especialistas tienen mayor ocupación?
- ¿Qué sedes tienen mayor demanda?
- ¿Dónde ocurren más cancelaciones?
- ¿Cuánto dinero se pierde por no-shows?
- ¿Cuántas citas canceladas logran recuperarse?
- ¿Qué pacientes podrían comprar nuevos tratamientos?

La explotación de información histórica para mejorar resultados comerciales es otro objetivo identificado.

---

# 5. Las cuatro áreas principales del problema

Para organizar el análisis del negocio, los problemas pueden agruparse en cuatro grandes dominios.

## A. Comercial

Desde que una persona demuestra interés hasta que se convierte en paciente.

Incluye:

- Captación.
- Atención inicial.
- Leads.
- Seguimiento.
- Conversión.
- Promociones.
- Referidos.
- Reactivación.
- Fidelización.

---

## B. Pacientes y agenda

Desde que una persona agenda hasta que recibe atención.

Incluye:

- Citas.
- Confirmaciones.
- Recordatorios.
- Cancelaciones.
- Reprogramaciones.
- No-shows.
- Recuperación de horarios.
- Agenda de doctores.
- Agenda por sede.
- Seguimiento posterior.

---

## C. Operaciones y administración

Procesos necesarios para que las clínicas funcionen correctamente.

Incluye:

- Caja.
- Pagos.
- Registro de atención.
- Inventario.
- Compras.
- Proveedores.
- Traslados entre sedes.
- Laboratorios dentales.
- Coordinación interna.
- Tareas administrativas.

---

## D. Gestión y control

Información que necesita la dirección para tomar decisiones.

Incluye:

- Reportes.
- Indicadores.
- Ventas.
- Producción.
- Rentabilidad.
- Ocupación.
- Cancelaciones.
- Conversión comercial.
- Inventario.
- Deudas.
- Rendimiento por sede.
- Rendimiento por profesional.
- Oportunidades comerciales.

---

# 6. Qué queremos descubrir antes de diseñar una solución

Antes de proponer tecnología, debemos entender cómo funciona realmente la clínica.

Para cada proceso necesitamos conocer:

1. Qué inicia el proceso.
2. Quién participa.
3. Qué pasos realizan.
4. Qué herramientas utilizan.
5. Qué información necesitan.
6. Qué información generan.
7. Dónde se guarda.
8. Qué decisiones se toman.
9. Qué excepciones existen.
10. Qué errores ocurren.
11. Qué tareas se repiten.
12. Qué tareas consumen más tiempo.
13. Qué depende de memoria humana.
14. Qué depende de WhatsApp.
15. Qué depende de Excel.
16. Qué información se copia de un lugar a otro.
17. Qué procesos no tienen responsable claro.
18. Qué procesos no tienen métricas.
19. Qué situaciones generan pérdida de dinero.
20. Qué situaciones generan mala experiencia al paciente.

---

# 7. Qué NO debe asumir Codex

Codex NO debe asumir automáticamente que:

- Tenemos que desarrollar un software desde cero.
- Necesitamos crear un ERP.
- Necesitamos crear un CRM.
- Necesitamos reemplazar todos los sistemas existentes.
- Todo debe resolverse con inteligencia artificial.
- Todo debe automatizarse.
- WhatsApp debe ser necesariamente la interfaz principal.
- Cada problema necesita un agente de IA.
- Una solución tecnológica compleja es mejor que una simple.
- Todos los procesos actuales están mal.
- Todos los problemas identificados tienen la misma prioridad.

Primero debemos comprender el negocio.

Después podremos decidir qué combinación de:

- Software existente.
- Integraciones.
- Automatización.
- Procesos.
- Cambios organizativos.
- Analítica.
- Inteligencia artificial.
- Desarrollo personalizado.

tiene sentido.

---

# 8. Prioridad conceptual

Al evaluar problemas debemos pensar principalmente en su impacto sobre:

### Ingresos

¿Estamos perdiendo ventas, tratamientos, pacientes o citas?

### Costos

¿Estamos utilizando personas para tareas repetitivas que podrían hacerse de una forma más eficiente?

### Tiempo

¿Existen actividades administrativas que consumen demasiado tiempo?

### Errores

¿Existen procesos manuales que producen errores frecuentes?

### Experiencia del paciente

¿El paciente espera demasiado, recibe información tarde o tiene dificultades para comunicarse con la clínica?

### Control

¿La dirección puede saber realmente qué ocurre en las tres sedes?

### Escalabilidad

¿Los procesos actuales seguirían funcionando si la clínica tuviera más pacientes, trabajadores o sedes?

---

# 9. Definición de éxito del proyecto

El proyecto será exitoso si conseguimos identificar y posteriormente reducir:

- Leads perdidos.
- Tiempo de respuesta.
- No-shows.
- Cancelaciones no recuperadas.
- Horarios médicos vacíos.
- Pacientes abandonados.
- Tratamientos pendientes sin seguimiento.
- Trabajo administrativo repetitivo.
- Errores de registro.
- Errores de caja.
- Problemas de inventario.
- Descoordinación entre sedes.
- Falta de información gerencial.

Y aumentar:

- Conversión de leads.
- Citas efectivamente atendidas.
- Recuperación de cancelaciones.
- Reactivación de pacientes.
- Ocupación de especialistas.
- Productividad administrativa.
- Control de inventario.
- Visibilidad del negocio.
- Uso de datos para tomar decisiones.
- Ingresos recuperados o generados.

---

# 10. Instrucciones para Codex al revisar nuestro Notion

Cuando se solicite auditar nuestro Notion, utiliza ESTE documento como contexto principal.

No debes limitarte a revisar redacción o estructura.

Debes analizar si nuestro equipo está entendiendo correctamente el negocio.

Para cada sección del Notion evalúa:

### 1. Relevancia

¿Esta información realmente ayuda a entender o resolver alguno de los problemas descritos en este documento?

### 2. Cobertura

¿Hay algún proceso importante de la clínica que todavía no estamos investigando?

### 3. Profundidad

¿Estamos documentando solamente el problema superficial o estamos investigando su causa?

### 4. Evidencia

¿Estamos diferenciando correctamente entre:

- Lo que sabemos.
- Lo que nos dijo el cliente.
- Lo que observamos.
- Lo que suponemos.
- Lo que todavía debemos validar?

### 5. Priorización

¿Estamos priorizando problemas por impacto o simplemente acumulando ideas?

### 6. Procesos

¿Los procesos importantes están documentados de principio a fin?

### 7. Responsables

¿Sabemos quién ejecuta cada proceso actualmente?

### 8. Datos

¿Sabemos qué información entra, dónde se guarda y qué información sale?

### 9. Excepciones

¿Estamos contemplando situaciones fuera del flujo normal?

Ejemplo:

Paciente agenda → cancela → quiere reagendar → especialista solamente viene ciertos días → horario completo.

### 10. Métricas

¿Podemos medir el problema antes y después de intervenir?

---

# 11. Formato esperado de una auditoría de Codex

Cuando Codex revise el Notion, debe devolver como mínimo:

## A. Lo que está bien documentado

Explicar qué partes tienen suficiente información y por qué.

## B. Información faltante

Identificar procesos, datos o preguntas que todavía necesitamos investigar.

## C. Suposiciones no validadas

Señalar cualquier afirmación que nuestro equipo esté tratando como cierta sin evidencia suficiente.

## D. Contradicciones

Detectar información que no sea consistente entre diferentes partes del Notion.

## E. Problemas mal definidos

Indicar cuando estamos describiendo una solución en lugar del problema real.

## F. Procesos incompletos

Detectar flujos donde falten actores, pasos, excepciones o decisiones.

## G. Prioridades

Determinar cuáles dolores parecen:

- Críticos.
- Importantes.
- Secundarios.
- Todavía no demostrados.

## H. Preguntas pendientes para el cliente

Crear una lista concreta de preguntas que debemos hacer a Odonto Smart.

## I. Recomendaciones para mejorar el Notion

Indicar exactamente:

- Qué página crear.
- Qué sección agregar.
- Qué información mover.
- Qué información eliminar.
- Qué información validar.
- Qué proceso documentar mejor.

---

# 12. Regla fundamental del proyecto

> **No diseñar la solución antes de entender completamente el problema.**

Nuestro objetivo inicial no es demostrar que podemos construir una tecnología determinada.

Nuestro objetivo es entender **dónde Odonto Smart pierde tiempo, dinero, pacientes, información y control**, identificar las causas y priorizar qué problemas generan mayor impacto.

Solo después de tener suficiente evidencia debemos evaluar las soluciones posibles.

---

# 13. Resumen del caso

Odonto Smart opera tres clínicas odontológicas y actualmente diferentes partes del negocio dependen de procesos manuales, WhatsApp, Excel, seguimiento humano y coordinación entre personas.

Nuestro equipo quiere analizar el recorrido completo:

**Lead → paciente → cita → atención → pago → seguimiento → fidelización**

y paralelamente:

**Operación → doctores → sedes → inventario → proveedores → administración → datos → dirección**

El proyecto busca identificar todos los puntos donde exista:

**pérdida de dinero + pérdida de tiempo + pérdida de pacientes + errores + falta de control**

y convertirlos en problemas claramente definidos, medibles y priorizados antes de diseñar cualquier solución.