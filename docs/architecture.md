# Arquitectura del simulador

## Alcance y seguridad

Esta aplicación es un entorno cerrado de demostración. Los adaptadores incluidos no hacen tráfico de red y los seeds contienen identidades inventadas y números reservados para ficción. No hay secretos ni credenciales de terceros.

## Capas

1. **Dominio**: citas, estados, intentos y reglas; no conoce proveedores externos.
2. **Puertos**: contratos `CalendarService`, `WhatsAppService`, `CallService` y `Clock`.
3. **Adaptadores simulados**: implementaciones deterministas en memoria para desarrollo y pruebas.
4. **Persistencia**: esquema PostgreSQL. Un adaptador PostgreSQL futuro puede implementar los mismos puertos sin cambiar las reglas de dominio.

## Modelo

- `patients`, `branches`, `doctors`: catálogos ficticios.
- `simulation_sessions`: ejecución aislada, zona horaria y reloj virtual.
- `simulated_calendar_events`: agenda interna; su ID no representa un ID de Google.
- `appointments`: cita con estados de cita y seguimiento independientes.
- `reminder_rules`: momentos y canales configurables.
- `contact_attempts`: cada acción simulada y su resultado.
- `whatsapp_events`: mensajes y respuestas simuladas con deduplicación.
- `simulated_whatsapp_messages`: bandeja consultable de mensajes ficticios y sus respuestas.
- `simulated_call_attempts`: intentos de llamada y resultados modificables manualmente.
- `simulated_inbound_events`: eventos internos equivalentes a webhooks, deduplicados por sesión.
- `simulated_reception_tasks`: tareas internas creadas cuando un paciente ficticio solicita reprogramar.
- `appointment_status_history`: auditoría de cambios de ambos estados.

## Decisiones

- Todos los instantes son `timestamptz`; `America/Lima` se guarda en la sesión para interpretación y presentación.
- `appointments.calendar_event_id` referencia exclusivamente `simulated_calendar_events` y exige que ambos pertenezcan a la misma sesión mediante una clave foránea compuesta.
- Un índice único parcial evita duplicar el mismo tipo de intento por cita. La `idempotency_key` permite reintentos seguros.
- Los eventos de WhatsApp usan `(simulation_session_id, simulated_external_event_id)` como clave de deduplicación.
- El scheduler usa `(simulation_session_id, appointment_id, attempt_type)` para no duplicar mensajes o llamadas.
- Los triggers escriben el historial inicial y cada cambio de estado, incluso si el cambio proviene de SQL directo.
- El borrado de una sesión elimina en cascada todos sus datos operativos. Los catálogos ficticios pueden recrearse con el seed.

## Reloj virtual

`SimulationClock` conserva un instante controlado. `set()` fija una fecha y `advanceBy()` avanza una duración. Las reglas futuras deben recibir el puerto `Clock`; no deben consultar `Date.now()` directamente. En PostgreSQL, `simulation_sessions.simulated_now` representa el mismo concepto persistido.

## Motor end-to-end

`FollowupEngine` es la única fuente de elegibilidad, horarios, seguimiento, cierre y métricas. `ReminderScheduler` consulta ese motor antes de cada contacto y vuelve a leer el estado actual de la cita. Los adaptadores simulados ejecutan y registran acciones, pero no deciden reglas.

## Suposiciones

- Cada cita tiene una sede y un doctor.
- Una cita activa tiene exactamente un evento de calendario simulado.
- Los números `+1-202-555-01xx` son marcadores ficticios, nunca destinos reales.
- Esta tarea entrega servicios de aplicación, no una API HTTP ni un scheduler completo.
