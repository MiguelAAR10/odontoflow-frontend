import { describe, expect, it } from "vitest";
import {
  HOME_COMPONENT_KEYS,
  HOME_COMPONENT_REGISTRY,
  safeHomeStage,
  validateHomeStage,
} from "../src/home/registry";

const patient = { id: "7", name: "Ana Torres", dni: "74859632", phone: "+51 987 654 321" };

describe("Home typed component registry", () => {
  it("registers only the three FE01 component keys", () => {
    expect(HOME_COMPONENT_KEYS).toEqual(["PatientSearch", "AgentOutcome", "AgentFallback"]);
    expect(Object.keys(HOME_COMPONENT_REGISTRY)).toEqual(["PatientSearch", "AgentOutcome", "AgentFallback"]);
    expect(HOME_COMPONENT_REGISTRY).not.toHaveProperty("PatientForm");
    expect(HOME_COMPONENT_REGISTRY).not.toHaveProperty("AppointmentOptions");
    expect(HOME_COMPONENT_REGISTRY).not.toHaveProperty("PaymentReview");
    expect(HOME_COMPONENT_REGISTRY).not.toHaveProperty("ConfirmationApproval");
  });

  it("accepts each known component and its matching payload", () => {
    expect(validateHomeStage({ component: "PatientSearch", payload: { query: "Ana" } }).ok).toBe(true);
    expect(validateHomeStage({
      component: "AgentOutcome",
      payload: { outcome: "confirmado", patient, module: "pacientes", message: "Paciente identificado." },
    }).ok).toBe(true);
    expect(validateHomeStage({
      component: "AgentFallback",
      payload: { reason: "unavailable", message: "AIRI no está disponible.", retryable: false },
    }).ok).toBe(true);
  });

  it("rejects unknown keys, mismatched payloads, and malformed canonical data", () => {
    expect(safeHomeStage({ component: "PatientForm", payload: {} }).component).toBe("AgentFallback");
    expect(safeHomeStage({ component: "PatientSearch", payload: { outcome: "confirmado" } }).component).toBe("AgentFallback");
    expect(safeHomeStage({
      component: "AgentOutcome",
      payload: { outcome: "confirmado", patient: { ...patient, id: "" }, module: "pacientes", message: "ok" },
    }).component).toBe("AgentFallback");
    expect(safeHomeStage({
      component: "AgentOutcome",
      payload: { outcome: "confirmado", patient, module: "agenda", message: "ok" },
    }).component).toBe("AgentFallback");
  });

  it("returns a visible invalid fallback instead of throwing", () => {
    const stage = safeHomeStage(null);
    expect(stage).toEqual({
      component: "AgentFallback",
      payload: {
        reason: "invalid",
        message: "La vista recibida no tiene la forma permitida.",
        retryable: false,
      },
    });
  });
});
