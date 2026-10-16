import { describe, expect, it } from "vitest";
import { ApiError, toApiError } from "../src/contracts/client";

describe("agentic backend error copy", () => {
  it.each([
    ["count_matches_balance", "El conteo coincide"], ["unit_mismatch", "La unidad no coincide"],
    ["due_in_past", "El plazo ya pasó"], ["patient_mismatch", "El paciente no coincide"],
    ["appointment_other_location", "La cita pertenece a otra sede"], ["assignee_not_human", "El responsable debe ser una persona"],
  ])("translates INVALID_INPUT reason %s without parsing its message", (reason, expected) => {
    const error = toApiError(new ApiError(422, "INVALID_INPUT", "English backend message", { reason }));
    expect(error.message).toContain(expected);
    expect(error).toMatchObject({ code: "INVALID_INPUT", httpStatus: 422, details: { reason } });
  });
  it.each([
    ["CONVERSATION_NOT_CLAIMED", "primero debes tomar"], ["TASK_NOT_OPEN", "ya no está activa"],
    ["INVENTORY_LEDGER_STALE", "inventario cambió"], ["INVENTORY_COUNT_PENDING", "otro conteo abierto"],
  ])("translates %s while retaining retry metadata", (code, expected) => {
    const error = toApiError(new ApiError(409, code!, "English backend message", { proposal_id: 91 }));
    expect(error.message).toContain(expected);
    expect(error).toMatchObject({ code, httpStatus: 409, details: { proposal_id: 91 } });
  });
  it("preserves a message for an unknown reason", () => {
    const error = new ApiError(422, "INVALID_INPUT", "Validación específica", { reason: "other" });
    expect(toApiError(error)).toBe(error);
  });
});
