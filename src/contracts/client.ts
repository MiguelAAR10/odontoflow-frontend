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
export type VisitRead = components["schemas"]["VisitRead"];
export type VisitDetailRead = components["schemas"]["VisitDetailRead"];
export type ServiceExecutionRead = components["schemas"]["ServiceExecutionRead"];
export type ChargeRead = components["schemas"]["ChargeRead"];
export type PaymentRead = components["schemas"]["PaymentRead"];
export type PaymentCreate = components["schemas"]["PaymentCreate"];
export type PaymentMethod = PaymentCreate["method"];
export type PaymentVerificationStatus = PaymentRead["verification_status"];
export type ChargeFollowUpRead = components["schemas"]["ChargeFollowUpRead"];
export type ProductRead = components["schemas"]["ProductRead"];
export type BalanceRead = components["schemas"]["BalanceRead"];
export type MovementRead = components["schemas"]["MovementRead"];
export type TransferRead = components["schemas"]["TransferRead"];
export type EntryCreate = components["schemas"]["EntryCreate"];
export type AdjustmentCreate = components["schemas"]["AdjustmentCreate"];
export type TransferCreate = components["schemas"]["TransferCreate"];
export type AppointmentProposalRead = components["schemas"]["AppointmentProposalRead"];
export type AppointmentProposalConfirm = components["schemas"]["AppointmentProposalConfirm"];
export type AppointmentProposalDecline = components["schemas"]["AppointmentProposalDecline"];
export type MeRead = components["schemas"]["MeRead"];
export type InboxPage = components["schemas"]["InboxPage"];
export type InboxItem = components["schemas"]["InboxItem"];
export type InboxStatus = InboxItem["status"];
export type InboxKind = InboxItem["kind"];
export type InboxAction = InboxItem["actions"][number];
export type ProposalApprove = components["schemas"]["ProposalApprove"];
export type AgentRunCreate = components["schemas"]["AgentRunCreate"];
export type AgentRunOut = components["schemas"]["AgentRunOut"];
export type AgentRunCounts = components["schemas"]["AgentRunCounts"];
export type JobsRunDue = components["schemas"]["JobsRunDue"];
export type JobsRunOut = components["schemas"]["JobsRunOut"];

type AppointmentsPath = paths["/appointments"];

/** Single transport shared with `src/api.ts` (re-exported there as `api`). */
export const http = axios.create({
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

// --- FE3A service-to-cash reads and commands -------------------------------

export async function listVisits(params?: { patient_id?: number }): Promise<VisitRead[]> {
  const response = await http.get<VisitRead[]>("/visits", { params });
  return response.data;
}

export async function getVisit(visitId: number): Promise<VisitDetailRead> {
  const response = await http.get<VisitDetailRead>(`/visits/${visitId}`);
  return response.data;
}

export async function listVisitExecutions(visitId: number): Promise<ServiceExecutionRead[]> {
  const response = await http.get<ServiceExecutionRead[]>(`/visits/${visitId}/executions`);
  return response.data;
}

export async function createVisit(
  input: {
    patient_id: number;
    appointment_id?: number;
    practitioner_id?: number;
    location_id?: number;
  },
  idempotencyKey: string,
): Promise<VisitRead> {
  const response = await http.post<VisitRead>("/visits", input, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
  return response.data;
}

export async function createServiceExecution(
  visitId: number,
  input: { service_id: number; executed_price: number },
  idempotencyKey: string,
): Promise<ServiceExecutionRead> {
  const response = await http.post<ServiceExecutionRead>(`/visits/${visitId}/executions`, input, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
  return response.data;
}

export async function createCharge(
  executionId: number,
  input: { amount?: number },
  idempotencyKey: string,
): Promise<ChargeRead> {
  const response = await http.post<ChargeRead>(`/executions/${executionId}/charges`, input, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
  return response.data;
}

// --- cash vertical (real economic surface) ---------------------------------

/** The charge list IS the cash-visible economic state. */
export async function listCharges(params?: {
  execution_id?: number;
  patient_id?: number;
  location_id?: number;
  visit_id?: number;
  status?: "unpaid" | "partial" | "paid";
  created_from?: string;
  created_to?: string;
}): Promise<ChargeRead[]> {
  const response = await http.get<ChargeRead[]>("/charges", { params });
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
  input: {
    amount: number;
    method: PaymentMethod;
    reference?: string;
    receiver?: string;
    reconciliation_note?: string;
  },
  idempotencyKey: string,
): Promise<PaymentRead> {
  const payload: PaymentCreate = { amount: input.amount, method: input.method };
  if (input.reference !== undefined) payload.reference = input.reference;
  if (input.receiver !== undefined) payload.receiver = input.receiver;
  if (input.reconciliation_note !== undefined) payload.reconciliation_note = input.reconciliation_note;
  const response = await http.post<PaymentRead>(`/charges/${chargeId}/payments`, payload, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
  return response.data;
}

export async function listAllPayments(params?: {
  charge_id?: number;
  method?: PaymentMethod;
  verification_status?: PaymentVerificationStatus;
  paid_from?: string;
  paid_to?: string;
}): Promise<PaymentRead[]> {
  const response = await http.get<PaymentRead[]>("/payments", { params });
  return response.data;
}

export async function verifyPayment(
  paymentId: number,
  input: { reconciliation_note?: string },
  idempotencyKey: string,
): Promise<PaymentRead> {
  const payload: components["schemas"]["PaymentVerify"] = {};
  if (input.reconciliation_note !== undefined) payload.reconciliation_note = input.reconciliation_note;
  const response = await http.post<PaymentRead>(`/payments/${paymentId}/verify`, payload, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
  return response.data;
}

// --- collection follow-ups --------------------------------------------------

export async function listFollowUps(params?: {
  state?: "open" | "closed";
  active?: boolean;
  due_on_or_before?: string;
  patient_id?: number;
  location_id?: number;
}): Promise<ChargeFollowUpRead[]> {
  const response = await http.get<ChargeFollowUpRead[]>("/follow-ups", { params });
  return response.data;
}

export async function listChargeFollowUps(chargeId: number): Promise<ChargeFollowUpRead[]> {
  const response = await http.get<ChargeFollowUpRead[]>(`/charges/${chargeId}/follow-ups`);
  return response.data;
}

export async function openFollowUp(
  chargeId: number,
  input: { next_follow_up_on: string; note?: string },
  idempotencyKey: string,
): Promise<ChargeFollowUpRead> {
  const response = await http.post<ChargeFollowUpRead>(`/charges/${chargeId}/follow-ups`, input, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
  return response.data;
}

export async function rescheduleFollowUp(
  followUpId: number,
  input: { next_follow_up_on: string; note?: string },
  idempotencyKey: string,
): Promise<ChargeFollowUpRead> {
  const response = await http.post<ChargeFollowUpRead>(`/follow-ups/${followUpId}/reschedule`, input, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
  return response.data;
}

export async function closeFollowUp(
  followUpId: number,
  input: { note?: string },
  idempotencyKey: string,
): Promise<ChargeFollowUpRead> {
  const response = await http.post<ChargeFollowUpRead>(`/follow-ups/${followUpId}/close`, input, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
  return response.data;
}

export async function listExecutions(params?: {
  visit_id?: number;
  patient_id?: number;
  charged?: boolean;
  executed_from?: string;
  executed_to?: string;
}): Promise<ServiceExecutionRead[]> {
  const response = await http.get<ServiceExecutionRead[]>("/executions", { params });
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

// --- appointment proposals: confirm/decline (inbox source "appointment_proposal") ---

export async function confirmAppointmentProposal(
  body: AppointmentProposalConfirm,
  idempotencyKey: string,
): Promise<AppointmentProposalRead> {
  const payload: AppointmentProposalConfirm = { conversation_id: body.conversation_id, confirmation_token: body.confirmation_token };
  const response = await http.post<AppointmentProposalRead>(
    "/scheduling/appointment-proposals/confirm",
    payload,
    { headers: { "Idempotency-Key": idempotencyKey } },
  );
  return response.data;
}

export async function declineAppointmentProposal(
  body: AppointmentProposalDecline,
  idempotencyKey: string,
): Promise<AppointmentProposalRead> {
  const payload: AppointmentProposalDecline = { conversation_id: body.conversation_id, confirmation_token: body.confirmation_token };
  const response = await http.post<AppointmentProposalRead>(
    "/scheduling/appointment-proposals/decline",
    payload,
    { headers: { "Idempotency-Key": idempotencyKey } },
  );
  return response.data;
}

// --- who is signed in ---------------------------------------------------------

export async function getMe(): Promise<MeRead> {
  const response = await http.get<MeRead>("/me");
  return response.data;
}

// --- agent proposals inbox ----------------------------------------------------

type InboxQuery = NonNullable<paths["/agent/inbox"]["get"]["parameters"]["query"]>;

export async function listInbox(query: Pick<InboxQuery, "status" | "source" | "kind" | "location_id" | "limit" | "cursor"> = {}): Promise<InboxPage> {
  const params: InboxQuery = {};
  if (query.status) params.status = query.status;
  if (query.source) params.source = query.source;
  if (query.kind) params.kind = query.kind;
  if (query.location_id != null) params.location_id = query.location_id;
  if (query.limit != null) params.limit = query.limit;
  if (query.cursor) params.cursor = query.cursor;
  const response = await http.get<InboxPage>("/agent/inbox", { params });
  return response.data;
}

/** A mutation result plus whether the backend replayed a prior intent
 * (`Idempotent-Replay: true`) instead of executing it again. */
export interface Replayable<T> {
  data: T;
  replayed: boolean;
}

function isReplay(headers: unknown): boolean {
  const value = (headers as Record<string, unknown> | undefined)?.["idempotent-replay"];
  return String(value ?? "").toLowerCase() === "true";
}

export async function approveProposal(
  proposalId: number,
  payloadHash: string,
  idempotencyKey: string,
): Promise<Replayable<InboxItem>> {
  const payload: ProposalApprove = { payload_hash: payloadHash };
  const response = await http.post<InboxItem>(
    `/agent/proposals/${proposalId}/approve`,
    payload,
    { headers: { "Idempotency-Key": idempotencyKey } },
  );
  return { data: response.data, replayed: isReplay(response.headers) };
}

/** Decline is idempotent on the backend (a declined row stays declined); the
 * intent key is still sent so every mutation carries one. */
export async function declineProposal(proposalId: number, idempotencyKey: string): Promise<InboxItem> {
  const response = await http.post<InboxItem>(
    `/agent/proposals/${proposalId}/decline`,
    null,
    { headers: { "Idempotency-Key": idempotencyKey } },
  );
  return response.data;
}

// --- agent runs ("Ejecutar ahora") --------------------------------------------

export async function createAgentRun(agentKey: AgentRunCreate["agent_key"], idempotencyKey: string): Promise<Replayable<AgentRunOut>> {
  const payload: AgentRunCreate = { agent_key: agentKey };
  const response = await http.post<AgentRunOut>("/agent-runs", payload, { headers: { "Idempotency-Key": idempotencyKey } });
  return { data: response.data, replayed: isReplay(response.headers) };
}

/** Backfill tick. Safe to repeat (unique job keys + leases); the key is sent
 * for consistency with every other mutation. */
export async function runDueAgentJobs(idempotencyKey: string, limit?: number): Promise<JobsRunOut> {
  const payload: Partial<JobsRunDue> = limit == null ? {} : { limit };
  const response = await http.post<JobsRunOut>("/agent-runs/jobs/run-due", payload, { headers: { "Idempotency-Key": idempotencyKey } });
  return response.data;
}
