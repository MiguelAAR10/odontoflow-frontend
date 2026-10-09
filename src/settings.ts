import { useMocks } from "./api";
import type { components } from "./contracts/api";
import {
  ApiError, createLocation, createService, listLocations, listServices,
  type LocationRead, type ServiceRead,
} from "./contracts/client";
import { mockLocations, mockServices } from "./mockData";

export type LocationCreate = components["schemas"]["LocationCreate"];
export type ServiceCreate = components["schemas"]["ServiceCreate"];

const locationReplays = new Map<string, { input: string; row: LocationRead }>();
const serviceReplays = new Map<string, { input: string; row: ServiceRead }>();

export async function loadSettingsLocations(): Promise<LocationRead[]> {
  if (!useMocks) return listLocations();
  return mockLocations.map((row) => ({
    id: Number(row.id), name: row.name, timezone: row.timezone, is_active: row.isActive,
  }));
}

export async function loadSettingsServices(): Promise<ServiceRead[]> {
  if (!useMocks) return listServices();
  return mockServices.map((row) => ({
    id: row.id, name: row.name, duration_minutes: row.durationMinutes, is_active: row.isActive,
  }));
}

function replay<T>(cache: Map<string, { input: string; row: T }>, key: string, input: unknown): T | undefined {
  const previous = cache.get(key);
  if (!previous) return undefined;
  if (previous.input !== JSON.stringify(input)) {
    throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "La clave de idempotencia ya se usó con otros datos.");
  }
  return { ...previous.row };
}

export async function createSettingsLocation(input: LocationCreate, idempotencyKey: string): Promise<LocationRead> {
  if (!useMocks) return createLocation(input, idempotencyKey);
  const previous = replay(locationReplays, idempotencyKey, input);
  if (previous) return previous;
  if (!input.name.trim() || !input.timezone.trim()) {
    throw new ApiError(422, "VALIDATION_ERROR", "El nombre y la zona horaria son obligatorios.");
  }
  const row: LocationRead = {
    id: Math.max(0, ...mockLocations.map((location) => Number(location.id))) + 1,
    name: input.name.trim(), timezone: input.timezone.trim(), is_active: true,
  };
  mockLocations.push({ id: String(row.id), name: row.name, timezone: row.timezone, isActive: row.is_active });
  locationReplays.set(idempotencyKey, { input: JSON.stringify(input), row });
  return { ...row };
}

export async function createSettingsService(input: ServiceCreate, idempotencyKey: string): Promise<ServiceRead> {
  if (!useMocks) return createService(input, idempotencyKey);
  const previous = replay(serviceReplays, idempotencyKey, input);
  if (previous) return previous;
  if (!input.name.trim()) throw new ApiError(422, "VALIDATION_ERROR", "El nombre es obligatorio.");
  if (!Number.isInteger(input.duration_minutes) || input.duration_minutes <= 0) {
    throw new ApiError(422, "VALIDATION_ERROR", "La duración debe ser un número entero de minutos mayor que cero.");
  }
  const row: ServiceRead = {
    id: Math.max(0, ...mockServices.map((service) => service.id)) + 1,
    name: input.name.trim(), duration_minutes: input.duration_minutes, is_active: input.is_active,
  };
  mockServices.push({ id: row.id, name: row.name, durationMinutes: row.duration_minutes, isActive: row.is_active });
  serviceReplays.set(idempotencyKey, { input: JSON.stringify(input), row });
  return { ...row };
}
