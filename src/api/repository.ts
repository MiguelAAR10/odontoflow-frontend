import {
  bookReal,
  cancelReal,
  createPatient,
  getPatients,
  loadAgenda,
  loadCharges,
  loadInventoryData,
  newIdempotencyKey,
  registerAdjustment,
  registerEntry,
  registerPayment,
  registerTransfer,
  rescheduleReal,
  toMoneyCents,
  useMocks,
} from "./transport";
import {
  createCharge,
  createServiceExecution,
  createVisit,
  getVisit,
  listVisits,
  type ChargeCreate,
  type ServiceExecutionRead,
  type VisitDetailRead,
} from "../contracts/client";
import { capabilitiesForRole, hasCapability, type CapabilityCode, type ProductRole } from "../roles";

export type EvidenceKind = "observed" | "derived" | "demo" | "scenario" | "future" | "empty";

export type MetricMeta = {
  kind: EvidenceKind;
  source: string;
  period: string;
  denominator?: string;
  confidence?: "high" | "medium" | "demo";
};

export type DemoLocation = { id: string; name: string; timezone: string };
export type DemoPractitioner = { id: string; name: string; specialty: string; locationIds: string[] };
export type DemoLead = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  status: "new" | "contacted" | "scheduled" | "patient";
  source: string;
  need: string;
  locationId: string | null;
  patientId: string | null;
  lastContactAt: string | null;
};
export type DemoPatient = { id: string; name: string; phone: string; locationId: string; practitionerId: string | null; treatment: string; leadId: string | null };
export type DemoAppointment = {
  id: string;
  patientId: string | null;
  leadId: string | null;
  locationId: string;
  practitionerId: string;
  serviceId: string;
  serviceName: string;
  startAt: string;
  endAt: string;
  state: "confirmed" | "cancelled";
  amount: number;
};
export type DemoVisit = { id: string; appointmentId: string | null; patientId: string; locationId: string; practitionerId: string; startedAt: string; closedAt: string | null };
export type DemoExecution = { id: string; visitId: string; serviceId: string; serviceName: string; price: number; executedAt: string; chargeId: string | null };
export type DemoPayment = { id: string; chargeId: string; amount: number; method: string; paidAt: string; idempotencyKey: string };
export type DemoCharge = { id: string; executionId: string; locationId: string; patientId: string; amount: number; createdAt: string };
export type DemoProduct = { id: string; name: string; unit: string; kind: "consumible" | "reventa" };
export type DemoStockMovement = { id: string; productId: string; type: "entry" | "adjustment" | "transfer_out" | "transfer_in"; locationId: string; destinationLocationId: string | null; transferId: string | null; quantity: number; reason: string | null; createdAt: string };
export type DemoClinicalRecord = { id: string; visitId: string; patientId: string; note: string; consent: "recorded" | "missing"; updatedAt: string };
export type DemoRequest = { id: string; patientId: string; createdBy: string; type: "clinical" | "administrative" | "laboratory"; title: string; status: "open" | "in_progress" | "done"; createdAt: string };
export type DemoLabOrder = { id: string; requestId: string; patientId: string; status: "requested" | "received" | "ready"; dueAt: string };
export type DemoLeadEvent = { id: string; leadId: string; kind: "contact" | "stage"; label: string; createdAt: string };
export type DemoAuditEvent = { id: string; label: string; createdAt: string; actor: string };

export type DemoActor = {
  role: ProductRole;
  organizationId: string;
  locationId: string | null;
  practitionerId: string | null;
  capabilities: CapabilityCode[];
};

export type OdontoSnapshot = {
  version: number;
  generatedAt: string;
  status: "loading" | "ready" | "error";
  errorMessage: string | null;
  actor: DemoActor;
  locations: DemoLocation[];
  practitioners: DemoPractitioner[];
  leads: DemoLead[];
  patients: DemoPatient[];
  appointments: DemoAppointment[];
  visits: DemoVisit[];
  executions: DemoExecution[];
  charges: DemoCharge[];
  payments: DemoPayment[];
  products: DemoProduct[];
  balances: Record<string, number>;
  stockMovements: DemoStockMovement[];
  clinicalRecords: DemoClinicalRecord[];
  requests: DemoRequest[];
  labOrders: DemoLabOrder[];
  leadEvents: DemoLeadEvent[];
  auditEvents: DemoAuditEvent[];
};

export type DemoScenario = "populated" | "empty" | "loading" | "error";

export type OdontoCommand =
  | { type: "assignLeadLocation"; leadId: string; locationId: string }
  | { type: "createLead"; name: string; phone: string; email?: string; source: string; need: string }
  | { type: "createAppointment"; leadId?: string; patientId?: string; locationId: string; practitionerId: string; serviceId: string; serviceName: string; startAt: string; endAt: string; amount: number }
  | { type: "cancelAppointment"; appointmentId: string; reason?: string }
  | { type: "rescheduleAppointment"; appointmentId: string; startAt: string; endAt: string }
  | { type: "createPatient"; name: string; phone: string; locationId: string; leadId?: string }
  | { type: "updatePatient"; patientId: string; name: string; phone: string }
  | { type: "promoteLeadToPatient"; leadId: string; locationId: string }
  | { type: "registerVisit"; appointmentId?: string; patientId: string; locationId?: string; practitionerId?: string }
  | { type: "registerWalkIn"; patientName: string; phone: string; locationId: string; practitionerId: string }
  | { type: "completeService"; visitId: string; serviceId: string; serviceName: string; price: number }
  | { type: "registerPayment"; chargeId: string; amount: number; method: string; idempotencyKey: string }
  | { type: "createProduct"; name: string; unit: string; kind: DemoProduct["kind"] }
  | { type: "moveStock"; kind: "entry" | "adjustment" | "transfer"; productId: string; locationId: string; destinationLocationId?: string; quantity: number; reason?: string }
  | { type: "updateClinicalRecord"; visitId: string; patientId: string; note: string; consent: "recorded" | "missing" }
  | { type: "createRequest"; patientId: string; requestType: DemoRequest["type"]; title: string }
  | { type: "updateRequest"; requestId: string; status: DemoRequest["status"] }
  | { type: "createLabOrder"; requestId: string; patientId: string; dueAt: string }
  | { type: "recordLeadContact"; leadId: string; label: string };

export type CommandResult = { id: string; message: string; unsupported?: false } | { code: "unsupported"; command: OdontoCommand["type"]; message: string; unsupported: true };

export class RepositoryError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.name = "RepositoryError"; this.code = code; }
}

export const DEMO_TIME_ZONE = "America/Lima";
export const DEMO_NOW = "2026-08-14T18:00:00.000Z";
const LEGACY_STORAGE_KEY = "odontoflow-demo-snapshot-v3";
function clearLegacySnapshot() {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(LEGACY_STORAGE_KEY);
}
// Seed times are written as Lima wall-clock time and converted once to an
// instant. This keeps every surface on the same clock instead of making the
// browser reinterpret a local appointment as UTC.
const iso = (day: string, time: string) => {
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute, second = 0] = time.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, date, hour + 5, minute, second)).toISOString();
};
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const balanceKey = (productId: string, locationId: string) => `${productId}:${locationId}`;
const fromCents = (cents: number) => cents / 100;

export function demoWeekWindow(): { from: string; to: string } {
  return { from: "2026-08-10T05:00:00.000Z", to: "2026-08-17T05:00:00.000Z" };
}

export function demoDateKey(instant: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DEMO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}

/** Same clock label as Inicio: today's appointments show the hour; the rest show the weekday. */
export function demoMomentLabel(instant: string): string {
  const time = new Intl.DateTimeFormat("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: DEMO_TIME_ZONE,
  }).format(new Date(instant));
  if (demoDateKey(instant) === demoDateKey(DEMO_NOW)) return time;
  const date = new Intl.DateTimeFormat("es-PE", {
    weekday: "long",
    day: "numeric",
    timeZone: DEMO_TIME_ZONE,
  }).format(new Date(instant));
  return `${date} · ${time}`;
}

function actorForRole(role: ProductRole): DemoActor {
  return {
    role,
    organizationId: "org-demo",
    locationId: role === "owner" ? null : "lince",
    practitionerId: role === "collaborator" ? "valeria" : null,
    capabilities: capabilitiesForRole(role),
  };
}

// Coherent, explicitly synthetic activity gives the demo enough depth to show
// trends without making the API mode look more complete than its contracts.
const demoPatients: DemoPatient[] = [
  { id: "patient-sofia", name: "Sofía Cárdenas", phone: "+51 989 410 263", locationId: "magdalena", practitionerId: "valeria", treatment: "Limpieza dental", leadId: null },
  { id: "patient-camila", name: "Camila Núñez", phone: "+51 964 218 507", locationId: "lince", practitionerId: "valeria", treatment: "Blanqueamiento", leadId: null },
  { id: "patient-fernando", name: "Fernando Paredes", phone: "+51 951 720 481", locationId: "magdalena", practitionerId: "valeria", treatment: "Endodoncia", leadId: null },
  { id: "patient-paola", name: "Paola Herrera", phone: "+51 986 302 194", locationId: "lince", practitionerId: "valeria", treatment: "Evaluación", leadId: null },
  { id: "patient-pedro", name: "Pedro Salazar", phone: "+51 979 113 628", locationId: "lince", practitionerId: "mateo", treatment: "Ortodoncia", leadId: null },
  { id: "patient-ricardo", name: "Ricardo Vega", phone: "+51 940 688 135", locationId: "jesus-maria", practitionerId: "mateo", treatment: "Implante", leadId: null },
];

type SeedAppointment = [key: string, patientId: string, practitionerId: string, locationId: string, serviceName: string, day: string, time: string, amount: number, state?: DemoAppointment["state"]];
const seedAppointments: SeedAppointment[] = [
  ["sofia-10", "patient-sofia", "valeria", "magdalena", "Limpieza", "2026-08-10", "10:00", 180],
  ["pedro-10", "patient-pedro", "mateo", "lince", "Ortodoncia", "2026-08-10", "09:00", 500],
  ["camila-11", "patient-camila", "valeria", "lince", "Blanqueamiento", "2026-08-11", "09:30", 420],
  ["ricardo-11", "patient-ricardo", "mateo", "jesus-maria", "Implante", "2026-08-11", "11:00", 850],
  ["fernando-12", "patient-fernando", "valeria", "magdalena", "Endodoncia", "2026-08-12", "09:00", 360],
  ["pedro-12", "patient-pedro", "mateo", "lince", "Ortodoncia", "2026-08-12", "10:30", 500],
  ["paola-13", "patient-paola", "valeria", "lince", "Evaluación", "2026-08-13", "09:00", 100],
  ["camila-cancelled", "patient-camila", "mateo", "lince", "Blanqueamiento", "2026-08-13", "10:00", 420, "cancelled"],
  ["sofia-13", "patient-sofia", "valeria", "magdalena", "Limpieza", "2026-08-13", "12:30", 180],
  ["ricardo-14", "patient-ricardo", "valeria", "magdalena", "Implante", "2026-08-14", "09:00", 850],
  ["pedro-14", "patient-pedro", "mateo", "lince", "Ortodoncia", "2026-08-14", "11:00", 500],
  ["paola-14", "patient-paola", "mateo", "lince", "Evaluación", "2026-08-14", "15:30", 100],
  ["camila-15", "patient-camila", "valeria", "lince", "Blanqueamiento", "2026-08-15", "10:00", 420],
  ["fernando-15", "patient-fernando", "mateo", "magdalena", "Endodoncia", "2026-08-15", "11:00", 360],
  ["sofia-15", "patient-sofia", "valeria", "magdalena", "Limpieza", "2026-08-15", "12:30", 180],
  ["ricardo-16", "patient-ricardo", "mateo", "jesus-maria", "Implante", "2026-08-16", "10:00", 850],
];
const demoAppointments: DemoAppointment[] = seedAppointments.map(([key, patientId, practitionerId, locationId, serviceName, day, time, amount, state = "confirmed"]) => {
  const startAt = iso(day, time);
  return {
    id: `apt-demo-${key}`,
    patientId,
    leadId: null,
    locationId,
    practitionerId,
    serviceId: `svc-${serviceName.toLowerCase().replaceAll(" ", "-")}`,
    serviceName,
    startAt,
    endAt: new Date(new Date(startAt).getTime() + 60 * 60_000).toISOString(),
    state,
    amount,
  };
});

export function createDemoSnapshot(): OdontoSnapshot {
  return {
    version: 4,
    generatedAt: DEMO_NOW,
    status: "ready",
    errorMessage: null,
    actor: actorForRole("admin"),
    locations: [
      { id: "lince", name: "Lince", timezone: "America/Lima" },
      { id: "jesus-maria", name: "Jesús María", timezone: "America/Lima" },
      { id: "magdalena", name: "Magdalena", timezone: "America/Lima" },
    ],
    practitioners: [
      { id: "valeria", name: "Dra. Valeria Soto", specialty: "Estética dental", locationIds: ["lince", "magdalena"] },
      { id: "mateo", name: "Dr. Mateo Ruiz", specialty: "Ortodoncia", locationIds: ["lince", "jesus-maria"] },
    ],
    leads: [
      { id: "lead-carlos", name: "Carlos Rivas", phone: "+51 965 241 830", status: "scheduled", source: "Referido", need: "Ortodoncia", locationId: "lince", patientId: "patient-carlos", lastContactAt: iso("2026-08-13", "10:30") },
      { id: "lead-diego", name: "Diego Salazar", phone: "+51 977 104 862", status: "contacted", source: "Google", need: "Evaluación general", locationId: null, patientId: null, lastContactAt: iso("2026-08-11", "09:15") },
      { id: "lead-maria", name: "María Loayza", phone: "+51 930 684 211", status: "new", source: "Instagram", need: "Endodoncia", locationId: "jesus-maria", patientId: null, lastContactAt: null },
      { id: "lead-jose", name: "José Molina", phone: "+51 945 318 206", status: "patient", source: "Web", need: "Implante", locationId: "magdalena", patientId: "patient-jose", lastContactAt: iso("2026-08-12", "14:20") },
    ],
    patients: [
      { id: "patient-ana", name: "Ana Beltrán", phone: "+51 987 654 321", locationId: "lince", practitionerId: "valeria", treatment: "Blanqueamiento", leadId: null },
      { id: "patient-carlos", name: "Carlos Rivas", phone: "+51 965 241 830", locationId: "lince", practitionerId: "mateo", treatment: "Ortodoncia", leadId: "lead-carlos" },
      { id: "patient-lucia", name: "Lucía Paredes", phone: "+51 922 865 174", locationId: "magdalena", practitionerId: "valeria", treatment: "Endodoncia", leadId: null },
      { id: "patient-jose", name: "José Molina", phone: "+51 945 318 206", locationId: "magdalena", practitionerId: "valeria", treatment: "Implante", leadId: "lead-jose" },
      ...demoPatients,
    ],
    appointments: [
      { id: "apt-ana", patientId: "patient-ana", leadId: null, locationId: "lince", practitionerId: "valeria", serviceId: "svc-blanqueamiento", serviceName: "Blanqueamiento", startAt: iso("2026-08-14", "10:30"), endAt: iso("2026-08-14", "11:30"), state: "confirmed", amount: 420 },
      { id: "apt-carlos", patientId: "patient-carlos", leadId: "lead-carlos", locationId: "lince", practitionerId: "mateo", serviceId: "svc-ortodoncia", serviceName: "Ortodoncia", startAt: iso("2026-08-15", "09:00"), endAt: iso("2026-08-15", "10:00"), state: "confirmed", amount: 500 },
      { id: "apt-lucia", patientId: "patient-lucia", leadId: null, locationId: "magdalena", practitionerId: "valeria", serviceId: "svc-endodoncia", serviceName: "Endodoncia", startAt: iso("2026-08-13", "11:00"), endAt: iso("2026-08-13", "12:00"), state: "confirmed", amount: 180 },
      { id: "apt-jose", patientId: "patient-jose", leadId: "lead-jose", locationId: "magdalena", practitionerId: "valeria", serviceId: "svc-implante", serviceName: "Implante", startAt: iso("2026-08-14", "14:00"), endAt: iso("2026-08-14", "15:00"), state: "confirmed", amount: 850 },
      { id: "apt-cancelled", patientId: "patient-carlos", leadId: "lead-carlos", locationId: "jesus-maria", practitionerId: "mateo", serviceId: "svc-evaluacion", serviceName: "Evaluación", startAt: iso("2026-08-12", "12:00"), endAt: iso("2026-08-12", "12:45"), state: "cancelled", amount: 100 },
      ...demoAppointments,
    ],
    visits: [
      { id: "visit-ana", appointmentId: "apt-ana", patientId: "patient-ana", locationId: "lince", practitionerId: "valeria", startedAt: iso("2026-08-14", "10:35"), closedAt: iso("2026-08-14", "11:40") },
      { id: "visit-lucia", appointmentId: "apt-lucia", patientId: "patient-lucia", locationId: "magdalena", practitionerId: "valeria", startedAt: iso("2026-08-13", "11:04"), closedAt: iso("2026-08-13", "12:10") },
      { id: "visit-demo-sofia", appointmentId: "apt-demo-sofia-10", patientId: "patient-sofia", locationId: "magdalena", practitionerId: "valeria", startedAt: iso("2026-08-10", "10:05"), closedAt: iso("2026-08-10", "10:52") },
      { id: "visit-demo-pedro", appointmentId: "apt-demo-pedro-10", patientId: "patient-pedro", locationId: "lince", practitionerId: "mateo", startedAt: iso("2026-08-10", "09:03"), closedAt: iso("2026-08-10", "09:55") },
      { id: "visit-demo-camila", appointmentId: "apt-demo-camila-11", patientId: "patient-camila", locationId: "lince", practitionerId: "valeria", startedAt: iso("2026-08-11", "09:35"), closedAt: iso("2026-08-11", "10:20") },
      { id: "visit-demo-fernando", appointmentId: "apt-demo-fernando-12", patientId: "patient-fernando", locationId: "magdalena", practitionerId: "valeria", startedAt: iso("2026-08-12", "09:05"), closedAt: iso("2026-08-12", "10:02") },
      { id: "visit-demo-paola", appointmentId: "apt-demo-paola-13", patientId: "patient-paola", locationId: "lince", practitionerId: "valeria", startedAt: iso("2026-08-13", "09:06"), closedAt: iso("2026-08-13", "09:42") },
    ],
    executions: [
      { id: "exec-ana", visitId: "visit-ana", serviceId: "svc-blanqueamiento", serviceName: "Blanqueamiento", price: 420, executedAt: iso("2026-08-14", "11:40"), chargeId: "charge-ana" },
      { id: "exec-lucia", visitId: "visit-lucia", serviceId: "svc-endodoncia", serviceName: "Endodoncia", price: 180, executedAt: iso("2026-08-13", "12:10"), chargeId: "charge-lucia" },
      { id: "exec-demo-sofia", visitId: "visit-demo-sofia", serviceId: "svc-limpieza", serviceName: "Limpieza", price: 180, executedAt: iso("2026-08-10", "10:52"), chargeId: "charge-demo-sofia" },
      { id: "exec-demo-pedro", visitId: "visit-demo-pedro", serviceId: "svc-ortodoncia", serviceName: "Ortodoncia", price: 500, executedAt: iso("2026-08-10", "09:55"), chargeId: "charge-demo-pedro" },
      { id: "exec-demo-camila", visitId: "visit-demo-camila", serviceId: "svc-blanqueamiento", serviceName: "Blanqueamiento", price: 420, executedAt: iso("2026-08-11", "10:20"), chargeId: "charge-demo-camila" },
      { id: "exec-demo-fernando", visitId: "visit-demo-fernando", serviceId: "svc-endodoncia", serviceName: "Endodoncia", price: 360, executedAt: iso("2026-08-12", "10:02"), chargeId: "charge-demo-fernando" },
      { id: "exec-demo-paola", visitId: "visit-demo-paola", serviceId: "svc-evaluacion", serviceName: "Evaluación", price: 100, executedAt: iso("2026-08-13", "09:42"), chargeId: "charge-demo-paola" },
    ],
    charges: [
      { id: "charge-ana", executionId: "exec-ana", locationId: "lince", patientId: "patient-ana", amount: 420, createdAt: iso("2026-08-14", "11:40") },
      { id: "charge-lucia", executionId: "exec-lucia", locationId: "magdalena", patientId: "patient-lucia", amount: 180, createdAt: iso("2026-08-13", "12:15") },
      { id: "charge-demo-sofia", executionId: "exec-demo-sofia", locationId: "magdalena", patientId: "patient-sofia", amount: 180, createdAt: iso("2026-08-10", "10:52") },
      { id: "charge-demo-pedro", executionId: "exec-demo-pedro", locationId: "lince", patientId: "patient-pedro", amount: 500, createdAt: iso("2026-08-10", "09:55") },
      { id: "charge-demo-camila", executionId: "exec-demo-camila", locationId: "lince", patientId: "patient-camila", amount: 420, createdAt: iso("2026-08-11", "10:20") },
      { id: "charge-demo-fernando", executionId: "exec-demo-fernando", locationId: "magdalena", patientId: "patient-fernando", amount: 360, createdAt: iso("2026-08-12", "10:02") },
      { id: "charge-demo-paola", executionId: "exec-demo-paola", locationId: "lince", patientId: "patient-paola", amount: 100, createdAt: iso("2026-08-13", "09:42") },
    ],
    payments: [
      { id: "pay-ana-1", chargeId: "charge-ana", amount: 280, method: "Yape", paidAt: iso("2026-08-14", "12:15"), idempotencyKey: "seed-pay-ana" },
      { id: "pay-lucia", chargeId: "charge-lucia", amount: 180, method: "Tarjeta", paidAt: iso("2026-08-13", "13:00"), idempotencyKey: "seed-pay-lucia" },
      { id: "pay-demo-sofia", chargeId: "charge-demo-sofia", amount: 180, method: "Tarjeta", paidAt: iso("2026-08-10", "11:00"), idempotencyKey: "seed-pay-demo-sofia" },
      { id: "pay-demo-pedro", chargeId: "charge-demo-pedro", amount: 250, method: "Yape", paidAt: iso("2026-08-10", "10:05"), idempotencyKey: "seed-pay-demo-pedro" },
      { id: "pay-demo-camila", chargeId: "charge-demo-camila", amount: 420, method: "Tarjeta", paidAt: iso("2026-08-11", "10:30"), idempotencyKey: "seed-pay-demo-camila" },
      { id: "pay-demo-fernando", chargeId: "charge-demo-fernando", amount: 360, method: "Efectivo", paidAt: iso("2026-08-12", "10:15"), idempotencyKey: "seed-pay-demo-fernando" },
    ],
    products: [
      { id: "prod-guantes", name: "Guantes de nitrilo", unit: "cajas", kind: "consumible" },
      { id: "prod-resina", name: "Resina compuesta A2", unit: "unidades", kind: "consumible" },
      { id: "prod-anestesia", name: "Anestesia lidocaína 2%", unit: "cartuchos", kind: "consumible" },
    ],
    balances: { "prod-guantes:lince": 180, "prod-guantes:jesus-maria": 60, "prod-resina:lince": 12, "prod-anestesia:magdalena": 4 },
    stockMovements: [
      { id: "move-1", productId: "prod-guantes", type: "entry", locationId: "lince", destinationLocationId: null, transferId: null, quantity: 240, reason: "Compra inicial", createdAt: iso("2026-08-13", "09:00") },
      { id: "move-2", productId: "prod-resina", type: "adjustment", locationId: "lince", destinationLocationId: null, transferId: null, quantity: -3, reason: "Rotura de envase", createdAt: iso("2026-08-14", "11:00") },
    ],
    clinicalRecords: [{ id: "record-ana", visitId: "visit-ana", patientId: "patient-ana", note: "Sensibilidad leve en tercio cervical. Evolución estable.", consent: "recorded", updatedAt: iso("2026-08-14", "11:42") }],
    requests: [
      { id: "request-1", patientId: "patient-ana", createdBy: "valeria", type: "clinical", title: "Cerrar evolución de blanqueamiento", status: "open", createdAt: iso("2026-08-14", "11:45") },
      { id: "request-2", patientId: "patient-lucia", createdBy: "valeria", type: "laboratory", title: "Enviar radiografía periapical", status: "in_progress", createdAt: iso("2026-08-13", "12:20") },
      { id: "request-demo-sofia", patientId: "patient-sofia", createdBy: "valeria", type: "clinical", title: "Revisar evolución de limpieza", status: "done", createdAt: iso("2026-08-10", "11:10") },
      { id: "request-demo-camila", patientId: "patient-camila", createdBy: "valeria", type: "administrative", title: "Confirmar consentimiento", status: "in_progress", createdAt: iso("2026-08-11", "10:25") },
      { id: "request-demo-pedro", patientId: "patient-pedro", createdBy: "mateo", type: "laboratory", title: "Solicitar modelo de estudio", status: "open", createdAt: iso("2026-08-14", "11:20") },
      { id: "request-demo-paola", patientId: "patient-paola", createdBy: "valeria", type: "clinical", title: "Completar indicaciones de evaluación", status: "open", createdAt: iso("2026-08-13", "09:50") },
    ],
    labOrders: [
      { id: "lab-1", requestId: "request-2", patientId: "patient-lucia", status: "requested", dueAt: iso("2026-08-18", "17:00") },
      { id: "lab-demo-pedro", requestId: "request-demo-pedro", patientId: "patient-pedro", status: "requested", dueAt: iso("2026-08-19", "17:00") },
    ],
    leadEvents: [{ id: "lead-event-1", leadId: "lead-carlos", kind: "contact", label: "WhatsApp enviado", createdAt: iso("2026-08-13", "10:30") }],
    auditEvents: [],
  };
}

function createEmptySnapshot(): OdontoSnapshot {
  return {
    version: 4,
    generatedAt: new Date().toISOString(),
    status: "loading",
    errorMessage: null,
    actor: { ...actorForRole("admin"), capabilities: [] },
    locations: [],
    practitioners: [],
    leads: [],
    patients: [],
    appointments: [],
    visits: [],
    executions: [],
    charges: [],
    payments: [],
    products: [],
    balances: {},
    stockMovements: [],
    clinicalRecords: [],
    requests: [],
    labOrders: [],
    leadEvents: [],
    auditEvents: [],
  };
}

function clone<T>(value: T): T { return structuredClone(value); }
function locationName(snapshot: OdontoSnapshot, id: string | null): string { return snapshot.locations.find((item) => item.id === id)?.name ?? "Sin sede"; }
function ensureCapability(snapshot: OdontoSnapshot, capability: CapabilityCode) { if (!hasCapability(snapshot.actor.role, capability)) throw new RepositoryError("FORBIDDEN", "Tu perfil no puede ejecutar esta acción."); }
function ensure(snapshot: OdontoSnapshot, condition: unknown, code: string, message: string): asserts condition { if (!condition) throw new RepositoryError(code, message); }

function reduceMock(snapshot: OdontoSnapshot, command: OdontoCommand): { next: OdontoSnapshot; result: CommandResult } {
  const next = clone(snapshot);
  const now = DEMO_NOW;
  const event = (label: string) => next.auditEvents.unshift({ id: makeId("audit"), label, createdAt: now, actor: next.actor.role });

  switch (command.type) {
    case "createLead": {
      ensureCapability(next, "leads.create");
      const name = command.name.trim();
      const phone = command.phone.trim();
      ensure(next, name && phone && command.source.trim() && command.need.trim(), "INVALID_LEAD", "Completa el nombre, teléfono, origen y necesidad del lead.");
      const lead: DemoLead = {
        id: makeId("lead"), name, phone, email: command.email?.trim() || null,
        status: "new", source: command.source.trim(), need: command.need.trim(),
        locationId: null, patientId: null, lastContactAt: null,
      };
      next.leads.unshift(lead);
      event("Lead demo creado");
      return { next, result: { id: lead.id, message: "Lead creado en demo" } };
    }
    case "assignLeadLocation": {
      ensureCapability(next, "leads.assign_location");
      const lead = next.leads.find((item) => item.id === command.leadId);
      ensure(next, lead, "LEAD_NOT_FOUND", "El lead no existe.");
      ensure(next, next.locations.some((item) => item.id === command.locationId), "LOCATION_NOT_FOUND", "La sede no existe.");
      lead.locationId = command.locationId;
      event(`Lead asignado a ${locationName(next, command.locationId)}`);
      return { next, result: { id: lead.id, message: "Lead asignado a la sede" } };
    }
    case "createAppointment": {
      ensureCapability(next, "appointments.create");
      const item: DemoAppointment = { id: makeId("apt"), patientId: command.patientId ?? null, leadId: command.leadId ?? null, locationId: command.locationId, practitionerId: command.practitionerId, serviceId: command.serviceId, serviceName: command.serviceName, startAt: command.startAt, endAt: command.endAt, state: "confirmed", amount: command.amount };
      next.appointments.unshift(item);
      event("Cita creada");
      return { next, result: { id: item.id, message: "Cita creada correctamente" } };
    }
    case "cancelAppointment": {
      ensureCapability(next, "appointments.cancel");
      const appointment = next.appointments.find((item) => item.id === command.appointmentId);
      ensure(next, appointment, "APPOINTMENT_NOT_FOUND", "La cita no existe.");
      appointment.state = "cancelled";
      event("Cita cancelada");
      return { next, result: { id: appointment.id, message: "Cita cancelada" } };
    }
    case "rescheduleAppointment": {
      ensureCapability(next, "appointments.reschedule");
      const appointment = next.appointments.find((item) => item.id === command.appointmentId);
      ensure(next, appointment, "APPOINTMENT_NOT_FOUND", "La cita no existe.");
      appointment.startAt = command.startAt;
      appointment.endAt = command.endAt;
      event("Cita reprogramada");
      return { next, result: { id: appointment.id, message: "Cita reprogramada" } };
    }
    case "createPatient": {
      ensureCapability(next, "patients.create");
      const patient: DemoPatient = { id: makeId("patient"), name: command.name, phone: command.phone, locationId: command.locationId, practitionerId: null, treatment: "Por definir", leadId: command.leadId ?? null };
      next.patients.unshift(patient);
      if (command.leadId) {
        const lead = next.leads.find((item) => item.id === command.leadId);
        if (lead) { lead.patientId = patient.id; lead.status = "patient"; lead.locationId = command.locationId; }
      }
      event("Paciente creado");
      return { next, result: { id: patient.id, message: "Paciente creado" } };
    }
    case "updatePatient": {
      ensureCapability(next, "patients.read");
      const patient = next.patients.find((item) => item.id === command.patientId);
      ensure(next, patient, "PATIENT_NOT_FOUND", "El paciente ya no está disponible.");
      ensure(next, command.name.trim() && command.phone.trim(), "INVALID_PATIENT", "Completa el nombre y el teléfono.");
      patient.name = command.name.trim();
      patient.phone = command.phone.trim();
      event("Ficha demo actualizada");
      return { next, result: { id: patient.id, message: "Ficha actualizada en demo" } };
    }
    case "promoteLeadToPatient": {
      const lead = next.leads.find((item) => item.id === command.leadId);
      ensure(next, lead, "LEAD_NOT_FOUND", "El lead no existe.");
      ensure(next, !lead.patientId, "ALREADY_PATIENT", "El lead ya está vinculado a un paciente.");
      return reduceMock(next, { type: "createPatient", name: lead.name, phone: lead.phone, locationId: command.locationId, leadId: lead.id });
    }
    case "registerVisit": {
      ensureCapability(next, "visits.create");
      let appointment: DemoAppointment | undefined;
      if (command.appointmentId) {
        appointment = next.appointments.find((item) => item.id === command.appointmentId);
        ensure(next, appointment, "APPOINTMENT_NOT_FOUND", "La cita no existe.");
        ensure(next, appointment.state === "confirmed", "APPOINTMENT_NOT_CONFIRMED", "Una cita cancelada no puede crear una visita.");
        ensure(next, appointment.patientId, "PATIENT_REQUIRED", "La cita necesita un paciente antes de registrar la visita.");
        if (next.actor.role === "collaborator") ensure(next, appointment.practitionerId === next.actor.practitionerId, "PRACTITIONER_SCOPE", "La cita no pertenece a tu jornada clínica.");
        const current = next.visits.find((item) => item.appointmentId === appointment?.id);
        if (current) return { next, result: { id: current.id, message: "La visita ya estaba registrada" } };
      }
      const patientId = appointment?.patientId ?? command.patientId;
      const visit: DemoVisit = { id: makeId("visit"), appointmentId: appointment?.id ?? null, patientId, locationId: appointment?.locationId ?? command.locationId ?? next.actor.locationId ?? "lince", practitionerId: appointment?.practitionerId ?? command.practitionerId ?? next.actor.practitionerId ?? "valeria", startedAt: now, closedAt: null };
      next.visits.unshift(visit);
      event("Visita registrada");
      return { next, result: { id: visit.id, message: "Llegada registrada" } };
    }
    case "registerWalkIn": {
      ensureCapability(next, "visits.create");
      if (next.actor.role === "collaborator") ensure(next, command.practitionerId === next.actor.practitionerId && next.practitioners.find((item) => item.id === command.practitionerId)?.locationIds.includes(command.locationId), "PRACTITIONER_SCOPE", "El walk-in no pertenece a tu jornada clínica.");
      const patient: DemoPatient = { id: makeId("patient"), name: command.patientName, phone: command.phone, locationId: command.locationId, practitionerId: command.practitionerId, treatment: "Walk-in demo", leadId: null };
      next.patients.unshift(patient);
      const visit: DemoVisit = { id: makeId("visit"), appointmentId: null, patientId: patient.id, locationId: command.locationId, practitionerId: command.practitionerId, startedAt: now, closedAt: null };
      next.visits.unshift(visit);
      event("Walk-in demo registrado");
      return { next, result: { id: visit.id, message: "Walk-in registrado en modo demo" } };
    }
    case "completeService": {
      ensureCapability(next, "executions.create");
      const visit = next.visits.find((item) => item.id === command.visitId);
      ensure(next, visit, "VISIT_NOT_FOUND", "La visita no existe.");
      if (next.actor.role === "collaborator") ensure(next, visit.practitionerId === next.actor.practitionerId, "PRACTITIONER_SCOPE", "La visita no pertenece a tu jornada clínica.");
      const existing = next.executions.find((item) => item.visitId === visit.id && item.serviceId === command.serviceId);
      if (existing) return { next, result: { id: existing.id, message: "El servicio ya estaba ejecutado" } };
      const execution: DemoExecution = { id: makeId("exec"), visitId: visit.id, serviceId: command.serviceId, serviceName: command.serviceName, price: command.price, executedAt: now, chargeId: null };
      const charge: DemoCharge = { id: makeId("charge"), executionId: execution.id, locationId: visit.locationId, patientId: visit.patientId, amount: command.price, createdAt: now };
      execution.chargeId = charge.id;
      next.executions.unshift(execution);
      next.charges.unshift(charge);
      visit.closedAt = now;
      event("Servicio completado y cargo creado");
      return { next, result: { id: execution.id, message: "Servicio completado y cargo creado" } };
    }
    case "registerPayment": {
      ensureCapability(next, "payments.create");
      const existing = next.payments.find((item) => item.idempotencyKey === command.idempotencyKey);
      if (existing) return { next, result: { id: existing.id, message: "Pago ya registrado" } };
      const charge = next.charges.find((item) => item.id === command.chargeId);
      ensure(next, charge, "CHARGE_NOT_FOUND", "El cargo no existe.");
      const paidCents = next.payments.filter((item) => item.chargeId === charge.id).reduce((sum, item) => sum + toMoneyCents(item.amount), 0);
      const outstandingCents = toMoneyCents(charge.amount) - paidCents;
      const amountCents = toMoneyCents(command.amount);
      ensure(next, amountCents > 0, "INVALID_AMOUNT", "El monto debe ser mayor que cero.");
      ensure(next, amountCents <= outstandingCents, "OVERPAYMENT", "El pago supera el saldo pendiente.");
      const payment: DemoPayment = { id: makeId("payment"), chargeId: charge.id, amount: fromCents(amountCents), method: command.method, paidAt: now, idempotencyKey: command.idempotencyKey };
      next.payments.unshift(payment);
      event("Pago registrado en Caja");
      return { next, result: { id: payment.id, message: "Pago registrado" } };
    }
    case "moveStock": {
      ensureCapability(next, "movements.create");
      ensure(next, command.quantity !== 0, "INVALID_QUANTITY", "La cantidad no puede ser cero.");
      ensure(next, next.products.some((product) => product.id === command.productId), "PRODUCT_NOT_FOUND", "El producto no existe.");
      ensure(next, next.locations.some((location) => location.id === command.locationId), "LOCATION_NOT_FOUND", "La sede de origen no existe.");
      const sourceKey = balanceKey(command.productId, command.locationId);
      const source = next.balances[sourceKey] ?? 0;
      if (command.kind === "entry") ensure(next, command.quantity > 0, "INVALID_QUANTITY", "La entrada debe ser positiva.");
      if (command.kind === "adjustment") ensure(next, command.reason?.trim(), "REASON_REQUIRED", "El ajuste requiere un motivo.");
      if (command.kind === "transfer") {
        ensure(next, command.destinationLocationId && command.destinationLocationId !== command.locationId, "DESTINATION_REQUIRED", "La transferencia necesita otra sede.");
        ensure(next, next.locations.some((location) => location.id === command.destinationLocationId), "LOCATION_NOT_FOUND", "La sede de destino no existe.");
        ensure(next, command.quantity > 0 && source >= command.quantity, "INSUFFICIENT_STOCK", "Stock insuficiente para transferir.");
        next.balances[sourceKey] = source - command.quantity;
        const destinationKey = balanceKey(command.productId, command.destinationLocationId);
        next.balances[destinationKey] = (next.balances[destinationKey] ?? 0) + command.quantity;
      } else {
        ensure(next, command.kind === "entry" ? command.quantity > 0 : source + command.quantity >= 0, "INSUFFICIENT_STOCK", "El movimiento dejaría stock negativo.");
        next.balances[sourceKey] = source + command.quantity;
      }
      let movementId: string;
      if (command.kind === "transfer") {
        const transferId = makeId("transfer");
        const outgoing: DemoStockMovement = { id: makeId("move"), productId: command.productId, type: "transfer_out", locationId: command.locationId, destinationLocationId: command.destinationLocationId!, transferId, quantity: command.quantity, reason: command.reason ?? null, createdAt: now };
        const incoming: DemoStockMovement = { id: makeId("move"), productId: command.productId, type: "transfer_in", locationId: command.destinationLocationId!, destinationLocationId: command.locationId, transferId, quantity: command.quantity, reason: command.reason ?? null, createdAt: now };
        next.stockMovements.unshift(incoming, outgoing);
        movementId = transferId;
      } else {
        const movement: DemoStockMovement = { id: makeId("move"), productId: command.productId, type: command.kind, locationId: command.locationId, destinationLocationId: null, transferId: null, quantity: command.quantity, reason: command.reason ?? null, createdAt: now };
        next.stockMovements.unshift(movement);
        movementId = movement.id;
      }
      event(`Movimiento de inventario: ${command.kind}`);
      return { next, result: { id: movementId, message: "Movimiento aplicado" } };
    }
    case "createProduct": {
      ensureCapability(next, "products.create");
      ensure(next, command.name.trim() && command.unit.trim(), "INVALID_PRODUCT", "El producto necesita nombre y unidad.");
      const product: DemoProduct = { id: makeId("product"), name: command.name.trim(), unit: command.unit.trim(), kind: command.kind };
      next.products.unshift(product);
      event("Producto creado");
      return { next, result: { id: product.id, message: "Producto creado" } };
    }
    case "updateClinicalRecord": {
      ensureCapability(next, "clinical_records.update");
      const visit = next.visits.find((item) => item.id === command.visitId);
      ensure(next, visit, "VISIT_NOT_FOUND", "La visita no existe.");
      ensure(next, visit.patientId === command.patientId, "PATIENT_VISIT_MISMATCH", "El registro clínico no corresponde a esta visita.");
      if (next.actor.role === "collaborator") ensure(next, visit.practitionerId === next.actor.practitionerId, "PRACTITIONER_SCOPE", "La visita no pertenece a tu jornada clínica.");
      const current = next.clinicalRecords.find((item) => item.visitId === command.visitId);
      const record: DemoClinicalRecord = { id: current?.id ?? makeId("record"), visitId: command.visitId, patientId: command.patientId, note: command.note, consent: command.consent, updatedAt: now };
      if (current) Object.assign(current, record); else next.clinicalRecords.unshift(record);
      event("Registro clínico actualizado");
      return { next, result: { id: record.id, message: "Registro clínico actualizado" } };
    }
    case "createRequest": {
      ensureCapability(next, "requests.create");
      const patient = next.patients.find((item) => item.id === command.patientId);
      ensure(next, patient, "PATIENT_NOT_FOUND", "El paciente no existe.");
      if (next.actor.role === "collaborator") ensure(next, patient.practitionerId === next.actor.practitionerId, "PRACTITIONER_SCOPE", "El paciente no pertenece a tu jornada clínica.");
      const request: DemoRequest = { id: makeId("request"), patientId: command.patientId, createdBy: next.actor.practitionerId ?? next.actor.role, type: command.requestType, title: command.title, status: "open", createdAt: now };
      next.requests.unshift(request);
      event("Solicitud creada");
      return { next, result: { id: request.id, message: "Solicitud creada" } };
    }
    case "updateRequest": {
      ensureCapability(next, "requests.update");
      const request = next.requests.find((item) => item.id === command.requestId);
      ensure(next, request, "REQUEST_NOT_FOUND", "La solicitud no existe.");
      request.status = command.status;
      event("Solicitud actualizada");
      return { next, result: { id: request.id, message: "Solicitud actualizada" } };
    }
    case "createLabOrder": {
      ensureCapability(next, "labs.create");
      const order: DemoLabOrder = { id: makeId("lab"), requestId: command.requestId, patientId: command.patientId, status: "requested", dueAt: command.dueAt };
      next.labOrders.unshift(order);
      event("Orden de laboratorio creada");
      return { next, result: { id: order.id, message: "Orden de laboratorio creada" } };
    }
    case "recordLeadContact": {
      ensureCapability(next, "leads.create");
      const lead = next.leads.find((item) => item.id === command.leadId);
      ensure(next, lead, "LEAD_NOT_FOUND", "El lead no existe.");
      lead.status = lead.status === "new" ? "contacted" : lead.status;
      lead.lastContactAt = now;
      const eventItem: DemoLeadEvent = { id: makeId("lead-event"), leadId: lead.id, kind: "contact", label: command.label, createdAt: now };
      next.leadEvents.unshift(eventItem);
      event("Contacto demo registrado");
      return { next, result: { id: eventItem.id, message: "Contacto registrado en demo" } };
    }
  }
}

export interface OdontoRepository {
  getSnapshot(): OdontoSnapshot;
  getServerSnapshot(): OdontoSnapshot;
  subscribe(listener: () => void): () => void;
  hydrate(): Promise<void>;
  setActor(role: ProductRole): void;
  resetDemo(): void;
  dispatch(command: OdontoCommand): Promise<CommandResult>;
}

class BaseRepository implements OdontoRepository {
  protected snapshot: OdontoSnapshot;
  protected listeners = new Set<() => void>();
  protected hydrated = false;
  protected readonly apiMode: boolean;

  constructor(snapshot = createDemoSnapshot(), apiMode = false) {
    this.snapshot = snapshot;
    this.apiMode = apiMode;
  }

  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  protected notify() { this.listeners.forEach((listener) => listener()); }
  setActor(role: ProductRole) {
    if (this.snapshot.actor.role === role) return;
    const actor = actorForRole(role);
    this.snapshot = { ...this.snapshot, actor: this.apiMode ? { ...actor, capabilities: [] } : actor, generatedAt: new Date().toISOString() };
    this.notify();
  }
  async hydrate() {
    if (this.hydrated || typeof window === "undefined") return;
    this.hydrated = true;
    // Remove the previous release's clinical snapshot. The current demo is
    // deliberately held in memory for this SPA session only.
    clearLegacySnapshot();
    this.snapshot = { ...this.snapshot, status: "ready", errorMessage: null };
    this.notify();
  }
  resetDemo() {
    throw new RepositoryError("UNSUPPORTED", "El escenario solo puede reiniciarse en modo demo.");
  }
  async dispatch(_command: OdontoCommand): Promise<CommandResult> { throw new RepositoryError("NOT_IMPLEMENTED", "El repositorio no implementa esta acción."); }
}

export class MockDemoRepository extends BaseRepository {
  async dispatch(command: OdontoCommand): Promise<CommandResult> {
    const reduced = reduceMock(this.snapshot, command);
    this.snapshot = reduced.next;
    this.notify();
    return reduced.result;
  }

  resetDemo() {
    this.setScenario("populated");
  }

  setScenario(scenario: DemoScenario) {
    const actor = this.snapshot.actor;
    const next = createDemoSnapshot();
    next.actor = actor;
    if (scenario === "empty") {
      next.leads = [];
      next.patients = [];
      next.appointments = [];
      next.visits = [];
      next.executions = [];
      next.charges = [];
      next.payments = [];
      next.products = [];
      next.balances = {};
      next.stockMovements = [];
      next.clinicalRecords = [];
      next.requests = [];
      next.labOrders = [];
      next.leadEvents = [];
      next.auditEvents = [];
    }
    if (scenario === "loading") next.status = "loading";
    if (scenario === "error") {
      next.status = "error";
      next.errorMessage = "No se pudo cargar la información del escenario.";
    }
    this.snapshot = next;
    this.notify();
  }
}

function unsupported(command: OdontoCommand["type"]): never {
  throw new RepositoryError("UNSUPPORTED", `El comando ${command} requiere un contrato de backend todavía no disponible.`);
}

export class ApiRepository extends BaseRepository {
  constructor() {
    super(createEmptySnapshot(), true);
  }

  async hydrate() {
    if (this.hydrated || typeof window === "undefined") return;
    this.hydrated = true;
    clearLegacySnapshot();
    try {
      await this.refresh();
    } catch (caught) {
      this.snapshot = {
        ...createEmptySnapshot(),
        status: "error",
        errorMessage: caught instanceof Error ? caught.message : "No se pudo cargar la información.",
        actor: this.snapshot.actor,
      };
      this.notify();
    }
  }

  private async refresh() {
    this.snapshot = { ...this.snapshot, status: "loading", errorMessage: null };
    this.notify();
    const [agenda, patients, charges, inventory] = await Promise.all([loadAgenda(), getPatients(), loadCharges(), loadInventoryData()]);
    const locations = inventory.locations.map((item) => ({ id: item.id, name: item.name, timezone: item.timezone }));
    const appointments: DemoAppointment[] = agenda.map((item) => ({
      id: item.id, patientId: null, leadId: item.leadId ? String(item.leadId) : null,
      locationId: item.locationId ? String(item.locationId) : "", practitionerId: item.practitionerId ? String(item.practitionerId) : "",
      serviceId: item.serviceId ? String(item.serviceId) : "", serviceName: item.treatment, startAt: item.startUtc ?? "", endAt: item.endUtc ?? "", state: item.status === "Cancelada" ? "cancelled" : "confirmed", amount: 0,
    }));
    const patientRecords: DemoPatient[] = patients.map((item) => ({ id: item.id, name: item.name, phone: item.phone, locationId: "", practitionerId: null, treatment: "", leadId: null }));
    const mappedCharges: DemoCharge[] = charges.map((item) => ({ id: item.id, executionId: String(item.serviceExecutionId), locationId: "", patientId: "", amount: item.amount, createdAt: item.createdAt }));
    const payments: DemoPayment[] = charges.flatMap((charge) => charge.payments.map((payment) => ({ id: payment.id, chargeId: charge.id, amount: payment.amount, method: payment.method, paidAt: payment.paidAt, idempotencyKey: `api-${payment.id}` })));
    this.snapshot = { ...createEmptySnapshot(), status: "ready", generatedAt: new Date().toISOString(), locations, appointments, patients: patientRecords, charges: mappedCharges, payments, products: inventory.products.map((item) => ({ id: item.id, name: item.name, unit: item.unit, kind: item.kind })), actor: this.snapshot.actor };
    this.notify();
  }

  async dispatch(command: OdontoCommand): Promise<CommandResult> {
    try {
      switch (command.type) {
        case "createAppointment": {
          if (!command.leadId) unsupported(command.type);
          await bookReal({
            lead_id: Number(command.leadId),
            service_id: Number(command.serviceId),
            location_id: Number(command.locationId),
            practitioner_id: Number(command.practitionerId),
            start: command.startAt,
          }, newIdempotencyKey());
          break;
        }
        case "cancelAppointment": await cancelReal(Number(command.appointmentId), newIdempotencyKey()); break;
        case "rescheduleAppointment": await rescheduleReal(Number(command.appointmentId), command.startAt, newIdempotencyKey()); break;
        case "registerPayment": await registerPayment(command.chargeId, { amount: command.amount, method: command.method }, command.idempotencyKey); break;
        case "createPatient": await createPatient({ name: command.name, dni: "", phone: command.phone, branch: locationName(this.snapshot, command.locationId), nextAppointment: "Sin cita", treatment: "Por definir", status: "Activo", origin: "Registro", interest: "Por validar" }); break;
        case "moveStock": {
          const key = newIdempotencyKey();
          if (command.kind === "entry") await registerEntry(command.productId, { location_id: Number(command.locationId), quantity: command.quantity }, key);
          else if (command.kind === "adjustment") {
            if (!command.reason?.trim()) throw new RepositoryError("REASON_REQUIRED", "El ajuste requiere un motivo.");
            await registerAdjustment(command.productId, { location_id: Number(command.locationId), quantity: command.quantity, reason: command.reason.trim() }, key);
          }
          else await registerTransfer(command.productId, { origin_location_id: Number(command.locationId), destination_location_id: Number(command.destinationLocationId), quantity: command.quantity, reason: command.reason ?? null }, key);
          break;
        }
        case "completeService": {
          const visit = await getVisit(Number(command.visitId));
          const execution = await createServiceExecution(visit.id, { service_id: Number(command.serviceId), executed_price: command.price }, newIdempotencyKey());
          await createCharge(execution.id, { amount: command.price } as ChargeCreate, newIdempotencyKey());
          break;
        }
        case "registerVisit": {
          await createVisit({ patient_id: Number(command.patientId), appointment_id: command.appointmentId ? Number(command.appointmentId) : null, practitioner_id: command.practitionerId ? Number(command.practitionerId) : null, location_id: command.locationId ? Number(command.locationId) : null }, newIdempotencyKey());
          break;
        }
        case "registerWalkIn": {
          // The API walk-in contract requires an existing patient. The demo
          // command creates that patient inline, so keep it explicitly local
          // until the product defines the real intake sequence.
          unsupported(command.type);
          break;
        }
        default: unsupported(command.type);
      }
      await this.refresh();
      return { id: makeId("api"), message: "Acción aplicada" };
    } catch (error) {
      this.snapshot = {
        ...this.snapshot,
        status: "error",
        errorMessage: error instanceof Error ? error.message : "No se pudo completar la acción.",
      };
      this.notify();
      if (error instanceof RepositoryError) throw error;
      throw error;
    }
  }
}

export const mockRepository = new MockDemoRepository();
export const apiRepository = new ApiRepository();
export const repository = useMocks ? mockRepository : apiRepository;

export function resetDemo() {
  if (!useMocks) throw new RepositoryError("UNSUPPORTED", "El escenario solo puede reiniciarse en modo demo.");
  mockRepository.resetDemo();
}

export function visitForId(snapshot: OdontoSnapshot, visitId: string): { visit: DemoVisit | undefined; patient: DemoPatient | undefined; appointment: DemoAppointment | undefined } {
  const visit = snapshot.visits.find((item) => item.id === visitId);
  const patient = visit ? snapshot.patients.find((item) => item.id === visit.patientId) : undefined;
  const appointment = visit?.appointmentId ? snapshot.appointments.find((item) => item.id === visit.appointmentId) : undefined;
  return { visit, patient, appointment };
}

export function chargeTotals(snapshot: OdontoSnapshot, locationId?: string | null) {
  const charges = snapshot.charges.filter((charge) => !locationId || charge.locationId === locationId);
  const paidCents = charges.reduce((sum, charge) => sum + snapshot.payments.filter((payment) => payment.chargeId === charge.id).reduce((sub, payment) => sub + toMoneyCents(payment.amount), 0), 0);
  const totalCents = charges.reduce((sum, charge) => sum + toMoneyCents(charge.amount), 0);
  return { charges, paid: fromCents(paidCents), outstanding: fromCents(Math.max(0, totalCents - paidCents)), total: fromCents(totalCents) };
}

export type DemoFinancialPeriod = { from: string; to: string };
export type DemoLocationFinancialSummary = { location: DemoLocation; chargeCents: number; paymentCents: number; outstandingCents: number };

/** Shared Owner/Finanzas definitions. Charges use creation date; payments use payment date; current balance is a snapshot measure. */
export function financialSummary(snapshot: OdontoSnapshot, period: DemoFinancialPeriod, locationId?: string) {
  const locations = snapshot.locations.filter((location) => !locationId || location.id === locationId);
  const locationIds = new Set(locations.map((location) => location.id));
  const allCharges = snapshot.charges.filter((charge) => locationIds.has(charge.locationId));
  const chargeById = new Map(allCharges.map((charge) => [charge.id, charge]));
  const inPeriod = (instant: string) => {
    const day = demoDateKey(instant);
    return day >= period.from && day < period.to;
  };
  const charges = allCharges.filter((charge) => inPeriod(charge.createdAt));
  const payments = snapshot.payments
    .filter((payment) => chargeById.has(payment.chargeId) && inPeriod(payment.paidAt))
    .map((payment) => ({ payment, locationId: chargeById.get(payment.chargeId)!.locationId }));
  const byLocation: DemoLocationFinancialSummary[] = locations.map((location) => {
    const branchCharges = allCharges.filter((charge) => charge.locationId === location.id);
    const branchChargeIds = new Set(branchCharges.map((charge) => charge.id));
    const branchPayments = snapshot.payments.filter((payment) => branchChargeIds.has(payment.chargeId));
    const branchPeriodCharges = charges.filter((charge) => charge.locationId === location.id);
    const branchPeriodPayments = payments.filter((item) => item.locationId === location.id);
    const totalCents = branchCharges.reduce((sum, charge) => sum + toMoneyCents(charge.amount), 0);
    const paidCents = branchPayments.reduce((sum, payment) => sum + toMoneyCents(payment.amount), 0);
    return {
      location,
      chargeCents: branchPeriodCharges.reduce((sum, charge) => sum + toMoneyCents(charge.amount), 0),
      paymentCents: branchPeriodPayments.reduce((sum, item) => sum + toMoneyCents(item.payment.amount), 0),
      outstandingCents: Math.max(0, totalCents - paidCents),
    };
  });
  return {
    charges,
    payments,
    byLocation,
    chargeCents: byLocation.reduce((sum, item) => sum + item.chargeCents, 0),
    paymentCents: byLocation.reduce((sum, item) => sum + item.paymentCents, 0),
    outstandingCents: byLocation.reduce((sum, item) => sum + item.outstandingCents, 0),
  };
}

export const DEMO_FINANCIAL_PERIODS = {
  all: { label: "10–16 ago", from: "2026-08-10", to: "2026-08-17" },
  early: { label: "10–12 ago", from: "2026-08-10", to: "2026-08-13" },
  late: { label: "13–16 ago", from: "2026-08-13", to: "2026-08-17" },
} as const;
export type DemoFinancialPeriodKey = keyof typeof DEMO_FINANCIAL_PERIODS;

export function noShows(snapshot: OdontoSnapshot, now = DEMO_NOW) {
  const cutoff = new Date(now).getTime();
  return snapshot.appointments.filter((appointment) => appointment.state === "confirmed" && new Date(appointment.endAt).getTime() < cutoff && !snapshot.visits.some((visit) => visit.appointmentId === appointment.id));
}

export function confirmationQueue(snapshot: OdontoSnapshot, locationId?: string | null) {
  const today = new Date(DEMO_NOW).getTime();
  const tomorrowEnd = today + 2 * 86_400_000;
  return snapshot.appointments.filter((appointment) => {
    const startsInWindow = new Date(appointment.startAt).getTime() >= today && new Date(appointment.startAt).getTime() <= tomorrowEnd;
    const stillActionable = new Date(appointment.endAt).getTime() >= today;
    return appointment.state === "confirmed" && (!locationId || appointment.locationId === locationId) && startsInWindow && stillActionable && !snapshot.visits.some((visit) => visit.appointmentId === appointment.id);
  });
}

export function detailForVisit(snapshot: OdontoSnapshot, visitId: string): { visit: DemoVisit; patient: DemoPatient; appointment: DemoAppointment | undefined; executions: DemoExecution[]; record: DemoClinicalRecord | undefined } | null {
  const found = visitForId(snapshot, visitId);
  if (!found.visit || !found.patient) return null;
  return { visit: found.visit, patient: found.patient, appointment: found.appointment, executions: snapshot.executions.filter((item) => item.visitId === visitId), record: snapshot.clinicalRecords.find((item) => item.visitId === visitId) };
}

export type { ServiceExecutionRead, VisitDetailRead };
