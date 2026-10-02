/**
 * Who is acting: the staff persona (chosen via the BFF's `/api/session`) and
 * the backend's own answer to "who am I" (`GET /me`). The UI decides what to
 * show from `permissions` only — role names are labels, never gates.
 *
 * Mock mode mirrors the backend's two demo humans (`mockStaff`) in memory and
 * makes no HTTP call.
 */
import { USE_MOCKS } from "./env";
import { ApiError, getMe, type MeRead } from "./contracts/client";
import { mockStaff } from "./mockData";
import type { PersonaOption, RunnableAgent, StaffIdentity } from "./types";

const SESSION_URL = "/api/session";

let mockPersona: string | null = mockStaff[0]?.key ?? null;

/** The mock persona's `/me`, or null when none is chosen (backend 401). */
export function mockCurrentMe(): MeRead | null {
  return mockStaff.find((staff) => staff.key === mockPersona)?.me ?? null;
}

export function toStaffIdentity(me: MeRead): StaffIdentity {
  return {
    principalType: me.principal.type,
    displayName: me.principal.display_name,
    organizationName: me.organization.name,
    roles: me.roles.map((role) => role.name),
    permissions: [...me.permissions],
  };
}

export async function loadIdentity(): Promise<StaffIdentity> {
  if (!USE_MOCKS) return toStaffIdentity(await getMe());
  const me = mockCurrentMe();
  if (!me) throw new ApiError(401, "AUTHENTICATION_REQUIRED", "A valid credential is required.");
  return toStaffIdentity(me);
}

export interface PersonaSession {
  personas: PersonaOption[];
  current: string | null;
}

interface SessionBody {
  personas: Array<{ key: string; display_name: string; role: string }>;
  current: string | null;
}

async function sessionRequest(init?: RequestInit): Promise<PersonaSession> {
  let response: Response;
  try {
    response = await fetch(SESSION_URL, { cache: "no-store", credentials: "same-origin", ...init });
  } catch {
    throw new ApiError(0, "NETWORK", "Error de conexión con el servidor.");
  }
  const body = (await response.json().catch(() => null)) as (SessionBody & { error?: { code: string; message: string; details?: Record<string, unknown> } }) | null;
  if (!response.ok || !body) {
    const error = body?.error;
    throw new ApiError(response.status, error?.code ?? "UNKNOWN", error?.message ?? "No se pudo cambiar de persona.", error?.details ?? {});
  }
  return {
    personas: body.personas.map((persona) => ({ key: persona.key, displayName: persona.display_name, role: persona.role })),
    current: body.current,
  };
}

function mockSession(): PersonaSession {
  return {
    personas: mockStaff.map((staff) => ({ key: staff.key, displayName: staff.me.principal.display_name, role: staff.role })),
    current: mockPersona,
  };
}

export async function loadPersonas(): Promise<PersonaSession> {
  return USE_MOCKS ? mockSession() : sessionRequest();
}

/** `null` returns to the pre-persona integration credential. */
export async function choosePersona(key: string | null): Promise<PersonaSession> {
  if (USE_MOCKS) {
    if (key !== null && !mockStaff.some((staff) => staff.key === key)) {
      throw new ApiError(400, "PERSONA_UNKNOWN", "Esa persona no está configurada en este servidor.");
    }
    mockPersona = key;
    return mockSession();
  }
  return sessionRequest({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ persona: key }) });
}

// --- permission-driven UI -----------------------------------------------------

export function hasPermissions(identity: StaffIdentity | null, codes: readonly string[]): boolean {
  if (!identity) return false;
  return codes.every((code) => identity.permissions.includes(code));
}

/** Module → the read its page needs first. Modules not listed (Inicio, the
 * design-time prototypes, Configuración preview) need no backend permission. */
export const MODULE_PERMISSIONS: Readonly<Record<string, readonly string[]>> = {
  "/agenda": ["appointments.read"],
  "/pacientes": ["patients.read"],
  "/aprobaciones": ["proposals.read"],
  "/agente": ["proposals.read"],
  "/productividad": ["audit.read"],
  "/caja": ["charges.read"],
  "/inventario": ["products.read"],
};

export function canOpen(identity: StaffIdentity | null, path: string): boolean {
  const required = MODULE_PERMISSIONS[path];
  return !required || hasPermissions(identity, required);
}

/** The backend's run gates (`app/agents_runtime/service.py`,
 * `app/agent_jobs/service.py`): humans need `proposals.decide`, machines
 * `proposals.create`, plus the agent's reads; Confirmaciones is human-only. */
const AGENT_READS: Record<RunnableAgent, readonly string[]> = {
  cobranza: ["charges.read"],
  inventario: ["products.read", "movements.read"],
  confirmaciones: ["appointments.read", "deliveries.create"],
  backfill: ["appointments.read", "waitlist.read"],
};

export function canRunAgent(identity: StaffIdentity | null, agent: RunnableAgent): boolean {
  if (!identity) return false;
  const human = identity.principalType === "human";
  const machine = identity.principalType === "integration" || identity.principalType === "agent";
  if (agent === "confirmaciones") return human && hasPermissions(identity, AGENT_READS.confirmaciones);
  if (!human && !machine) return false;
  return hasPermissions(identity, [human ? "proposals.decide" : "proposals.create", ...AGENT_READS[agent]]);
}
