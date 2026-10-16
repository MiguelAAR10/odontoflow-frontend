/** Translate stable backend codes/reasons; never inspect the English message. */
export function errorCopy(code: string, details: Record<string, unknown>, fallback: string): string {
  const reasons: Record<string, string> = {
    count_matches_balance: "El conteo coincide con el saldo registrado; no hay diferencia que proponer.",
    unit_mismatch: "La unidad no coincide con el catálogo. Vuelve a consultar el producto.",
    due_in_past: "El plazo ya pasó. Elige una fecha y hora futuras.",
    patient_mismatch: "El paciente no coincide con el vinculado a esta cita. Vuelve a abrir la cita.",
    appointment_other_location: "La cita pertenece a otra sede. Vuelve a abrirla en su sede.",
    assignee_not_human: "El responsable debe ser una persona activa del equipo.",
  };
  const codes: Record<string, string> = {
    INVENTORY_LEDGER_STALE: "El inventario cambió desde la consulta. Vuelve a consultar el saldo antes de reportar.",
    INVENTORY_COUNT_PENDING: "Ya existe otro conteo abierto para este producto y sede. Consulta su tarjeta.",
    CONVERSATION_NOT_CLAIMED: "Para responder, primero debes tomar esta conversación.",
    TASK_NOT_OPEN: "La tarea ya no está activa. Actualiza la lista para consultar su estado.",
  };
  return (code === "INVALID_INPUT" ? reasons[String(details.reason ?? "")] : codes[code]) ?? fallback;
}
