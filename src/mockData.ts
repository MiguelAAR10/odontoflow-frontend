import type {
  AgentActivity,
  Appointment,
  Automation,
  Charge,
  Conversation,
  HumanQueueItem,
  InventoryBalance,
  InventoryLocation,
  InventoryMovement,
  Patient,
  Product,
  ServiceExecution,
  ServiceOption,
  Visit,
} from "./types";
import type { ChargeFollowUp } from "./types";
import type { InboxItem, MeRead } from "./contracts/client";

export const patients: Patient[] = [
  { id: "ana", initials: "AT", name: "Ana Torres", dni: "74859632", phone: "+51 987 654 321", branch: "Lince", nextAppointment: "15 ago · 10:30 a. m.", treatment: "Limpieza dental", status: "Activo", tone: "cyan", origin: "Instagram", interest: "Alto" },
  { id: "carlos", initials: "CR", name: "Carlos Rojas", dni: "70241589", phone: "+51 965 241 830", branch: "Jesús María", nextAppointment: "18 ago · 09:00 a. m.", treatment: "Evaluación", status: "Lead", tone: "blue", origin: "Referido", interest: "Medio" },
  { id: "lucia", initials: "LP", name: "Lucía Pérez", dni: "72103458", phone: "+51 922 865 174", branch: "Magdalena", nextAppointment: "19 ago · 11:00 a. m.", treatment: "Ortodoncia", status: "Activo", tone: "purple", origin: "Facebook", interest: "Alto" },
  { id: "diego", initials: "DS", name: "Diego Salazar", dni: "76893412", phone: "+51 977 104 862", branch: "Lince", nextAppointment: "22 ago · 12:00 p. m.", treatment: "Control", status: "Lead", tone: "green", origin: "Google", interest: "Medio" },
  { id: "maria", initials: "MF", name: "María Flores", dni: "71520846", phone: "+51 930 684 211", branch: "Jesús María", nextAppointment: "Por reprogramar", treatment: "Endodoncia", status: "Pendiente", tone: "pink", origin: "Instagram", interest: "Alto" },
  { id: "jose", initials: "JR", name: "José Ramírez", dni: "73410285", phone: "+51 945 318 206", branch: "Magdalena", nextAppointment: "25 ago · 04:00 p. m.", treatment: "Implantes", status: "Activo", tone: "amber", origin: "Referido", interest: "Alto" },
];

export const appointments: Appointment[] = [
  { id: "apt-1", day: 0, time: "09:00", patient: "Ana Torres", patientId: "ana", patientName: "Ana Torres", treatment: "Limpieza", doctor: "Dra. Valeria Ruiz", branch: "Lince", status: "Confirmada", serviceId: 1, locationId: 1, practitionerId: 1, startUtc: "2026-09-06T14:00:00Z", endUtc: "2026-09-06T14:30:00Z", timeZone: "America/Lima" },
  { id: "apt-2", day: 1, time: "10:30", patient: "Carlos Rojas", treatment: "Evaluación", doctor: "Dr. Mateo León", branch: "Jesús María", status: "Por confirmar", serviceId: 2, locationId: 2, practitionerId: 2, startUtc: "2026-09-08T15:30:00Z", endUtc: "2026-09-08T16:00:00Z", timeZone: "America/Lima" },
  { id: "apt-3", day: 2, time: "11:00", patient: "Lucía Pérez", treatment: "Ortodoncia", doctor: "Dra. Valeria Ruiz", branch: "Magdalena", status: "Confirmada", serviceId: 3, locationId: 3, practitionerId: 1, startUtc: "2026-09-09T16:00:00Z", endUtc: "2026-09-09T17:00:00Z", timeZone: "America/Lima" },
  { id: "apt-4", day: 3, time: "12:00", patient: "Diego Salazar", treatment: "Control", doctor: "Dra. Valeria Ruiz", branch: "Lince", status: "Confirmada", serviceId: 4, locationId: 1, practitionerId: 1, startUtc: "2026-09-10T17:00:00Z", endUtc: "2026-09-10T17:30:00Z", timeZone: "America/Lima" },
  { id: "apt-5", day: 4, time: "13:00", patient: "María Flores", treatment: "Endodoncia", doctor: "Dr. Mateo León", branch: "Jesús María", status: "No respondió", serviceId: 5, locationId: 2, practitionerId: 2, startUtc: "2026-09-11T18:00:00Z", endUtc: "2026-09-11T19:00:00Z", timeZone: "America/Lima" },
];

export const agentActivity: AgentActivity[] = [
  { time: "09:00", kind: "Citas", icon: "clock", tone: "amber", action: "Confirmación enviada", patient: "Carlos Rojas", initials: "CR", channel: "WhatsApp", status: "Esperando" },
  { time: "09:12", kind: "Citas", icon: "check", tone: "green", action: "Cita confirmada", patient: "Ana Torres", initials: "AT", channel: "WhatsApp", status: "Completado" },
  { time: "09:24", kind: "Leads", icon: "message", tone: "cyan", action: "Consulta respondida: Implantes", patient: "José Ramírez", initials: "JR", channel: "WhatsApp", status: "Respondido" },
  { time: "09:31", kind: "Leads", icon: "users", tone: "purple", action: "Derivado a Miguel", patient: "Lucía Gómez", initials: "LG", channel: "WhatsApp", status: "Requiere atención" },
];

export const humanQueue: HumanQueueItem[] = [
  { id: "human-1", name: "Lucía Gómez", initials: "LG", reason: "Solicita descuento", waiting: "12 min esperando", tone: "pink" },
  { id: "human-2", name: "Pedro Salazar", initials: "PS", reason: "Caso de paciente referido", waiting: "18 min esperando", tone: "blue" },
  { id: "human-3", name: "María Flores", initials: "MF", reason: "Duda clínica", waiting: "25 min esperando", tone: "cyan" },
];

export const automations: Automation[] = [
  { time: "09:00", title: "Confirmación día anterior", note: "18 de 20 enviadas", state: "done" },
  { time: "12:00", title: "Llamar a no respondidos", note: "2 pendientes", state: "pending" },
  { time: "16:00", title: "Segundo intento", note: "Programado", state: "scheduled" },
  { time: "09:00", title: "Recordatorio del día", note: "8 enviados", state: "done" },
  { time: "1 h antes", title: "Reconfirmación final", note: "Automático", state: "automatic" },
];

export const mockCharges: Charge[] = [
  { id: "1", serviceExecutionId: 101, amount: 180, paid: 180, outstanding: 0, createdAt: "2026-08-14T14:15:00Z", payments: [{ id: "p1", amount: 180, method: "yape", reference: null, receiver: null, reconciliationNote: null, verificationStatus: "unverified", verifiedAt: null, paidAt: "2026-08-14T14:15:00Z" }], status: "Pagado", visitId: 1, patientId: 1, patientName: "Ana Torres", serviceId: 1, serviceName: "Limpieza dental", locationId: 1, locationName: "Lince", practitionerId: 1, practitionerName: "Dra. Valeria Ruiz", executedAt: "2026-08-14T14:00:00Z", locationTimeZone: "America/Lima" },
  { id: "2", serviceExecutionId: 102, amount: 500, paid: 200, outstanding: 300, createdAt: "2026-08-14T14:48:00Z", payments: [{ id: "p2", amount: 200, method: "yape", reference: "YAPE-20260814-002", receiver: "Billetera clínica", reconciliationNote: null, verificationStatus: "unverified", verifiedAt: null, paidAt: "2026-08-14T14:48:00Z" }], status: "Parcial", visitId: 2, patientId: 2, patientName: "Carlos Rojas", serviceId: 2, serviceName: "Evaluación dental", locationId: 2, locationName: "Jesús María", practitionerId: 2, practitionerName: "Dr. Mateo León", executedAt: "2026-08-14T14:30:00Z", locationTimeZone: "America/Lima" },
  { id: "3", serviceExecutionId: 103, amount: 120, paid: 120, outstanding: 0, createdAt: "2026-08-14T15:25:00Z", payments: [{ id: "p3", amount: 120, method: "efectivo", reference: null, receiver: null, reconciliationNote: null, verificationStatus: "verified", verifiedAt: "2026-08-14T15:30:00Z", paidAt: "2026-08-14T15:25:00Z" }], status: "Pagado", visitId: 3, patientId: 3, patientName: "Lucía Pérez", serviceId: 3, serviceName: "Ortodoncia", locationId: 3, locationName: "Magdalena", practitionerId: 1, practitionerName: "Dra. Valeria Ruiz", executedAt: "2026-08-14T15:00:00Z", locationTimeZone: "America/Lima" },
  { id: "4", serviceExecutionId: 104, amount: 100, paid: 0, outstanding: 100, createdAt: "2026-08-14T16:20:00Z", payments: [], status: "Pendiente", visitId: 4, patientId: 4, patientName: "Diego Salazar", serviceId: 4, serviceName: "Control dental", locationId: 1, locationName: "Lince", practitionerId: 1, practitionerName: "Dra. Valeria Ruiz", executedAt: "2026-08-14T16:00:00Z", locationTimeZone: "America/Lima" },
  { id: "5", serviceExecutionId: 105, amount: 450, paid: 450, outstanding: 0, createdAt: "2026-08-14T17:05:00Z", payments: [{ id: "p4", amount: 450, method: "plin", reference: "PLIN-20260814-005", receiver: "Cuenta clínica", reconciliationNote: "Conciliado en cierre diario", verificationStatus: "verified", verifiedAt: "2026-08-14T18:00:00Z", paidAt: "2026-08-14T17:05:00Z" }], status: "Pagado", visitId: 5, patientId: 5, patientName: "María Flores", serviceId: 5, serviceName: "Endodoncia", locationId: 2, locationName: "Jesús María", practitionerId: 2, practitionerName: "Dr. Mateo León", executedAt: "2026-08-14T16:45:00Z", locationTimeZone: "America/Lima" },
];

export const mockServices: ServiceOption[] = [
  { id: 1, name: "Limpieza dental", durationMinutes: 30, isActive: true },
  { id: 2, name: "Evaluación dental", durationMinutes: 30, isActive: true },
  { id: 3, name: "Ortodoncia", durationMinutes: 60, isActive: true },
  { id: 4, name: "Control dental", durationMinutes: 30, isActive: true },
  { id: 5, name: "Endodoncia", durationMinutes: 60, isActive: true },
];

export const mockVisits: Visit[] = [
  {
    id: "1",
    patientId: "ana",
    patientName: "Ana Torres",
    appointmentId: "apt-1",
    practitionerId: 1,
    practitionerName: "Dra. Valeria Ruiz",
    locationId: 1,
    locationName: "Lince",
    startedAt: "2026-08-14T14:00:00Z",
    executions: [{ id: "101", visitId: 1, serviceId: 1, serviceName: "Limpieza dental", executedPrice: 180, executedAt: "2026-08-14T14:00:00Z", chargeId: 1, patientId: 1, patientName: "Ana Torres", locationId: 1, locationName: "Lince" }],
  },
  {
    id: "6",
    patientId: "diego",
    patientName: "Diego Salazar",
    appointmentId: null,
    practitionerId: 1,
    practitionerName: "Dra. Valeria Ruiz",
    locationId: 1,
    locationName: "Lince",
    startedAt: "2026-09-05T17:00:00Z",
    executions: [{ id: "106", visitId: 6, serviceId: 4, serviceName: "Control dental", executedPrice: 100, executedAt: "2026-09-05T17:00:00Z", chargeId: null, patientId: 4, patientName: "Diego Salazar", locationId: 1, locationName: "Lince" }],
  },
];

export const mockExecutions: ServiceExecution[] = mockVisits.flatMap((visit) => visit.executions);

export const conversations: Conversation[] = [
  { id: "conv-ana", patientId: "ana", name: "Ana Torres", initials: "AT", preview: "Sí, deseo confirmar mi cita", time: "10:42", unread: 2, tag: "Paciente", tone: "cyan", messages: [
    { id: "m1", from: "patient", text: "Hola, quisiera confirmar mi cita de mañana.", time: "10:38" },
    { id: "m2", from: "agent", text: "¡Hola, Ana! Tu cita está programada para mañana a las 10:30 a. m. en la sede Lince. ¿Confirmamos tu asistencia?", time: "10:39" },
    { id: "m3", from: "patient", text: "Sí, deseo confirmar mi cita.", time: "10:42" },
  ] },
  { id: "conv-carlos", patientId: "carlos", name: "Carlos Rojas", initials: "CR", preview: "¿Tienen horario en Lince?", time: "10:30", unread: 0, tag: "Lead", tone: "blue", messages: [{ id: "m4", from: "patient", text: "Hola, ¿tienen horario disponible en Lince esta semana?", time: "10:30" }] },
  { id: "conv-lucia", patientId: "lucia", name: "Lucía Pérez", initials: "LP", preview: "Gracias por el recordatorio", time: "09:55", unread: 0, tag: "Paciente", tone: "purple", messages: [{ id: "m5", from: "agent", text: "Te recordamos tu control de ortodoncia de mañana.", time: "09:52" }, { id: "m6", from: "patient", text: "Gracias por el recordatorio", time: "09:55" }] },
  { id: "conv-diego", patientId: "diego", name: "Diego Salazar", initials: "DS", preview: "Quisiera una evaluación", time: "Ayer", unread: 0, tag: "Lead", tone: "green", messages: [{ id: "m7", from: "patient", text: "Quisiera una evaluación dental, por favor.", time: "Ayer" }] },
  { id: "conv-maria", patientId: "maria", name: "María Flores", initials: "MF", preview: "Necesito reprogramar", time: "Ayer", unread: 0, tag: "Paciente", tone: "pink", messages: [{ id: "m8", from: "patient", text: "Necesito reprogramar mi cita de endodoncia.", time: "Ayer" }] },
];

export const mockFollowUps: ChargeFollowUp[] = [
  {
    id: "2",
    chargeId: 2,
    nextFollowUpOn: "2026-09-08",
    note: "Paciente indicó que completa el saldo el martes.",
    state: "open",
    openedAt: "2026-09-06T14:00:00Z",
    closedAt: null,
    closeReason: null,
    chargeAmount: 500,
    chargePaid: 200,
    chargeOutstanding: 300,
    isActiveCase: true,
    patientId: 2,
    patientName: "Carlos Rojas",
    serviceId: 2,
    serviceName: "Evaluación dental",
    locationId: 2,
    locationName: "Jesús María",
    practitionerId: 2,
    practitionerName: "Dr. Mateo León",
  },
  {
    id: "1",
    chargeId: 1,
    nextFollowUpOn: "2026-08-20",
    note: "Pago completo recibido.",
    state: "closed",
    openedAt: "2026-08-14T14:20:00Z",
    closedAt: "2026-08-14T15:00:00Z",
    closeReason: "settled",
    chargeAmount: 180,
    chargePaid: 180,
    chargeOutstanding: 0,
    isActiveCase: false,
    patientId: 1,
    patientName: "Ana Torres",
    serviceId: 1,
    serviceName: "Limpieza dental",
    locationId: 1,
    locationName: "Lince",
    practitionerId: 1,
    practitionerName: "Dra. Valeria Ruiz",
  },
];

// --- inventory mock store (real OpenAPI shapes only) ------------------------
// Used only when NEXT_PUBLIC_USE_MOCKS=true. Real mode (false) reads the backend and
// consumes ZERO of these rows.

export const mockLocations: InventoryLocation[] = [
  { id: "1", name: "Lince", timezone: "America/Lima", isActive: true },
  { id: "2", name: "Jesús María", timezone: "America/Lima", isActive: true },
  { id: "3", name: "Magdalena", timezone: "America/Lima", isActive: true },
];

export const mockProducts: Product[] = [
  { id: "1", name: "Guantes de nitrilo", unit: "cajas", kind: "consumible", status: "Activo" },
  { id: "2", name: "Resina compuesta A2", unit: "unidades", kind: "consumible", status: "Activo" },
  { id: "3", name: "Anestesia lidocaína 2%", unit: "cartuchos", kind: "consumible", status: "Activo" },
  { id: "4", name: "Mascarillas quirúrgicas", unit: "cajas", kind: "consumible", status: "Activo" },
  { id: "5", name: "Cepillos interdentales", unit: "unidades", kind: "reventa", status: "Activo" },
  { id: "6", name: "Hilo dental", unit: "cajas", kind: "reventa", status: "Inactivo" },
];

/** Ledger-derived balances per Product × Location (BalanceRead mapped). */
export const mockBalances: InventoryBalance[] = [
  { productId: "1", locationId: "1", available: 180 },
  { productId: "1", locationId: "2", available: 60 },
  { productId: "2", locationId: "1", available: 12 },
  { productId: "3", locationId: "2", available: 28 },
  { productId: "4", locationId: "3", available: 45 },
  { productId: "5", locationId: "1", available: 30 },
  { productId: "5", locationId: "2", available: 10 },
];

/** Kardex rows (MovementRead mapped), newest first. */
export const mockMovements: InventoryMovement[] = [
  { id: "1", productId: "1", locationId: "1", type: "ENTRADA", quantity: 240, unitPrice: 25, reason: null, transferId: null, movedAt: "2026-08-14T09:00:00Z" },
  { id: "2", productId: "1", locationId: "1", type: "TRANSFER_OUT", quantity: 60, unitPrice: null, reason: "Reabastecimiento a Jesús María", transferId: "t-1", movedAt: "2026-08-14T10:00:00Z" },
  { id: "3", productId: "1", locationId: "2", type: "TRANSFER_IN", quantity: 60, unitPrice: null, reason: "Reabastecimiento desde Lince", transferId: "t-1", movedAt: "2026-08-14T10:00:00Z" },
  { id: "4", productId: "2", locationId: "1", type: "ENTRADA", quantity: 15, unitPrice: 80, reason: null, transferId: null, movedAt: "2026-08-13T15:30:00Z" },
  { id: "5", productId: "2", locationId: "1", type: "ADJUSTMENT", quantity: -3, unitPrice: null, reason: "Rotura de envase", transferId: null, movedAt: "2026-08-14T11:00:00Z" },
  { id: "6", productId: "3", locationId: "2", type: "ENTRADA", quantity: 28, unitPrice: 12.5, reason: null, transferId: null, movedAt: "2026-08-13T09:00:00Z" },
  { id: "7", productId: "4", locationId: "3", type: "ENTRADA", quantity: 45, unitPrice: 10, reason: null, transferId: null, movedAt: "2026-08-12T16:00:00Z" },
  { id: "8", productId: "5", locationId: "1", type: "ENTRADA", quantity: 30, unitPrice: 6, reason: null, transferId: null, movedAt: "2026-08-12T10:00:00Z" },
  { id: "9", productId: "5", locationId: "2", type: "ENTRADA", quantity: 10, unitPrice: 6, reason: null, transferId: null, movedAt: "2026-08-11T12:00:00Z" },
];

// --- Bandeja (design-time only) --------------------------------------------
// Rows use the exact `InboxItem` / `MeRead` contract shapes. Times are relative
// to module load so the demo always shows live and near-expiry items. The mock
// rules in src/approvals.ts mirror the backend (actions per permission, hash
// check, expiry, replay); real mode consumes ZERO of these rows.

const minutesFromNow = (minutes: number): string => new Date(Date.now() + minutes * 60_000).toISOString();
const daysAgo = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString();
/** Next day at a Lima wall-clock hour (UTC-5, no DST), as a UTC instant. */
const tomorrowLima = (hour: number, minute = 0): string => {
  const now = new Date(Date.now() - 5 * 3_600_000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, hour + 5, minute)).toISOString();
};
const addMinutes = (iso: string, minutes: number): string => new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
const mockHash = (seed: string): string => seed.repeat(64).slice(0, 64);

const pendingAgentRow = (): Pick<InboxItem, "source" | "status" | "confirmation_token" | "decided_by" | "result_ref" | "error_code" | "actions"> => ({
  source: "agent_proposal",
  status: "pending",
  confirmation_token: null,
  decided_by: null,
  result_ref: null,
  error_code: null,
  actions: [],
});

export const mockInboxItems: InboxItem[] = [
  {
    ...pendingAgentRow(),
    id: 301,
    kind: "collection_reminder",
    agent_key: "cobranza",
    location_id: 1,
    summary: "Recordatorio de pago a Rosa Quispe — saldo S/ 180.00",
    reason: "Saldo vencido de S/ 180.00 hace 12 días",
    facts: { charge_id: 31, patient_id: 4, patient_name: "Rosa Quispe", amount: "250.00", paid: "70.00", balance: "180.00" },
    evidence: { run_id: 1, amount: "250.00", balance: "180.00", days_since_issued: 12, issued_on: daysAgo(12).slice(0, 10), last_payment_at: daysAgo(11), last_payment_amount: "70.00" },
    payload: { charge_id: 31, message_text: "Hola Rosa, le escribimos de Lince. Tiene un saldo pendiente de S/ 180.00 por su atención reciente. Puede pagarlo en la sede o responder este mensaje para coordinar. ¡Gracias!" },
    payload_hash: mockHash("a1"),
    subject: { type: "charge", id: "31" },
    conversation_id: 12,
    expires_at: minutesFromNow(70 * 60),
    created_at: minutesFromNow(-25),
  },
  {
    ...pendingAgentRow(),
    id: 302,
    kind: "collection_reminder",
    agent_key: "cobranza",
    location_id: 2,
    summary: "Recordatorio de pago a Jorge Huamán — saldo S/ 95.50",
    reason: "Saldo vencido de S/ 95.50 hace 9 días",
    facts: { charge_id: 32, patient_id: 5, patient_name: "Jorge Huamán", amount: "95.50", paid: "0.00", balance: "95.50" },
    evidence: { run_id: 1, amount: "95.50", balance: "95.50", days_since_issued: 9, issued_on: daysAgo(9).slice(0, 10), last_payment_at: null, last_payment_amount: null },
    payload: { charge_id: 32, message_text: "Hola Jorge, le escribimos de Jesús María. Tiene un saldo pendiente de S/ 95.50 por su atención reciente. Puede pagarlo en la sede o responder este mensaje para coordinar. ¡Gracias!" },
    payload_hash: mockHash("b2"),
    subject: { type: "charge", id: "32" },
    conversation_id: 13,
    expires_at: minutesFromNow(70 * 60),
    created_at: minutesFromNow(-26),
  },
  {
    ...pendingAgentRow(),
    id: 303,
    kind: "inventory_transfer",
    agent_key: "inventario",
    location_id: 1,
    summary: "Traspaso de 16.00 uds. (producto #3) sede #2 → #1",
    reason: "Anestesia lidocaína 2%: Lince 4.00 < mín. 10.00; traspasar 16.00 desde Jesús María (120.00, mín. 10.00)",
    facts: null,
    evidence: {
      run_id: 2, product_id: 3, product_name: "Anestesia lidocaína 2%", unit: "cartuchos",
      target: { location_id: 1, name: "Lince", balance: "4.00", min_quantity: "10.00", consumption_7d: "9.00" },
      donor: { location_id: 2, name: "Jesús María", balance: "120.00", min_quantity: "10.00", consumption_7d: "3.00", surplus: "110.00" },
      target_fill: "16.00", quantity: "16.00", subject_version: "mock-v1",
    },
    payload: { product_id: 3, origin_location_id: 2, destination_location_id: 1, quantity: "16.00" },
    payload_hash: mockHash("c3"),
    subject: { type: "product_location", id: "3:1" },
    conversation_id: null,
    expires_at: minutesFromNow(71 * 60),
    created_at: minutesFromNow(-40),
  },
  {
    ...pendingAgentRow(),
    id: 304,
    kind: "waitlist_offer",
    agent_key: "backfill",
    location_id: 1,
    summary: "Cupo libre — ofrecer a 3 pacientes en lista de espera (cita #55)",
    reason: "Cancelación: Limpieza dental mañana 10:00 en Lince; 4 pacientes en lista de espera, se ofrece a 3",
    facts: null,
    evidence: { run_id: 3, job_key: "appointment.cancelled:55", appointment_id: 55, start_utc: tomorrowLima(10), service: "Limpieza dental", location: "Lince", matched: 4, offered_to: [21, 22, 23] },
    payload: { appointment_id: 55, entry_ids: [21, 22, 23], message_text: "Hola, se liberó un cupo de Limpieza dental mañana a las 10:00 en Lince. Si lo quiere, responda este mensaje y se lo reservamos." },
    payload_hash: mockHash("d4"),
    subject: { type: "appointment", id: "55" },
    conversation_id: null,
    expires_at: minutesFromNow(24),
    created_at: minutesFromNow(-6),
  },
  {
    source: "appointment_proposal",
    id: 101,
    kind: "appointment_booking",
    agent_key: null,
    status: "pending",
    location_id: 1,
    summary: "Cita para Elena Vargas",
    reason: null,
    facts: null,
    evidence: null,
    payload: { lead_id: 8, patient_id: null, full_name: "Elena Vargas", service_id: 2, practitioner_id: 1, start_utc: tomorrowLima(9, 30), end_utc: addMinutes(tomorrowLima(9, 30), 30) },
    payload_hash: null,
    subject: null,
    conversation_id: 41,
    confirmation_token: "7d4f6a1e-2c3b-4f5a-9b6c-1d2e3f4a5b61",
    expires_at: minutesFromNow(18),
    created_at: minutesFromNow(-12),
    decided_by: null,
    result_ref: null,
    error_code: null,
    actions: [],
  },
  {
    ...pendingAgentRow(),
    id: 299,
    kind: "collection_reminder",
    agent_key: "cobranza",
    status: "executed",
    location_id: 3,
    summary: "Recordatorio de pago a Ana Torres — saldo S/ 60.00",
    reason: "Saldo vencido de S/ 60.00 hace 15 días",
    facts: { charge_id: 29, patient_id: 1, patient_name: "Ana Torres", amount: "120.00", paid: "60.00", balance: "60.00" },
    evidence: { run_id: 1, amount: "120.00", balance: "60.00", days_since_issued: 15, issued_on: daysAgo(15).slice(0, 10), last_payment_at: daysAgo(14), last_payment_amount: "60.00" },
    payload: { charge_id: 29, message_text: "Hola Ana, le escribimos de Magdalena. Tiene un saldo pendiente de S/ 60.00." },
    payload_hash: mockHash("e5"),
    subject: { type: "charge", id: "29" },
    conversation_id: 9,
    expires_at: minutesFromNow(48 * 60),
    created_at: daysAgo(1),
    decided_by: { id: 2, display_name: "Lucía Ramos" },
    result_ref: { type: "outbound_message", id: 77 },
  },
];

/** Names an appointment proposal needs, as the real catalog reads would return. */
export const mockPractitionerNames = new Map<number, string>([[1, "Dra. Valeria Ruiz"], [2, "Dr. Mateo León"]]);

/** Mirrors the backend's human profiles (`scripts/issue_credential.py`). */
const SECRETARIA_PERMISSIONS = [
  "appointments.cancel", "appointments.create", "appointments.read", "appointments.record_outcome", "appointments.reschedule",
  "availability.read", "charges.create", "charges.read", "contact_appointments.book", "conversations.read", "conversations.resume",
  "deliveries.create", "executions.create", "executions.read", "follow_ups.create", "follow_ups.manage", "follow_ups.read",
  "leads.create", "leads.read", "locations.read", "patients.create", "patients.read", "payments.create", "payments.manage",
  "payments.read", "practitioners.read", "proposals.decide", "proposals.read", "services.read", "visits.create", "visits.read",
  "waitlist.manage", "waitlist.read",
];
const ADMINISTRADOR_PERMISSIONS = [...SECRETARIA_PERMISSIONS, "audit.read", "movements.create", "movements.read", "payments.reverse", "products.create", "products.read", "reorder_points.manage"].sort();

export const mockStaff: Array<{ key: string; role: string; me: MeRead }> = [
  {
    key: "secretaria",
    role: "secretaria",
    me: { principal: { id: 2, type: "human", display_name: "Lucía Ramos" }, organization: { id: 1, name: "ODONTO SMART" }, roles: [{ code: "staff-secretaria", name: "Secretaria" }], permissions: SECRETARIA_PERMISSIONS },
  },
  {
    key: "administrador",
    role: "administrador",
    me: { principal: { id: 3, type: "human", display_name: "Carlos Vega" }, organization: { id: 1, name: "ODONTO SMART" }, roles: [{ code: "staff-administrador", name: "Administrador" }], permissions: ADMINISTRADOR_PERMISSIONS },
  },
];
