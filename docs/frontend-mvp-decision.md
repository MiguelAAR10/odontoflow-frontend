# Frontend MVP Decision

> Alcance historico de cinco rutas para el MVP y la demo. La propuesta de frontend completo en [`2026-09-27-plan-frontend-miguel.md`](2026-09-27-plan-frontend-miguel.md) solo sustituye este catalogo cuando Miguel y Alejandro aprueben expresamente su autoridad. Hasta entonces, esta decision sigue vigente.

## Decision

El MVP del frontend no es mostrar toda la visión futura de OdontoFlow. El MVP es permitir operar una sede
con cuatro objetos de trabajo:

1. cita
2. paciente o lead
3. cobro
4. stock

La interfaz se diseña desde el trabajo real del día. La regla madre es:

> La fila manda.

Esto significa que cada pantalla debe partir de filas accionables y no de KPIs decorativos. Cada fila debe
contestar:

- qué es
- dónde ocurre
- en qué estado está
- qué falta
- cuál es la siguiente acción
- si esa acción es real hoy, derivada, vacía u oculta

## Scope

### Roles de producto

| Rol | Alcance | Qué necesita primero |
|---|---|---|
| Owner | Tres sedes | Excepciones reales del negocio |
| Administrativo | Una sede | Cola del día y siguiente acción |
| Colaborador | Mi agenda clínica | Próximo paciente y horario |

No se separan todavía recepción, doctor, especialista, finanzas, inventario ni superadmin como roles de
producto. Recepción es el Administrativo de sede. Doctor y especialista comparten Mi día. Finanzas e
inventario son permisos sobre Caja e Inventario. Superadmin es interno y queda fuera hasta que exista auth.

### Superficies

Las rutas iniciales son:

| Ruta | Superficie | Uso |
|---|---|---|
| `/` | Inicio por rol | Home adaptable según rol |
| `/agenda` | Agenda | Citas y gestión del calendario |
| `/pacientes` | Pacientes | Leads y pacientes, separados visualmente |
| `/caja` | Caja | Cargos, pagos y pendientes |
| `/inventario` | Inventario | Productos, stock y movimientos |

Cinco superficies no significa cinco ítems para todos los roles:

| Rol | Navegación visible |
|---|---|
| Owner | Inicio, Caja, Inventario |
| Administrativo | Inicio, Agenda, Pacientes, Caja, Inventario |
| Colaborador | Inicio / Mi día |

## What Not To Route Yet

Estas ideas no son rutas del MVP:

- Confirmaciones
- Sedes
- Comercial
- Producción
- Finanzas
- Laboratorios
- Solicitudes
- Administración de usuarios
- NubeFact
- Copiloto

Si aparecen, deben vivir como estado, sección o placeholder dentro de una superficie existente, o quedar
documentadas como futuro.

## Visual Direction

Se mantiene el contrato visual actual:

- shell oscuro de marca
- canvas blanco
- tablas planas
- superficies operativas legibles
- cyan como marca y acción primaria, no como estado
- magenta solo como acento de identidad, no como error

No se explora una dirección tipo Linear/Notion/Arc para el MVP. Puede verse premium, pero no debe esconder
cita, saldo, stock o siguiente acción dentro de cards decorativas.

La dirección aceptada es:

> Clínica premium operativa con mentalidad de centro de control.

## Design Order

Figma debe avanzar en este orden:

1. Inicio Administrativo / Cola del día.
2. Agenda de sede.
3. Pacientes, separando lead y paciente.
4. Caja.
5. Inventario.
6. Inicio Owner.
7. Mi día Colaborador.

No diseñar antes:

- confirmaciones como módulo independiente
- embudo comercial
- laboratorios
- comprobantes/NubeFact
- usuarios/permisos
- copiloto
- porcentajes de asistencia o conversión sin definición de dato

## Data Honesty

Cada bloque del frontend debe clasificarse como:

| Estado | Significado |
|---|---|
| Real | Viene de backend o adapter existente y representa dominio actual |
| Derivado | Se calcula desde datos reales sin inventar estado |
| Vacío | La UI existe, pero no hay dato para mostrar |
| Oculto | No se muestra porque induciría a una acción falsa |
| Futuro | Requiere contrato/backend nuevo |

La UI puede mostrar placeholders de futuro solo si están rotulados como tal. No se debe presentar un número
como operativo si el dato no existe.

## Forbidden MVP Assumptions

No diseñar:

- tasa de asistencia si no hay definición basada en `Visit` o estado equivalente
- conversión lead -> paciente si no hay promoción real entre entidades
- ventas por sede si el cargo no proyecta sede o no se puede derivar de una ejecución real
- acciones "Llegó" o "Cobrar" como mutaciones reales de fila si no pasan por el flujo cita -> paciente ->
  visita -> ejecución -> cargo -> pago
- autorización basada en el rol demo

El rol demo solo cambia navegación, copy y prioridad visual. No es autenticación ni autorización.

## MVP Screen Rules

### Administrativo

La pantalla principal debe ser una cola operativa de sede. Debe priorizar:

- próxima cita
- pacientes del día
- estado de confirmación visible solo si existe dato
- pendientes de cobro reales o explícitamente derivados
- acciones de agenda existentes
- bloqueos cuando una acción necesite backend

### Agenda

La agenda debe ser plana y escaneable. La siguiente acción pertenece a la fila/cita, no a un hero genérico.

### Pacientes

Lead y paciente deben distinguirse visualmente. No se debe convertir todo a "Activo" si el origen real es lead.

### Caja

Caja muestra cargos, pagos y pendientes. Si el flujo de crear cargo requiere Visit/Execution, no se dibuja como
botón directo desde una cita sin aclarar el paso intermedio.

### Inventario

Inventario muestra stock y movimientos. El owner y el admin pueden compartir superficie con distinto alcance.

### Owner

El owner no empieza con una tira de KPIs inventados. Empieza con excepciones reales:

- por cobrar
- stock en cero o bajo
- citas canceladas si existen
- huecos de agenda si se pueden derivar
- productos críticos

Todo porcentaje queda fuera hasta que el dato esté definido.

### Colaborador

El colaborador ve Mi día:

- horario
- próximo paciente
- información mínima de atención

No hereda Caja ni Inventario por ser "pantallas base".

## Next Step

Crear en Figma la primera exploración de `Inicio Administrativo / Cola del día` siguiendo esta decisión.
