/**
 * Real-mode API client for the OdontoSmart backend (domain authority).
 *
 * Types come from OpenAPI (src/contracts/api.ts, generated with
 * openapi-typescript) — never handwritten. Errors are the backend's stable
 * envelope mapped into a typed ApiError for UI states.
 */

import axios, { AxiosError } from "axios";
import type { components, paths } from "./api";
import { BACKEND_URL } from "../env";

export type AppointmentListItem = components["schemas"]["AppointmentListItem"];
export type AppointmentRead = components["schemas"]["AppointmentRead"];
export type LeadRead = components["schemas"]["LeadRead"];
export type LocationRead = components["schemas"]["LocationRead"];
export type ServiceRead = components["schemas"]["ServiceRead"];
export type PractitionerRead = components["schemas"]["PractitionerRead"];
export type SlotResult = components["schemas"]["SlotResult"];
export type PatientRead = components["schemas"]["PatientRead"];
export type ChargeRead = components["schemas"]["ChargeRead"];
export type PaymentRead = components["schemas"]["PaymentRead"];
export type ProductRead = components["schemas"]["ProductRead"];
export type BalanceRead = components["schemas"]["BalanceRead"];
export type MovementRead = components["schemas"]["MovementRead"];
export type TransferRead = components["schemas"]["TransferRead"];
export type EntryCreate = components["schemas"]["EntryCreate"];
export type AdjustmentCreate = components["schemas"]["AdjustmentCreate"];
export type TransferCreate = components["schemas"]["TransferCreate"];

type AppointmentsPath = paths["/appointments"];

const http = axios.create({
  baseURL: BACKEND_URL,
});

export interface ApiErrorShape {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

/** The backend's stable error envelope, typed for UI mapping. */
export class ApiError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;
  readonly httpStatus: number;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
    this.httpStatus = status;
    this.code = code;
    this.details = details;
  }
}

/** Map any thrown error into the envelope shape (or a generic connection error). */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (axios.isAxiosError(error)) {
    const payload = (error as AxiosError<{ error?: ApiErrorShape }>).response?.data?.error;
    if (payload?.code && payload?.message) {
      return new ApiError(error.response?.status ?? 0, payload.code, payload.message, payload.details);
    }
    return new ApiError(error.response?.status ?? 0, "NETWORK", "Error de conexión con el servidor.");
  }
  return new ApiError(0, "UNKNOWN", error instanceof Error ? error.message : "Error desconocido.");
}

export async function listPatients(search?: string): Promise<PatientRead[]> {
  const response = await http.get<PatientRead[]>("/patients", { params: search ? { search } : undefined });
  return response.data;
}

export async function createPatient(
  input: { full_name: string; dni?: string | null; phone?: string | null },
  idempotencyKey: string,
): Promise<PatientRead> {
  const response = await http.post<PatientRead>("/patients", input, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
  return response.data;
}

export async function listAppointments(params: {
  from_date: string;
  to_date: string;
  location_id?: number;
  practitioner_id?: number;
}): Promise<AppointmentListItem[]> {
  const response = await http.get<AppointmentListItem[]>("/appointments", { params });
  return response.data;
}

export async function getAppointment(appointmentId: number): Promise<AppointmentListItem> {
  const response = await http.get<AppointmentListItem>(`/appointments/${appointmentId}`);
  return response.data;
}

export async function listLeads(search?: string): Promise<LeadRead[]> {
  const response = await http.get<LeadRead[]>("/leads", { params: search ? { search } : undefined });
  return response.data;
}

export async function listLocations(): Promise<LocationRead[]> {
  const response = await http.get<LocationRead[]>("/locations");
  return response.data;
}

export async function listServices(): Promise<ServiceRead[]> {
  const response = await http.get<ServiceRead[]>("/services");
  return response.data;
}

export async function listEligiblePractitioners(
  serviceId: number,
  locationId: number,
): Promise<PractitionerRead[]> {
  const response = await http.get<PractitionerRead[]>("/practitioners/eligible", {
    params: { service_id: serviceId, location_id: locationId },
  });
  return response.data;
}

export async function querySlots(params: {
  service_id: number;
  location_id: number;
  window_start: string;
  window_end: string;
}): Promise<SlotResult[]> {
  const response = await http.post<SlotResult[]>("/slots/query", params);
  return response.data;
}

export async function bookAppointment(
  input: {
    lead_id: number;
    service_id: number;
    location_id: number;
    practitioner_id: number;
    start: string;
  },
  idempotencyKey: string,
): Promise<AppointmentRead> {
  const response = await http.post<AppointmentRead>("/appointments", input, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
  return response.data;
}

export async function rescheduleAppointment(
  appointmentId: number,
  newStart: string,
  idempotencyKey: string,
): Promise<AppointmentRead> {
  const response = await http.post<AppointmentRead>(
    `/appointments/${appointmentId}/reschedule`,
    { new_start: newStart },
    { headers: { "Idempotency-Key": idempotencyKey } },
  );
  return response.data;
}

export async function cancelAppointment(
  appointmentId: number,
  idempotencyKey: string,
): Promise<AppointmentRead> {
  const response = await http.post<AppointmentRead>(
    `/appointments/${appointmentId}/cancel`,
    {},
    { headers: { "Idempotency-Key": idempotencyKey } },
  );
  return response.data;
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

// --- cash vertical (real economic surface, M4 Phase 1) ----------------------

/** The charge list IS the cash-visible economic state. */
export async function listCharges(params?: { execution_id?: number }): Promise<ChargeRead[]> {
  const response = await http.get<ChargeRead[]>("/charges", {
    params: params?.execution_id ? { execution_id: params.execution_id } : undefined,
  });
  return response.data;
}

export async function getCharge(chargeId: number): Promise<ChargeRead> {
  const response = await http.get<ChargeRead>(`/charges/${chargeId}`);
  return response.data;
}

export async function listPayments(chargeId: number): Promise<PaymentRead[]> {
  const response = await http.get<PaymentRead[]>(`/charges/${chargeId}/payments`);
  return response.data;
}

/** Record a payment against a charge; idempotency is per payment intent. */
export async function createPayment(
  chargeId: number,
  input: { amount: number; method: string },
  idempotencyKey: string,
): Promise<PaymentRead> {
  const response = await http.post<PaymentRead>(`/charges/${chargeId}/payments`, input, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
  return response.data;
}

// --- inventory vertical (location-aware stock surface, M4.3) ----------------

export async function listProducts(params?: { search?: string; kind?: string }): Promise<ProductRead[]> {
  const response = await http.get<ProductRead[]>("/products", { params });
  return response.data;
}

export async function getProduct(productId: number): Promise<ProductRead> {
  const response = await http.get<ProductRead>(`/products/${productId}`);
  return response.data;
}

export async function createProduct(
  input: { name: string; unit: string; kind: "consumible" | "reventa" },
  idempotencyKey: string,
): Promise<ProductRead> {
  const response = await http.post<ProductRead>("/products", input, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
  return response.data;
}

export async function getBalance(productId: number, locationId: number): Promise<BalanceRead> {
  const response = await http.get<BalanceRead>(`/products/${productId}/balance`, {
    params: { location_id: locationId },
  });
  return response.data;
}

export async function listMovements(productId: number, locationId: number): Promise<MovementRead[]> {
  const response = await http.get<MovementRead[]>(`/products/${productId}/movements`, {
    params: { location_id: locationId },
  });
  return response.data;
}

/** Stock entry (purchase/initial input) at one location. */
export async function registerEntry(
  productId: number,
  input: EntryCreate,
  idempotencyKey: string,
): Promise<MovementRead> {
  const response = await http.post<MovementRead>(`/products/${productId}/entries`, input, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
  return response.data;
}

/** Reason-required signed correction at one location. */
export async function registerAdjustment(
  productId: number,
  input: AdjustmentCreate,
  idempotencyKey: string,
): Promise<MovementRead> {
  const response = await http.post<MovementRead>(`/products/${productId}/adjustments`, input, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
  return response.data;
}

/** Move stock between two locations of the same organization. */
export async function registerTransfer(
  productId: number,
  input: TransferCreate,
  idempotencyKey: string,
): Promise<TransferRead> {
  const response = await http.post<TransferRead>(`/products/${productId}/transfers`, input, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
  return response.data;
}

export type { paths };
