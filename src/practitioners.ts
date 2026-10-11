import { useMocks } from "./api";
import {
  ApiError, createAvailabilityRule, createCapability, createPractitioner, listPractitionerHistory,
  listPractitionerRoster, renamePractitioner, setAdminActive,
  type AdminAuditEventRead, type AdminEntity, type AdminEntityType, type AdminToggleRead, type AvailabilityRuleRead,
  type CapabilityRead, type PractitionerProfileRead, type PractitionerRead, type PractitionerRosterRead,
} from "./contracts/client";
import type { components } from "./contracts/api";
import { mockLocations, mockRoster, mockRosterHistory, mockServices } from "./mockData";

export type { AdminEntity };
export type PractitionerCreate = components["schemas"]["PractitionerCreate"];
export type CapabilityCreate = components["schemas"]["CapabilityCreate"];
export type AvailabilityRuleCreate = components["schemas"]["AvailabilityRuleCreate"];

export async function loadRoster(): Promise<PractitionerRosterRead[]> {
  if (!useMocks) return listPractitionerRoster();
  return sortedRoster();
}

export async function loadHistory(practitionerId: number): Promise<AdminAuditEventRead[]> {
  if (!useMocks) return listPractitionerHistory(practitionerId);
  if (!mockRoster.some((row) => row.id === practitionerId)) throw doctorNotFound();
  const pid = String(practitionerId);
  return structuredClone(
    mockRosterHistory
      .filter((event) => (event.entity_type === "practitioner" && event.entity_id === pid)
        || (DOCTOR_SCOPED_TYPES.has(event.entity_type) && event.after_state?.practitioner_id === practitionerId))
      .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at) || b.id - a.id)
      .slice(0, HISTORY_LIMIT),
  );
}

export async function toggleAdminEntity(entity: AdminEntity, id: number, active: boolean, idempotencyKey: string, reason?: string): Promise<AdminToggleRead> {
  if (!useMocks) return setAdminActive(entity, id, active, idempotencyKey, reason);
  const trimmed = reason?.trim();
  if (!active && !(trimmed && trimmed.length >= MIN_REASON_LENGTH && trimmed.length <= MAX_REASON_LENGTH)) {
    throw new ApiError(422, "INVALID_INPUT", `Indica el motivo (de ${MIN_REASON_LENGTH} a ${MAX_REASON_LENGTH} caracteres).`);
  }
  return once(idempotencyKey, { entity, id, active, reason: active ? undefined : trimmed }, () => mockToggle(entity, id, active, trimmed));
}

export async function renameRosterPractitioner(id: number, displayName: string, key: string): Promise<PractitionerProfileRead> {
  if (!useMocks) return renamePractitioner(id, displayName, key);
  return once(key, { op: "rename", id, displayName }, () => {
    const name = requireName(displayName);
    const row = mockRoster.find((item) => item.id === id);
    if (!row) throw doctorNotFound();
    const before = { practitioner_id: id, display_name: row.display_name };
    row.display_name = name;
    record("practitioner.renamed", "practitioner", id, before, { practitioner_id: id, display_name: name });
    return { id, display_name: name };
  });
}

export async function addPractitioner(input: PractitionerCreate, key: string): Promise<PractitionerRead> {
  if (!useMocks) return createPractitioner(input, key);
  return once(key, { op: "practitioner", input }, () => {
    const name = requireName(input.display_name);
    const id = Math.max(0, ...mockRoster.map((row) => row.id)) + 1;
    mockRoster.push({
      id, display_name: name, platform_active: input.is_active, membership_active: true, deactivated_at: null,
      future_confirmed_appointments: 0, capabilities: [], availability_rules: [],
    });
    record("practitioner.created", "practitioner", id, null, { practitioner_id: id, display_name: name });
    return { id, display_name: name, is_active: input.is_active };
  });
}

export async function addCapability(input: CapabilityCreate, key: string): Promise<CapabilityRead> {
  if (!useMocks) return createCapability(input, key);
  return once(key, { op: "capability", input }, () => {
    const doctor = mockRoster.find((row) => row.id === input.practitioner_id);
    if (!doctor) throw doctorNotFound();
    const service = mockServices.find((row) => row.id === input.service_id);
    const site = mockLocations.find((row) => Number(row.id) === input.location_id);
    if (!service) throw new ApiError(404, "NOT_FOUND", "Servicio no encontrado.");
    if (!site) throw new ApiError(404, "NOT_FOUND", "Sede no encontrada.");
    if (!service.isActive || !site.isActive) throw new ApiError(409, "ENTITY_INACTIVE", "El servicio o la sede están inactivos.");
    const existing = doctor.capabilities.find((row) => row.service_id === input.service_id && row.location_id === input.location_id);
    if (existing) {
      throw new ApiError(422, "INVALID_INPUT", "Esta capacidad ya existe.", { capability_id: existing.id, is_active: existing.is_active });
    }
    const id = Math.max(0, ...mockRoster.flatMap((row) => row.capabilities.map((item) => item.id))) + 1;
    const deactivatedAt = input.is_active ? null : new Date().toISOString();
    doctor.capabilities.push({
      id, service_id: service.id, service_name: service.name, location_id: Number(site.id), location_name: site.name,
      is_active: input.is_active, deactivated_at: deactivatedAt,
    });
    record("practitioner_capability.created", "practitioner_capability", id, null, {
      id, practitioner_id: doctor.id, service_id: service.id, location_id: Number(site.id), is_active: input.is_active, deactivated_at: deactivatedAt,
    });
    return { id, practitioner_id: doctor.id, service_id: service.id, location_id: Number(site.id), is_active: input.is_active };
  });
}

export async function addAvailabilityRule(input: AvailabilityRuleCreate, key: string): Promise<AvailabilityRuleRead> {
  if (!useMocks) return createAvailabilityRule(input, key);
  return once(key, { op: "rule", input }, () => {
    const doctor = mockRoster.find((row) => row.id === input.practitioner_id);
    if (!doctor) throw doctorNotFound();
    const site = mockLocations.find((row) => Number(row.id) === input.location_id);
    if (!site) throw new ApiError(404, "NOT_FOUND", "Sede no encontrada.");
    if (!site.isActive) throw new ApiError(409, "ENTITY_INACTIVE", "La sede está inactiva.");
    const start = wallClock(input.start_local);
    const end = wallClock(input.end_local);
    if (!Number.isInteger(input.day_of_week) || input.day_of_week < 0 || input.day_of_week > 6) {
      throw new ApiError(422, "INVALID_INPUT", "El día debe estar entre lunes (0) y domingo (6).");
    }
    if (!start || !end || start >= end) throw new ApiError(422, "INVALID_INPUT", "La hora de inicio debe ser anterior a la hora de fin.");
    const id = Math.max(0, ...mockRoster.flatMap((row) => row.availability_rules.map((item) => item.id))) + 1;
    doctor.availability_rules.push({
      id, location_id: Number(site.id), location_name: site.name, day_of_week: input.day_of_week, start_local: start, end_local: end,
      is_active: true, deactivated_at: null,
    });
    record("availability_rule.created", "availability_rule", id, null, {
      id, practitioner_id: doctor.id, location_id: Number(site.id), day_of_week: input.day_of_week, start_local: start, end_local: end,
    });
    return { id, practitioner_id: doctor.id, location_id: Number(site.id), day_of_week: input.day_of_week, start_local: start, end_local: end };
  });
}

// --- demo (mock) mode ---------------------------------------------------------
// Mirrors the backend's rules — mandatory reason, stable state errors, the
// future-appointment guard and idempotent replay — so a design pass behaves
// like production. Real mode (NEXT_PUBLIC_USE_MOCKS=false) never reaches it.

const MIN_REASON_LENGTH = 3;
const MAX_REASON_LENGTH = 250;
const MAX_NAME_LENGTH = 250;
const FUTURE_APPOINTMENT_LIMIT = 50;
const HISTORY_LIMIT = 100;
const DOCTOR_SCOPED_TYPES = new Set(["practitioner_membership", "practitioner_capability", "availability_rule"]);

const doctorNotFound = () => new ApiError(404, "NOT_FOUND", "Doctor no encontrado.");

const replays = new Map<string, { input: string; result: unknown }>();

/** Same key + same intent replays the stored outcome; the same key with other data is refused. */
function once<T>(idempotencyKey: string, input: unknown, run: () => T): T {
  const serialized = JSON.stringify(input);
  const previous = replays.get(idempotencyKey);
  if (previous) {
    if (previous.input !== serialized) {
      throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED", "La clave de idempotencia ya se usó con otros datos.");
    }
    return structuredClone(previous.result) as T;
  }
  const result = run();
  replays.set(idempotencyKey, { input: serialized, result: structuredClone(result) });
  return result;
}

function requireName(value: string): string {
  const name = value.trim();
  if (!name || name.length > MAX_NAME_LENGTH) throw new ApiError(422, "INVALID_INPUT", "El nombre es obligatorio (máximo 250 caracteres).");
  return name;
}

/** "HH:MM" or "HH:MM:SS" → "HH:MM:SS"; anything else → null. */
function wallClock(value: string): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value);
  return match ? `${match[1]}:${match[2]}:${match[3] ?? "00"}` : null;
}

/** Opaque ids of the doctor's upcoming confirmed appointments, soonest first, capped like the backend. */
function futureAppointmentIds(row: PractitionerRosterRead): number[] {
  return Array.from({ length: Math.min(row.future_confirmed_appointments, FUTURE_APPOINTMENT_LIMIT) }, (_, index) => row.id * 100 + index + 1);
}

/** The backend lists the roster by doctor name, services by site then name, and schedule by day then start. */
function sortedRoster(): PractitionerRosterRead[] {
  return structuredClone(mockRoster)
    .map((row) => ({
      ...row,
      capabilities: row.capabilities.sort((a, b) => a.location_name.localeCompare(b.location_name, "es") || a.service_name.localeCompare(b.service_name, "es")),
      availability_rules: row.availability_rules.sort((a, b) => a.day_of_week - b.day_of_week || a.start_local.localeCompare(b.start_local) || a.location_name.localeCompare(b.location_name, "es")),
    }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "es"));
}

function record(action: string, entityType: string, entityId: number, before: Record<string, unknown> | null, after: Record<string, unknown>): void {
  mockRosterHistory.push({
    id: Math.max(0, ...mockRosterHistory.map((event) => event.id)) + 1,
    occurred_at: new Date().toISOString(),
    action, entity_type: entityType, entity_id: String(entityId), actor_type: "human", actor_id: "1",
    before_state: before, after_state: after,
  });
}

interface ToggleTarget {
  entityType: AdminEntityType;
  practitionerId: number | null;
  active: boolean;
  deactivatedAt: string | null;
  /** Upcoming confirmed appointments that forbid switching it off (only simulated for doctors). */
  blocking: number[];
  apply(active: boolean, deactivatedAt: string | null): void;
}

function findTarget(entity: AdminEntity, id: number): ToggleTarget | undefined {
  switch (entity) {
    case "practitioners": {
      const row = mockRoster.find((item) => item.id === id);
      return row && {
        entityType: "practitioner_membership", practitionerId: row.id, active: row.membership_active, deactivatedAt: row.deactivated_at,
        blocking: futureAppointmentIds(row),
        apply: (active, at) => { row.membership_active = active; row.deactivated_at = at; },
      };
    }
    case "capabilities": {
      for (const doctor of mockRoster) {
        const row = doctor.capabilities.find((item) => item.id === id);
        if (row) {
          return {
            entityType: "practitioner_capability", practitionerId: doctor.id, active: row.is_active, deactivatedAt: row.deactivated_at, blocking: [],
            apply: (active, at) => { row.is_active = active; row.deactivated_at = at; },
          };
        }
      }
      return undefined;
    }
    case "availability-rules": {
      for (const doctor of mockRoster) {
        const row = doctor.availability_rules.find((item) => item.id === id);
        if (row) {
          return {
            entityType: "availability_rule", practitionerId: doctor.id, active: row.is_active, deactivatedAt: row.deactivated_at, blocking: [],
            apply: (active, at) => { row.is_active = active; row.deactivated_at = at; },
          };
        }
      }
      return undefined;
    }
    case "locations": {
      const row = mockLocations.find((item) => Number(item.id) === id);
      return row && {
        entityType: "location", practitionerId: null, active: row.isActive, deactivatedAt: null, blocking: [],
        apply: (active) => { row.isActive = active; },
      };
    }
    case "services": {
      const row = mockServices.find((item) => item.id === id);
      return row && {
        entityType: "service", practitionerId: null, active: row.isActive, deactivatedAt: null, blocking: [],
        apply: (active) => { row.isActive = active; },
      };
    }
  }
}

function mockToggle(entity: AdminEntity, id: number, active: boolean, reason: string | undefined): AdminToggleRead {
  const target = findTarget(entity, id);
  if (!target) throw new ApiError(404, "NOT_FOUND", "No se encontró el registro.");
  if (active && target.active) throw new ApiError(422, "INVALID_INPUT", "Ya está activo.");
  if (!active && !target.active) throw new ApiError(409, "ENTITY_INACTIVE", "Ya está inactivo.");
  if (!active && target.blocking.length > 0) {
    throw new ApiError(409, "APPOINTMENT_CONFLICT", "Aún tiene citas futuras confirmadas.", { reason: "future_appointments", appointment_ids: target.blocking });
  }
  const at = active ? null : new Date().toISOString();
  const scope = target.practitionerId === null ? {} : { practitioner_id: target.practitionerId };
  const before = { id, ...scope, is_active: target.active, deactivated_at: target.deactivatedAt };
  target.apply(active, at);
  const outcomeReason = active ? null : reason ?? null;
  record(`${target.entityType}.${active ? "reactivated" : "deactivated"}`, target.entityType, id, before, {
    id, ...scope, is_active: active, deactivated_at: at, ...(outcomeReason ? { reason: outcomeReason } : {}),
  });
  return { entity_type: target.entityType, id, practitioner_id: target.practitionerId, is_active: active, deactivated_at: at, reason: outcomeReason };
}
