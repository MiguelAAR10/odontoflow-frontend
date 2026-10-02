import { USE_MOCKS } from "./env";
import {
  appointments,
  conversations,
  mockBalances,
  mockCharges,
  mockExecutions,
  mockLocations,
  mockMovements,
  mockProducts,
  mockServices,
  mockVisits,
  patients,
} from "./mockData";
import { mockFollowUps } from "./mockData";
import {
  ApiError,
  bookAppointment as bookAppointmentReal,
  cancelAppointment as cancelAppointmentReal,
  createCharge as createChargeReal,
  createPatient as createPatientReal,
  createPayment as createPaymentReal,
  createProduct as createProductReal,
  createServiceExecution as createServiceExecutionReal,
  createVisit as createVisitReal,
  getAppointment as getAppointmentReal,
  getBalance as getBalanceReal,
  getVisit as getVisitReal,
  http,
  listAppointments as listAppointmentsReal,
  listCharges as listChargesReal,
  listEligiblePractitioners as listEligiblePractitionersReal,
  listLeads as listLeadsReal,
  listLocations as listLocationsReal,
  listMovements as listMovementsReal,
  listPatients as listPatientsReal,
  listPayments as listPaymentsReal,
  listProducts as listProductsReal,
  listServices as listServicesReal,
  listVisitExecutions as listVisitExecutionsReal,
  listVisits as listVisitsReal,
  newIdempotencyKey,
  querySlots as querySlotsReal,
  registerAdjustment as registerAdjustmentReal,
  registerEntry as registerEntryReal,
  registerTransfer as registerTransferReal,
  rescheduleAppointment as rescheduleAppointmentReal,
  toApiError,
  type AppointmentListItem,
  type AppointmentRead,
  type BalanceRead,
  type ChargeRead,
  type LeadRead,
  type LocationRead,
  type MovementRead,
  type PatientRead,
  type PaymentRead,
  type PaymentMethod,
  type PaymentVerificationStatus,
  type ServiceExecutionRead,
  type VisitDetailRead,
  type VisitRead,
  type PractitionerRead,
  type ProductRead,
  type ServiceRead,
  type SlotResult,
  type TransferRead,
} from "./contracts/client";
import {
  closeFollowUp as closeFollowUpReal,
  listAllPayments as listAllPaymentsReal,
  listChargeFollowUps as listChargeFollowUpsReal,
  listExecutions as listExecutionsReal,
  listFollowUps as listFollowUpsReal,
  openFollowUp as openFollowUpReal,
  rescheduleFollowUp as rescheduleFollowUpReal,
  verifyPayment as verifyPaymentReal,
  type ChargeFollowUpRead,
} from "./contracts/client";
import type {
  Appointment,
  Charge,
  ChatMessage,
  Conversation,
  InventoryBalance,
  InventoryLocation,
  InventoryMovement,
  InventoryTransfer,
  NewAppointmentInput,
  Patient,
  Payment,
  Product,
  ServiceExecution,
  ServiceOption,
  Visit,
} from "./types";
import type { ChargeFollowUp, PatientVisitHistory, UnchargedExecution } from "./types";
import type { HomePatient } from "./home/types";
import { DIGITAL_METHODS, PAYMENT_METHOD_LABEL, isDigitalPaymentMethod } from "./ui";

/** Same instance as the typed client's transport: one base URL, one place to configure. */
export const api = http;

const useMocks = USE_MOCKS;
export { useMocks, ApiError, toApiError, newIdempotencyKey };
const copy = <T,>(value: T): T => structuredClone(value);

async function getOrMock<T>(path: string, fallback: T): Promise<T> {
  if (useMocks) return copy(fallback);
  const response = await api.get<T>(path);
  return response.data;
}

// --- agenda real-mode view model --------------------------------------------

/** Map the backend's UTC instant to the agenda grid (Mon=0..Sat=5, "HH:MM"),
 * using the location's IANA timezone. */
export function toGridSlot(startUtc: string, timeZone: string): { day: number; time: string } {
  const date = new Date(startUtc);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const dayNames: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return { day: dayNames[weekday] ?? 0, time: `${hour}:${minute}` };
}

/** Map the backend domain state into the agenda's UI status vocabulary. */
export function toUiStatus(state: string): Appointment["status"] {
  if (state === "confirmed") return "Confirmada";
  if (state === "cancelled") return "Cancelada";
  return "Por confirmar";
}

export function toUiAppointment(
  item: AppointmentListItem,
  timeZoneByLocation: Map<number, string>,
): Appointment {
  const timeZone = timeZoneByLocation.get(item.location_id) ?? "America/Lima";
  const slot = toGridSlot(item.start_utc, timeZone);
  return {
    id: String(item.id),
    day: slot.day,
    time: slot.time,
    patient: item.patient_name ?? item.lead_name,
    treatment: item.service_name,
    doctor: item.practitioner_name,
    branch: item.location_name,
    status: toUiStatus(item.state),
    leadId: item.lead_id,
    serviceId: item.service_id,
    locationId: item.location_id,
    practitionerId: item.practitioner_id,
    ...(item.patient_id != null ? { patientId: item.patient_id } : {}),
    ...(item.patient_name != null ? { patientName: item.patient_name } : {}),
    startUtc: item.start_utc,
    endUtc: item.end_utc,
    timeZone,
  };
}

/** Monday 00:00 (Lima) of the current week, as a UTC instant — the agenda
 * window is the half-open [weekStart, weekStart + 7 days). */
export function currentWeekWindow(timeZone = "America/Lima"): { from: string; to: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  const localMidnight = new Date(Date.UTC(y, m - 1, d));
  const weekday = (localMidnight.getUTCDay() + 6) % 7; // Mon=0
  const monday = new Date(localMidnight.getTime() - weekday * 86_400_000);
  const nextMonday = new Date(monday.getTime() + 7 * 86_400_000);
  return { from: monday.toISOString(), to: nextMonday.toISOString() };
}

/** Patient search uses the typed contract in real mode so the topbar never
 * receives raw PatientRead rows as if they were the UI view model. */
export const getPatients = (): Promise<Patient[]> => (useMocks ? Promise.resolve(copy(patients)) : loadPatients());

/** Map the backend PatientRead into the UI patient view model. */
export function toUiPatient(row: {
  id: number;
  full_name: string;
  dni: string | null;
  sexo: string | null;
  phone: string | null;
  birth_date: string | null;
}): Patient {
  const name = row.full_name;
  return {
    id: String(row.id),
    initials: name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
    name,
    dni: row.dni ?? "",
    phone: row.phone ?? "",
    branch: "",
    nextAppointment: "Sin cita",
    treatment: "Por definir",
    status: "Activo",
    tone: "cyan",
    origin: "Registro clínico",
    interest: "Por validar",
  };
}

export async function loadPatients(search?: string): Promise<Patient[]> {
  if (useMocks) {
    const normalized = search?.trim().toLowerCase();
    return copy(normalized
      ? patients.filter((patient) => [patient.name, patient.dni, patient.phone].some((value) => value.toLowerCase().includes(normalized)))
      : patients);
  }
  const rows = await listPatientsReal(search);
  return rows.map(toUiPatient);
}

/**
 * Home patient search keeps the canonical identity projection narrow. It
 * reuses the same mock seam as the rest of the app, while real mode calls the
 * typed /patients adapter with the entered search string.
 */
export function toUiPatientSearch(row: Pick<PatientRead, "id" | "full_name" | "dni" | "phone">): HomePatient {
  return { id: String(row.id), name: row.full_name, dni: row.dni, phone: row.phone };
}

function toMockPatientSearch(patient: Patient): HomePatient {
  return { id: patient.id, name: patient.name, dni: patient.dni || null, phone: patient.phone || null };
}

export async function searchPatients(search?: string): Promise<HomePatient[]> {
  const query = search?.trim() ?? "";
  if (useMocks) {
    const normalized = query.toLowerCase();
    const rows = await getPatients();
    return rows
      .filter((patient) => !normalized || [patient.name, patient.dni, patient.phone].some((value) => value.toLowerCase().includes(normalized)))
      .map(toMockPatientSearch);
  }
  const rows = await listPatientsReal(query || undefined);
  return rows.map(toUiPatientSearch);
}

/** Canonical patient create used by attendance qualification. */
export async function createPatientRecord(input: {
  full_name: string;
  dni?: string;
  phone?: string;
}, idempotencyKey: string): Promise<Patient> {
  if (useMocks) {
    const fingerprint = `patient:${JSON.stringify(input)}`;
    const replay = readMockReceipt<Patient>(idempotencyKey, fingerprint);
    if (replay) return replay;
    const name = input.full_name.trim();
    if (!name) throw new ApiError(422, "INVALID_INPUT", "El nombre completo es obligatorio.");
    const saved: Patient = {
      id: `patient-${Date.now()}`,
      initials: name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
      name,
      dni: input.dni?.trim() ?? "",
      phone: input.phone?.trim() ?? "",
      branch: "",
      nextAppointment: "Sin cita",
      treatment: "Por definir",
      status: "Activo",
      tone: "cyan",
      origin: "Registro clínico",
      interest: "Por validar",
    };
    patients.unshift(saved);
    saveMockReceipt(idempotencyKey, fingerprint, saved);
    return copy(saved);
  }
  return toUiPatient(await createPatientReal({
    full_name: input.full_name,
    ...(input.dni !== undefined ? { dni: input.dni } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
  }, idempotencyKey));
}

export async function createPatient(input: Omit<Patient, "id" | "initials" | "tone"> & { idempotencyKey?: string }): Promise<Patient> {
  if (useMocks) {
    const saved: Patient = {
      id: `patient-${Date.now()}`,
      initials: input.name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
      name: input.name,
      dni: input.dni,
      phone: input.phone,
      branch: input.branch,
      nextAppointment: input.nextAppointment,
      treatment: input.treatment,
      status: input.status,
      tone: "cyan",
      origin: input.origin,
      interest: input.interest,
    };
    patients.unshift(saved);
    return copy(saved);
  }
  // Real mode: only the backend-supported fields are sent; the rest of the UI
  // shape is derived (no invented Patient fields).
  const created = await createPatientReal(
    { full_name: input.name, dni: input.dni || null, phone: input.phone || null },
    input.idempotencyKey ?? newIdempotencyKey(),
  );
  return toUiPatient(created);
}

export const getAppointments = () => getOrMock<Appointment[]>("/appointments", appointments);

/** Agenda read in real mode: the week window from the backend, mapped to the
 * grid view model. Mock mode keeps the original behaviour. */
export async function loadAgenda(filters?: { locationId?: number; from?: string; to?: string }): Promise<Appointment[]> {
  if (useMocks) return copy(appointments);
  const window = currentWeekWindow();
  const [rows, locations] = await Promise.all([
    listAppointmentsReal({ from_date: filters?.from ?? window.from, to_date: filters?.to ?? window.to, location_id: filters?.locationId }),
    listLocationsReal(),
  ]);
  const timeZoneByLocation = new Map(locations.map((l) => [l.id, l.timezone]));
  return rows.map((row) => toUiAppointment(row, timeZoneByLocation));
}

export async function getAgendaDetail(appointmentId: number): Promise<AppointmentListItem> {
  return getAppointmentReal(appointmentId);
}

export async function createAppointment(input: NewAppointmentInput): Promise<Appointment> {
  if (useMocks) {
    const day = (new Date(`${input.date}T12:00:00Z`).getUTCDay() + 6) % 7;
    const saved: Appointment = {
      id: `appointment-${Date.now()}`,
      patient: input.patient,
      treatment: input.treatment,
      doctor: input.doctor,
      branch: input.branch,
      time: input.time,
      day,
      status: "Por confirmar",
      startUtc: new Date(`${input.date}T${input.time}:00-05:00`).toISOString(),
      timeZone: "America/Lima",
    };
    appointments.push(saved);
    return copy(saved);
  }
  // Real mode: the modal submits ids + date/time; this adapter renders the
  // backend's confirmation into the grid view model.
  const real = input as NewAppointmentInput & {
    lead_id: number;
    service_id: number;
    location_id: number;
    practitioner_id: number;
    idempotencyKey: string;
  };
  const start = new Date(`${input.date}T${input.time}:00`);
  const booked = await bookAppointmentReal(
    {
      lead_id: real.lead_id,
      service_id: real.service_id,
      location_id: real.location_id,
      practitioner_id: real.practitioner_id,
      start: start.toISOString(),
    },
    real.idempotencyKey,
  );
  return {
    id: String(booked.id),
    day: toGridSlot(booked.start_utc, "America/Lima").day,
    time: toGridSlot(booked.start_utc, "America/Lima").time,
    patient: input.patient,
    treatment: input.treatment,
    doctor: input.doctor,
    branch: input.branch,
    status: toUiStatus(booked.state),
  };
}

// --- real-mode selector data + mutations (Agenda vertical) ------------------

/** Design-mode editing. Real mode exposes only the contracted reschedule/cancel actions. */
export async function editDemoAppointment(id: string, input: NewAppointmentInput): Promise<Appointment> {
  if (!useMocks) throw new Error("Usa reprogramar para modificar una cita conectada al backend.");
  const appointment = appointments.find((item) => item.id === id);
  if (!appointment) throw new Error("Cita no encontrada.");
  const startUtc = new Date(`${input.date}T${input.time}:00-05:00`).toISOString();
  const durationMs = appointment.startUtc && appointment.endUtc ? new Date(appointment.endUtc).getTime() - new Date(appointment.startUtc).getTime() : 3600000;
  const endUtc = new Date(new Date(startUtc).getTime() + durationMs).toISOString();
  if (appointments.some((item) => {
    if (item.id === id || item.status === "Cancelada" || item.doctor !== input.doctor) return false;
    const fixtureDate = new Date(new Date(currentWeekWindow().from).getTime() + item.day * 86400000).toISOString().slice(0, 10);
    const otherStart = new Date(item.startUtc ?? `${fixtureDate}T${item.time}:00-05:00`).getTime();
    const otherEnd = item.endUtc ? new Date(item.endUtc).getTime() : otherStart + 3600000;
    const editedStart = new Date(startUtc).getTime();
    return editedStart < otherEnd && editedStart + durationMs > otherStart;
  })) {
    throw new Error("El odontólogo ya tiene una cita en este horario.");
  }
  Object.assign(appointment, { patient: input.patient, treatment: input.treatment, doctor: input.doctor, branch: input.branch, time: input.time, startUtc, endUtc, timeZone: "America/Lima", day: (new Date(`${input.date}T12:00:00Z`).getUTCDay() + 6) % 7 });
  return copy(appointment);
}

export async function deleteDemoAppointment(id: string): Promise<void> {
  if (!useMocks) throw new Error("El backend permite cancelar citas, no eliminarlas.");
  const index = appointments.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("Cita no encontrada.");
  appointments.splice(index, 1);
}

export function getLeads(search?: string): Promise<LeadRead[]> {
  return listLeadsReal(search);
}

export function getLocations(): Promise<LocationRead[]> {
  return listLocationsReal();
}

export function getServices(): Promise<ServiceRead[]> {
  return listServicesReal();
}

export function getEligiblePractitioners(serviceId: number, locationId: number): Promise<PractitionerRead[]> {
  return listEligiblePractitionersReal(serviceId, locationId);
}

export function getSlots(input: {
  service_id: number;
  location_id: number;
  window_start: string;
  window_end: string;
}): Promise<SlotResult[]> {
  return querySlotsReal(input);
}

export function bookReal(input: {
  lead_id: number;
  service_id: number;
  location_id: number;
  practitioner_id: number;
  start: string;
}, idempotencyKey: string): Promise<AppointmentRead> {
  return bookAppointmentReal(input, idempotencyKey);
}

export function rescheduleReal(appointmentId: number, newStart: string, idempotencyKey: string): Promise<AppointmentRead> {
  return rescheduleAppointmentReal(appointmentId, newStart, idempotencyKey);
}

export function cancelReal(appointmentId: number, idempotencyKey: string): Promise<AppointmentRead> {
  return cancelAppointmentReal(appointmentId, idempotencyKey);
}

// --- FE3A service-to-cash view models and adapters --------------------------

const round2 = (value: number): number => Math.round(value * 100) / 100;
const PAYMENT_METHODS: readonly PaymentMethod[] = ["efectivo", "tarjeta", "yape", "plin", "transferencia", "link_pago"];
const PAYMENT_VERIFICATION_STATUSES: readonly PaymentVerificationStatus[] = ["unverified", "verified"];

/** Parse the backend decimal string into a 2-decimal number. */
export function toMoneyNumber(value: string | number): number {
  return round2(Number(value));
}

/** Format the backend's location-owned calendar date without a UTC shift. */
export function clinicToday(timeZone = "America/Lima", now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)?.value ?? "00").join("-");
}

export function isActiveFollowUp(followUp: ChargeFollowUp): boolean {
  return followUp.state === "open" && followUp.chargeOutstanding > 0;
}

/** Map the backend PaymentRead into the UI payment view model. */
export function toUiPayment(row: PaymentRead): Payment {
  return {
    id: String(row.id),
    chargeId: row.charge_id,
    amount: toMoneyNumber(row.amount),
    method: row.method,
    paidAt: row.paid_at,
    reference: row.reference,
    receiver: row.receiver,
    reconciliationNote: row.reconciliation_note,
    verificationStatus: row.verification_status,
    verifiedAt: row.verified_at,
  };
}

/** Map a canonical ChargeRead (+ its payments) into a cash view model. */
export function toUiCharge(row: ChargeRead, payments: PaymentRead[] = [], locationTimeZone?: string): Charge {
  const amount = toMoneyNumber(row.amount);
  const paid = toMoneyNumber(row.paid);
  const outstanding = toMoneyNumber(row.outstanding);
  return {
    id: String(row.id),
    serviceExecutionId: row.service_execution_id,
    amount,
    paid,
    outstanding,
    createdAt: row.created_at,
    payments: payments.map(toUiPayment),
    status: outstanding <= 0.004 ? "Pagado" : paid <= 0.004 ? "Pendiente" : "Parcial",
    visitId: row.visit_id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    serviceId: row.service_id,
    serviceName: row.service_name,
    locationId: row.location_id,
    locationName: row.location_name,
    practitionerId: row.practitioner_id,
    practitionerName: row.practitioner_name,
    executedAt: row.executed_at,
    ...(locationTimeZone ? { locationTimeZone } : {}),
  };
}

export function toUiExecution(row: ServiceExecutionRead, locationName?: string): ServiceExecution {
  return {
    id: String(row.id),
    visitId: row.visit_id,
    serviceId: row.service_id,
    serviceName: row.service_name,
    executedPrice: toMoneyNumber(row.executed_price),
    executedAt: row.executed_at,
    chargeId: row.charge_id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    locationId: row.location_id,
    ...(locationName ? { locationName } : {}),
  };
}

export function toUiVisit(row: VisitRead | VisitDetailRead): Visit {
  const executions = "executions" in row ? row.executions.map((execution) => toUiExecution(execution)) : [];
  return {
    id: String(row.id),
    patientId: row.patient_id,
    patientName: row.patient_name,
    appointmentId: row.appointment_id,
    practitionerId: row.practitioner_id,
    practitionerName: row.practitioner_name,
    locationId: row.location_id,
    locationName: row.location_name,
    startedAt: row.started_at,
    executions,
  };
}

/** 'Por cobrar': a derived subtotal over canonical rows currently loaded. */
export function sumOutstanding(charges: Charge[]): number {
  return round2(charges.reduce((total, charge) => total + charge.outstanding, 0));
}

/** 'Cobrado': a derived subtotal over canonical rows currently loaded. */
export function sumPaid(charges: Charge[]): number {
  return round2(charges.reduce((total, charge) => total + charge.paid, 0));
}

export async function loadCharges(params?: Parameters<typeof listChargesReal>[0]): Promise<Charge[]> {
  if (useMocks) {
    const rows = params?.execution_id == null
      ? mockCharges
      : mockCharges.filter((charge) => charge.serviceExecutionId === Number(params.execution_id));
    return copy(rows);
  }
  const [rows, locations] = await Promise.all([listChargesReal(params), listLocationsReal()]);
  const timeZoneByLocation = new Map(locations.map((location) => [location.id, location.timezone]));
  const withPayments = await Promise.all(rows.map(async (charge) => [charge, await listPaymentsReal(charge.id)] as const));
  return withPayments.map(([charge, payments]) => toUiCharge(charge, payments, timeZoneByLocation.get(charge.location_id)));
}

export async function loadVisit(visitId: string | number): Promise<Visit> {
  if (useMocks) {
    const visit = mockVisits.find((item) => item.id === String(visitId));
    if (!visit) throw new ApiError(404, "NOT_FOUND", "Visit not found.");
    return copy(visit);
  }
  return toUiVisit(await getVisitReal(Number(visitId)));
}

export async function loadVisits(params?: { patient_id?: number }): Promise<Visit[]> {
  if (useMocks) {
    const rows = params?.patient_id == null
      ? mockVisits
      : mockVisits.filter((visit) => String(visit.patientId) === String(params.patient_id));
    return copy(rows);
  }
  return (await listVisitsReal(params)).map(toUiVisit);
}

export async function loadVisitExecutions(visitId: string | number): Promise<ServiceExecution[]> {
  if (useMocks) {
    const rows = mockExecutions.filter((execution) => String(execution.visitId) === String(visitId));
    return copy(rows);
  }
  return (await listVisitExecutionsReal(Number(visitId))).map((row) => toUiExecution(row));
}

export async function loadServiceOptions(): Promise<ServiceOption[]> {
  if (useMocks) return copy(mockServices);
  return (await listServicesReal()).map((service) => ({ id: service.id, name: service.name, durationMinutes: service.duration_minutes, isActive: service.is_active }));
}

export async function createVisitRecord(
  input: { patient_id: number | string; appointment_id?: number | string; practitioner_id?: number; location_id?: number },
  idempotencyKey: string,
): Promise<Visit> {
  if (!useMocks) {
    const realInput = {
      patient_id: Number(input.patient_id),
      ...(input.appointment_id !== undefined ? { appointment_id: Number(input.appointment_id) } : {}),
      ...(input.practitioner_id !== undefined ? { practitioner_id: input.practitioner_id } : {}),
      ...(input.location_id !== undefined ? { location_id: input.location_id } : {}),
    };
    return toUiVisit(await createVisitReal(realInput, idempotencyKey));
  }
  const replay = readMockReceipt<Visit>(idempotencyKey, `visit:${JSON.stringify(input)}`);
  if (replay) return replay;
  const patient = patients.find((item) => item.id === String(input.patient_id));
  if (!patient) throw new ApiError(404, "NOT_FOUND", "Patient not found.");
  let appointment: Appointment | undefined;
  if (input.appointment_id !== undefined) {
    appointment = appointments.find((item) => item.id === String(input.appointment_id));
    if (!appointment) throw new ApiError(404, "NOT_FOUND", "Appointment not found.");
    if (appointment.status !== "Confirmada") throw new ApiError(409, "ENTITY_INACTIVE", "Only a confirmed appointment can originate a visit.");
    if (mockVisits.some((visit) => String(visit.appointmentId) === String(input.appointment_id))) {
      throw new ApiError(422, "INVALID_INPUT", "The appointment already has a visit.");
    }
  }
  const visit: Visit = {
    id: String(++mockVisitSequence),
    patientId: patient.id,
    patientName: patient.name,
    appointmentId: input.appointment_id ?? null,
    practitionerId: appointment?.practitionerId ?? input.practitioner_id ?? 0,
    practitionerName: appointment?.doctor ?? "",
    locationId: appointment?.locationId ?? input.location_id ?? 0,
    locationName: appointment?.branch ?? "",
    startedAt: new Date().toISOString(),
    executions: [],
  };
  mockVisits.push(visit);
  saveMockReceipt(idempotencyKey, `visit:${JSON.stringify(input)}`, visit);
  return copy(visit);
}

export async function createServiceExecutionRecord(
  visitId: string | number,
  input: { service_id: number; executed_price: number },
  idempotencyKey: string,
): Promise<ServiceExecution> {
  if (!useMocks) return toUiExecution(await createServiceExecutionReal(Number(visitId), input, idempotencyKey));
  const replay = readMockReceipt<ServiceExecution>(idempotencyKey, `execution:${visitId}:${JSON.stringify(input)}`);
  if (replay) return replay;
  const visit = mockVisits.find((item) => item.id === String(visitId));
  if (!visit) throw new ApiError(404, "NOT_FOUND", "Visit not found.");
  if (!Number.isFinite(input.executed_price) || input.executed_price < 0) throw new ApiError(422, "INVALID_INPUT", "The executed price must be zero or greater.");
  if (!mockServices.some((service) => service.id === input.service_id && service.isActive)) throw new ApiError(404, "NOT_FOUND", "Service not found.");
  if (visit.executions.some((execution) => execution.serviceId === input.service_id)) throw new ApiError(422, "INVALID_INPUT", "The service has already been executed for this visit.");
  const execution: ServiceExecution = {
    id: String(++mockExecutionSequence),
    visitId: visit.id,
    serviceId: input.service_id,
    serviceName: mockServices.find((service) => service.id === input.service_id)?.name ?? "",
    executedPrice: round2(input.executed_price),
    executedAt: new Date().toISOString(),
    chargeId: null,
    patientId: visit.patientId,
    patientName: visit.patientName,
    locationId: visit.locationId,
    locationName: visit.locationName,
  };
  visit.executions.push(execution);
  mockExecutions.push(execution);
  saveMockReceipt(idempotencyKey, `execution:${visitId}:${JSON.stringify(input)}`, execution);
  return copy(execution);
}

export async function createChargeRecord(
  executionId: string | number,
  input: { amount?: number },
  idempotencyKey: string,
): Promise<Charge> {
  if (!useMocks) return toUiCharge(await createChargeReal(Number(executionId), input, idempotencyKey));
  const replay = readMockReceipt<Charge>(idempotencyKey, `charge:${executionId}:${JSON.stringify(input)}`);
  if (replay) return replay;
  const execution = mockExecutions.find((item) => item.id === String(executionId));
  if (!execution) throw new ApiError(404, "NOT_FOUND", "Service execution not found.");
  if (mockCharges.some((charge) => charge.serviceExecutionId === Number(executionId))) throw new ApiError(422, "INVALID_INPUT", "The execution already has a charge.");
  const amount = input.amount ?? execution.executedPrice;
  if (!Number.isFinite(amount) || amount <= 0) throw new ApiError(422, "INVALID_INPUT", "The charged amount must be positive.");
  const visit = mockVisits.find((item) => item.id === String(execution.visitId));
  if (!visit) throw new ApiError(404, "NOT_FOUND", "Visit not found.");
  const charge: Charge = {
    id: String(++mockChargeSequence),
    serviceExecutionId: Number(executionId),
    amount: round2(amount),
    paid: 0,
    outstanding: round2(amount),
    createdAt: new Date().toISOString(),
    payments: [],
    status: "Pendiente",
    visitId: Number(visit.id),
    patientId: Number(visit.patientId) || 0,
    patientName: visit.patientName,
    serviceId: execution.serviceId,
    serviceName: execution.serviceName,
    locationId: visit.locationId,
    locationName: visit.locationName,
    practitionerId: visit.practitionerId,
    practitionerName: visit.practitionerName,
    executedAt: execution.executedAt,
    locationTimeZone: mockLocations.find((location) => Number(location.id) === visit.locationId)?.timezone,
  };
  mockCharges.push(charge);
  execution.chargeId = Number(charge.id);
  saveMockReceipt(idempotencyKey, `charge:${executionId}:${JSON.stringify(input)}`, charge);
  return copy(charge);
}

type MockReceipt = { fingerprint: string; value: unknown };
const mockReceipts = new Map<string, MockReceipt>();
let mockVisitSequence = 20;
let mockExecutionSequence = 200;
let mockChargeSequence = 20;

function readMockReceipt<T>(key: string, fingerprint: string): T | null {
  const receipt = mockReceipts.get(key);
  if (!receipt) return null;
  if (receipt.fingerprint !== fingerprint) throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED", "The idempotency key was already used by a different request.");
  return copy(receipt.value as T);
}

function saveMockReceipt(key: string, fingerprint: string, value: unknown): void {
  mockReceipts.set(key, { fingerprint, value: copy(value) });
}

export async function loadChargePayments(chargeId: string): Promise<Payment[]> {
  if (useMocks) {
    const charge = mockCharges.find((item) => item.id === chargeId);
    return copy(charge?.payments ?? []);
  }
  return (await listPaymentsReal(Number(chargeId))).map(toUiPayment);
}

export async function loadExecutions(params?: {
  visit_id?: number;
  patient_id?: number;
  charged?: boolean;
  executed_from?: string;
  executed_to?: string;
}): Promise<UnchargedExecution[]> {
  if (useMocks) {
    const rows = mockExecutions.filter((execution) => {
      const charge = mockCharges.find((item) => item.serviceExecutionId === Number(execution.id));
      const charged = charge != null || execution.chargeId != null;
      return (params?.visit_id == null || String(execution.visitId) === String(params.visit_id)) &&
        (params?.patient_id == null || String(execution.patientId) === String(params.patient_id)) &&
        (params?.charged == null || charged === params.charged) &&
        (params?.executed_from == null || execution.executedAt >= params.executed_from) &&
        (params?.executed_to == null || execution.executedAt < params.executed_to);
    });
    return copy(rows as UnchargedExecution[]);
  }
  const [rows, locations] = await Promise.all([listExecutionsReal(params), listLocationsReal()]);
  const locationNameById = new Map(locations.map((location) => [location.id, location.name]));
  return rows.map((row) => toUiExecution(row, locationNameById.get(row.location_id)) as UnchargedExecution);
}

export async function loadUnchargedExecutions(): Promise<UnchargedExecution[]> {
  return loadExecutions({ charged: false });
}

export async function loadCanonicalLocations(): Promise<LocationRead[]> {
  if (useMocks) return copy(mockLocations.map((location) => ({ id: Number(location.id), name: location.name, timezone: location.timezone, is_active: location.isActive })));
  return listLocationsReal();
}

/** Register a payment against a charge; backend remains the financial authority. */
export async function registerPayment(
  chargeId: string,
  input: {
    amount: number;
    method: PaymentMethod;
    reference?: string;
    receiver?: string;
    reconciliation_note?: string;
  },
  idempotencyKey: string,
): Promise<Payment> {
  if (!useMocks) {
    const created = await createPaymentReal(Number(chargeId), input, idempotencyKey);
    return toUiPayment(created);
  }
  const replay = readMockReceipt<Payment>(idempotencyKey, `payment:${chargeId}:${JSON.stringify(input)}`);
  if (replay) return replay;
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new ApiError(422, "INVALID_INPUT", "The payment amount must be greater than zero.");
  }
  if (!PAYMENT_METHODS.includes(input.method)) {
    throw new ApiError(422, "INVALID_INPUT", "The payment method is not supported.");
  }
  const charge = mockCharges.find((item) => item.id === chargeId);
  if (!charge) throw new ApiError(404, "NOT_FOUND", "Charge not found.");
  if (input.amount > charge.outstanding + 0.004) {
    throw new ApiError(422, "INVALID_INPUT", "The payment exceeds the outstanding amount of the charge.");
  }
  const reference = input.reference?.trim();
  if (isDigitalPaymentMethod(input.method) && !reference) {
    throw new ApiError(422, "INVALID_INPUT", "reference is required for yape, plin and transferencia.");
  }
  if (reference && mockCharges.some((item) => item.payments.some((payment) => payment.reference === reference && payment.method === input.method))) {
    throw new ApiError(422, "INVALID_INPUT", "A payment with that operation code already exists.");
  }
  const payment: Payment = {
    id: `payment-${++mockPaymentSequence}`,
    chargeId: Number(charge.id),
    amount: round2(input.amount),
    method: input.method,
    paidAt: new Date().toISOString(),
    reference: reference ?? null,
    receiver: input.receiver ?? null,
    reconciliationNote: input.reconciliation_note ?? null,
    verificationStatus: "unverified",
    verifiedAt: null,
  };
  charge.payments.push(payment);
  charge.paid = round2(charge.paid + payment.amount);
  charge.outstanding = round2(Math.max(0, charge.amount - charge.paid));
  charge.status = charge.outstanding <= 0.004 ? "Pagado" : charge.paid <= 0.004 ? "Pendiente" : "Parcial";
  if (charge.outstanding <= 0.004) settleMockFollowUp(charge.id);
  saveMockReceipt(idempotencyKey, `payment:${chargeId}:${JSON.stringify(input)}`, payment);
  return copy(payment);
}

export async function loadAllPayments(params?: {
  charge_id?: number;
  method?: PaymentMethod;
  verification_status?: PaymentVerificationStatus;
  paid_from?: string;
  paid_to?: string;
}): Promise<Payment[]> {
  if (useMocks) {
    return copy(mockCharges.flatMap((charge) => charge.payments).filter((payment) =>
      (params?.charge_id == null || payment.chargeId === params.charge_id) &&
      (params?.method == null || payment.method === params.method) &&
      (params?.verification_status == null || payment.verificationStatus === params.verification_status) &&
      (params?.paid_from == null || payment.paidAt >= params.paid_from) &&
      (params?.paid_to == null || payment.paidAt < params.paid_to),
    ));
  }
  return (await listAllPaymentsReal(params)).map(toUiPayment);
}

export async function loadReconciliationPayments(): Promise<Payment[]> {
  const payments = await loadAllPayments({ verification_status: "unverified" });
  return payments.filter((payment) => isDigitalPaymentMethod(payment.method));
}

export async function verifyPaymentRecord(
  paymentId: string | number,
  input: { reconciliation_note?: string },
  idempotencyKey: string,
): Promise<Payment> {
  if (!useMocks) return toUiPayment(await verifyPaymentReal(Number(paymentId), input, idempotencyKey));
  const replay = readMockReceipt<Payment>(idempotencyKey, `verify:${paymentId}:${JSON.stringify(input)}`);
  if (replay) return replay;
  const located = findMockPayment(String(paymentId));
  if (!located) throw new ApiError(404, "NOT_FOUND", "Payment not found.");
  if (located.payment.verificationStatus === "verified") {
    throw new ApiError(422, "INVALID_INPUT", "The payment is already verified.");
  }
  located.payment.verificationStatus = "verified";
  located.payment.verifiedAt = new Date().toISOString();
  if (input.reconciliation_note !== undefined) located.payment.reconciliationNote = input.reconciliation_note;
  saveMockReceipt(idempotencyKey, `verify:${paymentId}:${JSON.stringify(input)}`, located.payment);
  return copy(located.payment);
}

export async function loadFollowUps(params?: {
  state?: "open" | "closed";
  active?: boolean;
  due_on_or_before?: string;
  patient_id?: number;
  location_id?: number;
}): Promise<ChargeFollowUp[]> {
  if (useMocks) {
    const rows = mockFollowUps.map((followUp) => refreshMockFollowUpDerived(followUp)).filter((followUp) =>
      (params?.state == null || followUp.state === params.state) &&
      (params?.active == null || isActiveFollowUp(followUp) === params.active) &&
      (params?.due_on_or_before == null || followUp.nextFollowUpOn <= params.due_on_or_before) &&
      (params?.patient_id == null || followUp.patientId === params.patient_id) &&
      (params?.location_id == null || followUp.locationId === params.location_id),
    );
    rows.sort((left, right) => left.nextFollowUpOn.localeCompare(right.nextFollowUpOn) || Number(left.id) - Number(right.id));
    return copy(rows);
  }
  return (await listFollowUpsReal(params)).map(toUiFollowUp);
}

export async function loadChargeFollowUps(chargeId: string | number): Promise<ChargeFollowUp[]> {
  if (useMocks) return copy(mockFollowUps.filter((followUp) => followUp.chargeId === Number(chargeId)).sort((a, b) => b.openedAt.localeCompare(a.openedAt)));
  return (await listChargeFollowUpsReal(Number(chargeId))).map(toUiFollowUp);
}

export async function openFollowUpRecord(
  chargeId: string | number,
  input: { next_follow_up_on: string; note?: string },
  idempotencyKey: string,
): Promise<ChargeFollowUp> {
  if (!useMocks) return toUiFollowUp(await openFollowUpReal(Number(chargeId), input, idempotencyKey));
  const replay = readMockReceipt<ChargeFollowUp>(idempotencyKey, `follow-up:open:${chargeId}:${JSON.stringify(input)}`);
  if (replay) return replay;
  const charge = mockCharges.find((item) => item.id === String(chargeId));
  if (!charge) throw new ApiError(404, "NOT_FOUND", "Charge not found.");
  if (charge.outstanding <= 0) throw new ApiError(422, "INVALID_INPUT", "The charge is already fully paid.");
  if (mockFollowUps.some((followUp) => followUp.chargeId === Number(chargeId) && followUp.state === "open")) {
    throw new ApiError(422, "INVALID_INPUT", "The charge already has an open follow-up.");
  }
  if (input.next_follow_up_on < clinicToday()) throw new ApiError(422, "INVALID_INPUT", "next_follow_up_on cannot be in the past.");
  const followUp: ChargeFollowUp = {
    id: String(++mockFollowUpSequence),
    chargeId: Number(chargeId),
    nextFollowUpOn: input.next_follow_up_on,
    note: input.note ?? null,
    state: "open",
    openedAt: new Date().toISOString(),
    closedAt: null,
    closeReason: null,
    chargeAmount: charge.amount,
    chargePaid: charge.paid,
    chargeOutstanding: charge.outstanding,
    isActiveCase: true,
    patientId: charge.patientId,
    patientName: charge.patientName,
    serviceId: charge.serviceId,
    serviceName: charge.serviceName,
    locationId: charge.locationId,
    locationName: charge.locationName,
    practitionerId: charge.practitionerId,
    practitionerName: charge.practitionerName,
  };
  mockFollowUps.push(followUp);
  saveMockReceipt(idempotencyKey, `follow-up:open:${chargeId}:${JSON.stringify(input)}`, followUp);
  return copy(followUp);
}

export async function rescheduleFollowUpRecord(
  followUpId: string | number,
  input: { next_follow_up_on: string; note?: string },
  idempotencyKey: string,
): Promise<ChargeFollowUp> {
  if (!useMocks) return toUiFollowUp(await rescheduleFollowUpReal(Number(followUpId), input, idempotencyKey));
  const replay = readMockReceipt<ChargeFollowUp>(idempotencyKey, `follow-up:reschedule:${followUpId}:${JSON.stringify(input)}`);
  if (replay) return replay;
  const followUp = mockFollowUps.find((item) => item.id === String(followUpId));
  if (!followUp) throw new ApiError(404, "NOT_FOUND", "Follow-up not found.");
  if (followUp.state !== "open") throw new ApiError(409, "ENTITY_INACTIVE", "The follow-up is closed.");
  if (input.next_follow_up_on < clinicToday()) throw new ApiError(422, "INVALID_INPUT", "next_follow_up_on cannot be in the past.");
  followUp.nextFollowUpOn = input.next_follow_up_on;
  followUp.note = input.note ?? null;
  saveMockReceipt(idempotencyKey, `follow-up:reschedule:${followUpId}:${JSON.stringify(input)}`, followUp);
  return copy(followUp);
}

export async function closeFollowUpRecord(
  followUpId: string | number,
  input: { note?: string },
  idempotencyKey: string,
): Promise<ChargeFollowUp> {
  if (!useMocks) return toUiFollowUp(await closeFollowUpReal(Number(followUpId), input, idempotencyKey));
  const replay = readMockReceipt<ChargeFollowUp>(idempotencyKey, `follow-up:close:${followUpId}:${JSON.stringify(input)}`);
  if (replay) return replay;
  const followUp = mockFollowUps.find((item) => item.id === String(followUpId));
  if (!followUp) throw new ApiError(404, "NOT_FOUND", "Follow-up not found.");
  if (followUp.state !== "open") throw new ApiError(409, "ENTITY_INACTIVE", "The follow-up is closed.");
  followUp.state = "closed";
  followUp.closedAt = new Date().toISOString();
  followUp.closeReason = "closed_by_operator";
  if (input.note) followUp.note = followUp.note ? `${followUp.note}\n${input.note}` : input.note;
  followUp.isActiveCase = false;
  saveMockReceipt(idempotencyKey, `follow-up:close:${followUpId}:${JSON.stringify(input)}`, followUp);
  return copy(followUp);
}

export async function loadPatientHistory(patientId: string): Promise<PatientVisitHistory[]> {
  const visits = await loadVisits(useMocks ? undefined : { patient_id: Number(patientId) });
  const matching = useMocks ? visits.filter((visit) => String(visit.patientId) === patientId) : visits;
  return Promise.all(matching.map(async (visit) => {
    const detailed = visit.executions.length ? visit : await loadVisit(visit.id);
    const executions = await Promise.all(detailed.executions.map(async (execution) => {
      const charges = await loadCharges({ execution_id: Number(execution.id) });
      const charge = charges[0] ?? null;
      const followUps = charge ? await loadChargeFollowUps(charge.id) : [];
      return { ...execution, charge, followUp: followUps.find((followUp) => followUp.state === "open") ?? followUps[0] ?? null };
    }));
    return { visit: detailed, executions };
  }));
}

export function toUiFollowUp(row: ChargeFollowUpRead): ChargeFollowUp {
  return {
    id: String(row.id),
    chargeId: row.charge_id,
    nextFollowUpOn: row.next_follow_up_on,
    note: row.note,
    state: row.state,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    closeReason: row.close_reason,
    chargeAmount: toMoneyNumber(row.charge_amount),
    chargePaid: toMoneyNumber(row.charge_paid),
    chargeOutstanding: toMoneyNumber(row.charge_outstanding),
    isActiveCase: row.is_active_case,
    patientId: row.patient_id,
    patientName: row.patient_name,
    serviceId: row.service_id,
    serviceName: row.service_name,
    locationId: row.location_id,
    locationName: row.location_name,
  };
}

let mockPaymentSequence = 10;
let mockFollowUpSequence = 20;

function findMockPayment(paymentId: string): { charge: Charge; payment: Payment } | null {
  for (const charge of mockCharges) {
    const payment = charge.payments.find((item) => item.id === paymentId);
    if (payment) return { charge, payment };
  }
  return null;
}

function refreshMockFollowUpDerived(followUp: ChargeFollowUp): ChargeFollowUp {
  const charge = mockCharges.find((item) => item.id === String(followUp.chargeId));
  if (!charge) return followUp;
  followUp.chargeAmount = charge.amount;
  followUp.chargePaid = charge.paid;
  followUp.chargeOutstanding = charge.outstanding;
  followUp.isActiveCase = isActiveFollowUp(followUp);
  return followUp;
}

function settleMockFollowUp(chargeId: string): void {
  const followUp = mockFollowUps.find((item) => item.chargeId === Number(chargeId) && item.state === "open");
  if (!followUp) return;
  followUp.state = "closed";
  followUp.closedAt = new Date().toISOString();
  followUp.closeReason = "settled";
  followUp.isActiveCase = false;
}

// --- real inventory view model (M4.3: Product × Location stock) -------------

/** Map the backend ProductRead into the UI product view model. The backend
 * projects no category/branch/stock/minimum — only name/unit/kind/is_active. */
export function toUiProduct(row: ProductRead): Product {
  return {
    id: String(row.id),
    name: row.name,
    unit: row.unit,
    kind: row.kind as Product["kind"],
    status: row.is_active ? "Activo" : "Inactivo",
  };
}

/** Map the backend LocationRead into the UI location view model. */
export function toUiLocation(row: LocationRead): InventoryLocation {
  return { id: String(row.id), name: row.name, timezone: row.timezone, isActive: row.is_active };
}

/** Map the backend BalanceRead (decimal string available) into the UI balance. */
export function toUiBalance(row: BalanceRead): InventoryBalance {
  return { productId: String(row.product_id), locationId: String(row.location_id), available: toMoneyNumber(row.available) };
}

/** Map the backend MovementRead into the UI kardex view model. */
export function toUiMovement(row: MovementRead): InventoryMovement {
  return {
    id: String(row.id),
    productId: String(row.product_id),
    locationId: String(row.location_id),
    type: row.type as InventoryMovement["type"],
    quantity: toMoneyNumber(row.quantity),
    unitPrice: row.unit_price != null ? toMoneyNumber(row.unit_price) : null,
    reason: row.reason,
    transferId: row.transfer_id,
    movedAt: row.moved_at,
  };
}

/** Map the backend TransferRead into the UI transfer view model. */
export function toUiTransfer(row: TransferRead): InventoryTransfer {
  return {
    transferId: row.transfer_id,
    productId: String(row.product_id),
    originLocationId: String(row.origin_location_id),
    destinationLocationId: String(row.destination_location_id),
    quantity: toMoneyNumber(row.quantity),
    reason: row.reason,
    outMovementId: row.out_movement_id,
    inMovementId: row.in_movement_id,
  };
}

/** 'Unidades en stock' KPI: Σ available over the real balances. */
export function sumAvailable(balances: InventoryBalance[]): number {
  return round2(balances.reduce((total, balance) => total + balance.available, 0));
}

export async function loadInventoryData(): Promise<{ products: Product[]; locations: InventoryLocation[] }> {
  if (useMocks) return copy({ products: mockProducts, locations: mockLocations });
  const [productRows, locationRows] = await Promise.all([listProductsReal(), listLocationsReal()]);
  return { products: productRows.map(toUiProduct), locations: locationRows.map(toUiLocation) };
}

export async function loadProductBalance(productId: string, locationId: string): Promise<InventoryBalance> {
  if (useMocks) {
    const balance = mockBalances.find((item) => item.productId === productId && item.locationId === locationId);
    return copy(balance ?? { productId, locationId, available: 0 });
  }
  return toUiBalance(await getBalanceReal(Number(productId), Number(locationId)));
}

/** Kardex of one product at one location, newest first (same in both modes). */
export async function loadMovements(productId: string, locationId: string): Promise<InventoryMovement[]> {
  const sortNewest = (rows: InventoryMovement[]): InventoryMovement[] =>
    [...rows].sort((a, b) => b.movedAt.localeCompare(a.movedAt));
  if (useMocks) {
    const rows = mockMovements.filter((item) => item.productId === productId && item.locationId === locationId);
    return copy(sortNewest(rows));
  }
  return sortNewest((await listMovementsReal(Number(productId), Number(locationId))).map(toUiMovement));
}

export async function createProduct(
  input: { name: string; unit: string; kind: Product["kind"] },
  idempotencyKey: string,
): Promise<Product> {
  if (useMocks) {
    if (input.kind !== "consumible" && input.kind !== "reventa") {
      throw new ApiError(422, "INVALID_INPUT", "El tipo de producto debe ser consumible o reventa.");
    }
    const saved: Product = { id: `product-${Date.now()}`, name: input.name, unit: input.unit, kind: input.kind, status: "Activo" };
    mockProducts.unshift(saved);
    return copy(saved);
  }
  return toUiProduct(await createProductReal({ name: input.name, unit: input.unit, kind: input.kind }, idempotencyKey));
}

function mockFindProduct(productId: string): Product {
  const product = mockProducts.find((item) => item.id === productId);
  if (!product) throw new ApiError(404, "PRODUCT_NOT_FOUND", "El producto no existe.");
  return product;
}

function mockFindLocation(locationId: number): InventoryLocation {
  const location = mockLocations.find((item) => item.id === String(locationId));
  if (!location) throw new ApiError(404, "LOCATION_NOT_FOUND", "La sede no existe.");
  return location;
}

function mockBalanceRef(productId: string, locationId: number): InventoryBalance {
  const existing = mockBalances.find((item) => item.productId === productId && item.locationId === String(locationId));
  if (existing) return existing;
  const created: InventoryBalance = { productId, locationId: String(locationId), available: 0 };
  mockBalances.push(created);
  return created;
}

/** Mock-store ids are numeric strings so TransferRead's integer movement ids
 * map back onto the rows (the real backend assigns integer ids). */
let mockMovementSeq = 100;
const nextMockMovementId = (): string => String(++mockMovementSeq);

/** Stock entry (purchase/initial input) at one location; idempotency per intent. */
export async function registerEntry(
  productId: string,
  input: { location_id: number; quantity: number; unit_price?: number | null },
  idempotencyKey: string,
): Promise<InventoryMovement> {
  if (useMocks) {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new ApiError(422, "INVALID_INPUT", "La cantidad debe ser un número mayor a cero.");
    }
    mockFindProduct(productId);
    mockFindLocation(input.location_id);
    const balance = mockBalanceRef(productId, input.location_id);
    balance.available = round2(balance.available + input.quantity);
    const movement: InventoryMovement = {
      id: nextMockMovementId(),
      productId,
      locationId: String(input.location_id),
      type: "ENTRADA",
      quantity: round2(input.quantity),
      unitPrice: input.unit_price != null && Number.isFinite(input.unit_price) ? round2(input.unit_price) : null,
      reason: null,
      transferId: null,
      movedAt: new Date().toISOString(),
    };
    mockMovements.unshift(movement);
    return copy(movement);
  }
  return toUiMovement(await registerEntryReal(Number(productId), input, idempotencyKey));
}

/** Reason-required signed correction at one location (mock mirrors the real
 * rules: nonzero quantity, reason required, negative needs enough stock). */
export async function registerAdjustment(
  productId: string,
  input: { location_id: number; quantity: number; reason: string },
  idempotencyKey: string,
): Promise<InventoryMovement> {
  if (useMocks) {
    if (!Number.isFinite(input.quantity) || input.quantity === 0) {
      throw new ApiError(422, "INVALID_INPUT", "La cantidad del ajuste no puede ser cero.");
    }
    if (!input.reason?.trim()) {
      throw new ApiError(422, "INVALID_INPUT", "El ajuste requiere un motivo.");
    }
    mockFindProduct(productId);
    mockFindLocation(input.location_id);
    const balance = mockBalanceRef(productId, input.location_id);
    if (input.quantity < 0 && balance.available < -input.quantity) {
      throw new ApiError(422, "INVALID_INPUT", "Stock insuficiente para el movimiento solicitado.");
    }
    balance.available = round2(balance.available + input.quantity);
    const movement: InventoryMovement = {
      id: nextMockMovementId(),
      productId,
      locationId: String(input.location_id),
      type: "ADJUSTMENT",
      quantity: round2(input.quantity),
      unitPrice: null,
      reason: input.reason,
      transferId: null,
      movedAt: new Date().toISOString(),
    };
    mockMovements.unshift(movement);
    return copy(movement);
  }
  return toUiMovement(await registerAdjustmentReal(Number(productId), input, idempotencyKey));
}

/** Move stock between two locations (mock mirrors the real rules: distinct
 * origins, positive quantity, origin floor). */
export async function registerTransfer(
  productId: string,
  input: { origin_location_id: number; destination_location_id: number; quantity: number; reason?: string | null },
  idempotencyKey: string,
): Promise<InventoryTransfer> {
  if (useMocks) {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new ApiError(422, "INVALID_INPUT", "La cantidad debe ser un número mayor a cero.");
    }
    if (input.origin_location_id === input.destination_location_id) {
      throw new ApiError(422, "INVALID_INPUT", "El origen y el destino de la transferencia deben ser sedes distintas.");
    }
    mockFindProduct(productId);
    mockFindLocation(input.origin_location_id);
    mockFindLocation(input.destination_location_id);
    const origin = mockBalanceRef(productId, input.origin_location_id);
    if (origin.available < input.quantity) {
      throw new ApiError(422, "INVALID_INPUT", "Stock insuficiente para el movimiento solicitado.");
    }
    const destination = mockBalanceRef(productId, input.destination_location_id);
    origin.available = round2(origin.available - input.quantity);
    destination.available = round2(destination.available + input.quantity);

    const transferId = `t-${Date.now()}`;
    const outMovement: InventoryMovement = {
      id: nextMockMovementId(),
      productId,
      locationId: String(input.origin_location_id),
      type: "TRANSFER_OUT",
      quantity: round2(input.quantity),
      unitPrice: null,
      reason: input.reason ?? null,
      transferId,
      movedAt: new Date().toISOString(),
    };
    const inMovement: InventoryMovement = {
      id: nextMockMovementId(),
      productId,
      locationId: String(input.destination_location_id),
      type: "TRANSFER_IN",
      quantity: round2(input.quantity),
      unitPrice: null,
      reason: input.reason ?? null,
      transferId,
      movedAt: outMovement.movedAt,
    };
    mockMovements.unshift(inMovement, outMovement);
    return copy({
      transferId,
      productId,
      originLocationId: String(input.origin_location_id),
      destinationLocationId: String(input.destination_location_id),
      quantity: round2(input.quantity),
      reason: input.reason ?? null,
      outMovementId: Number(outMovement.id),
      inMovementId: Number(inMovement.id),
    });
  }
  return toUiTransfer(await registerTransferReal(Number(productId), input, idempotencyKey));
}

export const getConversations = () => getOrMock<Conversation[]>("/conversations", conversations);

export async function sendMessage(conversationId: string, text: string): Promise<ChatMessage> {
  if (!useMocks) {
    const response = await api.post<ChatMessage>(`/conversations/${conversationId}/messages`, { text });
    return response.data;
  }
  const conversation = conversations.find((item) => item.id === conversationId);
  if (!conversation) throw new Error("Conversación no encontrada");
  const message: ChatMessage = {
    id: `message-${Date.now()}`,
    from: "staff",
    text,
    time: new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false }),
  };
  conversation.messages.push(message);
  conversation.preview = text;
  conversation.time = message.time;
  return copy(message);
}

/* ---------------------------------------------------------------------------
 * Voice assistant — re-exported so pages keep importing from `../api`, the
 * single façade convention every other page follows. The implementation and
 * the feature gate live in `./voice`; see that file for the contract and for
 * the provenance of the contributed calls (Alejandro Marcelo).
 * ------------------------------------------------------------------------- */
export {
  VOICE_DEFAULT_URL,
  VoiceUnavailableError,
  editVoiceField,
  getVoiceHealth,
  isVoiceUnavailable,
  restartVoiceSession,
  sendVoiceAudio,
  sendVoiceText,
  voiceBaseUrl,
  voiceEnabled,
  voiceLive,
} from "./voice";

// --- Bandeja (approvals inbox, agent runs) and the signed-in staff persona ---
export {
  beginDecision,
  CATEGORY_LABEL,
  decideInboxItem,
  describeApprovalError,
  loadInbox,
  RUNNABLE_AGENTS,
  runAgentNow,
  toUiInboxItem,
  type ActionableError,
  type DecisionIntent,
  type DecisionResult,
  type InboxCatalogNames,
  type InboxPageView,
} from "./approvals";
export {
  ACTIVITY_AGENTS,
  activitySentence,
  AGENT_LABEL,
  CLINIC_TIME_ZONE,
  describeObservabilityError,
  formatSoles,
  loadActivity,
  loadAgentRuns,
  loadClinicLocations,
  loadProductivity,
  PRODUCTIVITY_MAX_SPAN_DAYS,
  PRODUCTIVITY_PRESETS,
  productivityPreset,
  productivityRangeError,
  RUNS_PAGE_SIZE,
  toUiActivityItem,
  toUiAgentRun,
  toUiProductivity,
  type ActivityFilters,
  type ObservabilityError,
  type ObservabilitySurface,
  type ProductivityPreset,
} from "./activity";
export {
  canOpen,
  canRunAgent,
  choosePersona,
  hasPermissions,
  loadIdentity,
  loadPersonas,
  MODULE_PERMISSIONS,
  toStaffIdentity,
  type PersonaSession,
} from "./session";
