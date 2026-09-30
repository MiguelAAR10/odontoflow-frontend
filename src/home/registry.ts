import type { HomePatient } from "./types";

export const HOME_COMPONENT_KEYS = ["PatientSearch", "AgentOutcome", "AgentFallback"] as const;
export type HomeComponentKey = (typeof HOME_COMPONENT_KEYS)[number];

export type HomeOutcome = "confirmado" | "sin_resultados" | "no_disponible" | "error";
export type HomeFallbackReason = "unsupported" | "invalid" | "unavailable" | "unauthorized";

export const HOME_COMPONENT_REGISTRY = {
  PatientSearch: {
    key: "PatientSearch",
    purpose: "Identificar y fijar a un paciente como contexto activo.",
  },
  AgentOutcome: {
    key: "AgentOutcome",
    purpose: "Mostrar un resultado canónico y su módulo de origen.",
  },
  AgentFallback: {
    key: "AgentFallback",
    purpose: "Explicar una capacidad no disponible o una vista inválida.",
  },
} as const satisfies Record<HomeComponentKey, { key: HomeComponentKey; purpose: string }>;

export type PatientSearchStage = {
  component: "PatientSearch";
  payload: { query: string };
};

export type AgentOutcomeStage = {
  component: "AgentOutcome";
  payload: {
    outcome: HomeOutcome;
    patient: HomePatient | null;
    module: "pacientes" | null;
    message: string;
  };
};

export type AgentFallbackStage = {
  component: "AgentFallback";
  payload: {
    reason: HomeFallbackReason;
    message: string;
    retryable: boolean;
  };
};

export type HomeStage = PatientSearchStage | AgentOutcomeStage | AgentFallbackStage;

export type StageValidation =
  | { ok: true; value: HomeStage }
  | { ok: false; reason: string };

const COMPONENT_KEY_SET = new Set<HomeComponentKey>(HOME_COMPONENT_KEYS);
const OUTCOMES = new Set<HomeOutcome>(["confirmado", "sin_resultados", "no_disponible", "error"]);
const FALLBACK_REASONS = new Set<HomeFallbackReason>(["unsupported", "invalid", "unavailable", "unauthorized"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = new Set(keys);
  return Object.keys(value).length === expected.size && Object.keys(value).every((key) => expected.has(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isHomePatient(value: unknown): value is HomePatient {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "name", "dni", "phone"])) return false;
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    (value.dni === null || typeof value.dni === "string") &&
    (value.phone === null || typeof value.phone === "string")
  );
}

function isHomeOutcome(value: unknown): value is HomeOutcome {
  return typeof value === "string" && OUTCOMES.has(value as HomeOutcome);
}

function isFallbackReason(value: unknown): value is HomeFallbackReason {
  return typeof value === "string" && FALLBACK_REASONS.has(value as HomeFallbackReason);
}

export function validateHomeStage(input: unknown): StageValidation {
  if (!isRecord(input) || !hasExactKeys(input, ["component", "payload"])) {
    return { ok: false, reason: "La vista recibida no tiene la forma permitida." };
  }

  const component = input.component;
  if (typeof component !== "string" || !COMPONENT_KEY_SET.has(component as HomeComponentKey)) {
    return { ok: false, reason: "La vista solicitada no está disponible." };
  }

  const payload = input.payload;
  if (!isRecord(payload)) return { ok: false, reason: "La información de la vista está incompleta." };

  if (component === "PatientSearch") {
    if (!hasExactKeys(payload, ["query"]) || typeof payload.query !== "string") {
      return { ok: false, reason: "La búsqueda de pacientes no es válida." };
    }
    return { ok: true, value: { component, payload: { query: payload.query } } };
  }

  if (component === "AgentOutcome") {
    if (!hasExactKeys(payload, ["outcome", "patient", "module", "message"])) {
      return { ok: false, reason: "El resultado recibido no es válido." };
    }
    if (!isHomeOutcome(payload.outcome) || !isNonEmptyString(payload.message)) {
      return { ok: false, reason: "El resultado recibido no es válido." };
    }
    if (payload.module !== null && payload.module !== "pacientes") {
      return { ok: false, reason: "El resultado apunta a un módulo no permitido." };
    }
    if (payload.patient !== null && !isHomePatient(payload.patient)) {
      return { ok: false, reason: "El paciente recibido no es válido." };
    }
    if (payload.outcome === "confirmado" && (payload.patient === null || payload.module !== "pacientes")) {
      return { ok: false, reason: "El resultado confirmado no tiene un paciente válido." };
    }
    if (payload.outcome !== "confirmado" && payload.patient !== null) {
      return { ok: false, reason: "El resultado no puede fijar un paciente en este estado." };
    }
    return {
      ok: true,
      value: {
        component,
        payload: {
          outcome: payload.outcome,
          patient: payload.patient,
          module: payload.module,
          message: payload.message,
        },
      },
    };
  }

  if (!hasExactKeys(payload, ["reason", "message", "retryable"])) {
    return { ok: false, reason: "La alternativa de AIRI no es válida." };
  }
  if (!isFallbackReason(payload.reason) || !isNonEmptyString(payload.message) || typeof payload.retryable !== "boolean") {
    return { ok: false, reason: "La alternativa de AIRI no es válida." };
  }
  return {
    ok: true,
    value: {
      component: "AgentFallback",
      payload: { reason: payload.reason, message: payload.message, retryable: payload.retryable },
    },
  };
}

export function fallbackStage(
  reason: HomeFallbackReason = "invalid",
  message = "AIRI no pudo preparar una vista segura para esta solicitud.",
  retryable = false,
): AgentFallbackStage {
  return { component: "AgentFallback", payload: { reason, message, retryable } };
}

/** Always return a renderable registered stage; invalid data becomes visible fallback. */
export function safeHomeStage(input: unknown): HomeStage {
  const result = validateHomeStage(input);
  return result.ok ? result.value : fallbackStage("invalid", result.reason);
}
