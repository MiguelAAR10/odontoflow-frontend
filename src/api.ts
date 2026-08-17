import axios from "axios";
import {
  agentActivity,
  appointments,
  automations,
  conversations,
  humanQueue,
  mockBalances,
  mockCharges,
  mockLocations,
  mockMovements,
  mockProducts,
  patients,
} from "./mockData";
import {
  ApiError,
  bookAppointment as bookAppointmentReal,
  cancelAppointment as cancelAppointmentReal,
  createPatient as createPatientReal,
  createPayment as createPaymentReal,
  createProduct as createProductReal,
  getAppointment as getAppointmentReal,
  getBalance as getBalanceReal,
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
  type PractitionerRead,
  type ProductRead,
  type ServiceRead,
  type SlotResult,
  type TransferRead,
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

// --- real cash view model (M4 Phase 1: charges + payments only) -------------

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Parse the backend decimal string into a 2-decimal number. */
export function toMoneyNumber(value: string | number): number {
  return round2(Number(value));
}

/** Map the backend PaymentRead into the UI payment view model. */
export function toUiPayment(row: PaymentRead): Payment {
  return { id: String(row.id), amount: toMoneyNumber(row.amount), method: row.method, paidAt: row.paid_at };
}

/** Map the backend ChargeRead (+ its payments) into the UI charge view model.
 * Status is derived from the real paid/outstanding values — never mocked. */
export function toUiCharge(row: ChargeRead, payments: PaymentRead[] = []): Charge {
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
    // Mock-only columns: the backend projects no location/party/owner, so real
    // mode always renders these empty (the page hides them via `useMocks`).
    branch: "",
    party: "",
    concept: "",
    owner: "",
  };
}

/** 'Por cobrar': the real derived KPI, Σ outstanding across charges. */
export function sumOutstanding(charges: Charge[]): number {
  return round2(charges.reduce((total, charge) => total + charge.outstanding, 0));
}

/** 'Cobrado': Σ paid across charges (replaces the fake daily income KPI). */
export function sumPaid(charges: Charge[]): number {
  return round2(charges.reduce((total, charge) => total + charge.paid, 0));
}

export async function loadCharges(): Promise<Charge[]> {
  if (useMocks) return copy(mockCharges);
  const rows = await listChargesReal();
  const withPayments = await Promise.all(
    rows.map(async (charge) => [charge, await listPaymentsReal(charge.id)] as const),
  );
  return withPayments.map(([charge, payments]) => toUiCharge(charge, payments));
}

export async function loadChargePayments(chargeId: string): Promise<Payment[]> {
  if (useMocks) {
    const charge = mockCharges.find((item) => item.id === chargeId);
    return copy(charge?.payments ?? []);
  }
  return (await listPaymentsReal(Number(chargeId))).map(toUiPayment);
}

/** Register a payment against a charge. Idempotency-Key is per payment intent;
 * the backend rejects overpayments and the envelope is surfaced as-is. */
export async function registerPayment(
  chargeId: string,
  input: { amount: number; method: string },
  idempotencyKey: string,
): Promise<Payment> {
  if (!useMocks) {
    const created = await createPaymentReal(Number(chargeId), input, idempotencyKey);
    return toUiPayment(created);
  }
  // Mock mode simulates the backend's money-correctness rules (reject
  // overpayment / invalid amount) so the UI flow is identical in both modes.
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new ApiError(422, "INVALID_INPUT", "El monto debe ser un número mayor a cero.");
  }
  const charge = mockCharges.find((item) => item.id === chargeId);
  if (!charge) throw new ApiError(404, "CHARGE_NOT_FOUND", "El cargo no existe.");
  if (input.amount > charge.outstanding + 0.004) {
    throw new ApiError(
      422,
      "INVALID_INPUT",
      `El pago (S/ ${round2(input.amount).toFixed(2)}) supera el saldo pendiente del cargo (S/ ${charge.outstanding.toFixed(2)}).`,
    );
  }
  const payment: Payment = {
    id: `payment-${Date.now()}`,
    amount: round2(input.amount),
    method: input.method,
    paidAt: new Date().toISOString(),
  };
  charge.payments.push(payment);
  charge.paid = round2(charge.paid + payment.amount);
  charge.outstanding = round2(Math.max(0, charge.amount - charge.paid));
  charge.status = charge.outstanding <= 0.004 ? "Pagado" : "Parcial";
  return copy(payment);
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
