import axios from "axios";
import {
  agentActivity,
  appointments,
  automations,
  cashMovements,
  conversations,
  humanQueue,
  patients,
  products,
} from "./mockData";
import {
  ApiError,
  bookAppointment as bookAppointmentReal,
  cancelAppointment as cancelAppointmentReal,
  createPatient as createPatientReal,
  getAppointment as getAppointmentReal,
  listAppointments as listAppointmentsReal,
  listEligiblePractitioners as listEligiblePractitionersReal,
  listLeads as listLeadsReal,
  listLocations as listLocationsReal,
  listPatients as listPatientsReal,
  listServices as listServicesReal,
  newIdempotencyKey,
  querySlots as querySlotsReal,
  rescheduleAppointment as rescheduleAppointmentReal,
  toApiError,
  type AppointmentListItem,
  type AppointmentRead,
  type LeadRead,
  type LocationRead,
  type PatientRead,
  type PractitionerRead,
  type ServiceRead,
  type SlotResult,
} from "./contracts/client";
import type {
  Appointment,
  CashMovement,
  ChatMessage,
  Conversation,
  NewAppointmentInput,
  Patient,
  Product,
} from "./types";

export const api = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL,
});

const useMocks = import.meta.env.VITE_USE_MOCKS !== "false";
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
    patient: item.lead_name,
    treatment: item.service_name,
    doctor: item.practitioner_name,
    branch: item.location_name,
    status: toUiStatus(item.state),
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

export const getPatients = () => getOrMock<Patient[]>("/patients", patients);

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
  if (useMocks) return copy(patients);
  const rows = await listPatientsReal(search);
  return rows.map(toUiPatient);
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
export async function loadAgenda(): Promise<Appointment[]> {
  if (useMocks) return copy(appointments);
  const window = currentWeekWindow();
  const [rows, locations] = await Promise.all([
    listAppointmentsReal({ from_date: window.from, to_date: window.to }),
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
    const day = Math.max(0, Math.min(5, new Date(`${input.date}T12:00:00`).getDay() - 1));
    const saved: Appointment = {
      id: `appointment-${Date.now()}`,
      patient: input.patient,
      treatment: input.treatment,
      doctor: input.doctor,
      branch: input.branch,
      time: input.time,
      day,
      status: "Por confirmar",
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

export async function getAgentDashboard() {
  if (!useMocks) {
    const response = await api.get("/agent/dashboard");
    return response.data as { activity: typeof agentActivity; queue: typeof humanQueue; automations: typeof automations };
  }
  return copy({ activity: agentActivity, queue: humanQueue, automations });
}

export const getCashMovements = () => getOrMock<CashMovement[]>("/cash/movements", cashMovements);

export async function createCashMovement(input: Omit<CashMovement, "id" | "time" | "owner" | "status">): Promise<CashMovement> {
  if (!useMocks) {
    const response = await api.post<CashMovement>("/cash/movements", input);
    return response.data;
  }
  const saved: CashMovement = {
    ...input,
    id: `movement-${Date.now()}`,
    time: new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false }),
    owner: "Leonardo P.",
    status: input.type === "expense" ? "Egreso" : "Pagado",
  };
  cashMovements.unshift(saved);
  return copy(saved);
}

export const getProducts = () => getOrMock<Product[]>("/inventory/products", products);

export async function createProduct(input: Omit<Product, "id" | "status" | "tone" | "updated">): Promise<Product> {
  if (!useMocks) {
    const response = await api.post<Product>("/inventory/products", input);
    return response.data;
  }
  const saved: Product = {
    ...input,
    id: `product-${Date.now()}`,
    status: input.stock <= input.minimum ? "Stock bajo" : "Disponible",
    tone: input.stock <= input.minimum ? "amber" : "green",
    updated: "14 ago 2026",
  };
  products.unshift(saved);
  return copy(saved);
}

export async function registerPurchase(productId: string, quantity: number): Promise<Product> {
  if (!useMocks) {
    const response = await api.post<Product>("/inventory/purchases", { productId, quantity });
    return response.data;
  }
  const product = products.find((item) => item.id === productId);
  if (!product) throw new Error("Producto no encontrado");
  product.stock += quantity;
  product.status = product.stock > product.minimum ? "Disponible" : "Stock bajo";
  return copy(product);
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
