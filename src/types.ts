import type {
  InboxAction,
  InboxItem,
  InboxKind,
  InboxStatus,
  PaymentMethod as ApiPaymentMethod,
  PaymentVerificationStatus,
} from "./contracts/client";

export type Tone = "cyan" | "blue" | "green" | "amber" | "red" | "purple" | "pink" | "slate";
export type PaymentMethod = ApiPaymentMethod;

export interface Patient {
  id: string;
  initials: string;
  name: string;
  dni: string;
  phone: string;
  branch: string;
  nextAppointment: string;
  treatment: string;
  status: "Activo" | "Lead" | "Pendiente";
  tone: Tone;
  origin: string;
  interest: string;
}

export interface Appointment {
  id: string;
  day: number;
  time: string;
  patient: string;
  treatment: string;
  doctor: string;
  branch: string;
  status: "Confirmada" | "Por confirmar" | "No respondió" | "Cancelada";
  /** Real-mode scheduling identity used by filters and slot actions. */
  leadId?: number;
  serviceId?: number;
  locationId?: number;
  practitionerId?: number;
  /** Canonical patient projection when reception has already qualified it. */
  patientId?: number | string;
  patientName?: string;
  startUtc?: string;
  endUtc?: string;
  timeZone?: string;
}

export interface AgentActivity {
  time: string;
  kind: "Citas" | "Leads";
  icon: "clock" | "check" | "message" | "users";
  tone: Tone;
  action: string;
  patient: string;
  initials: string;
  channel: string;
  status: string;
}

export interface HumanQueueItem {
  id: string;
  name: string;
  initials: string;
  reason: string;
  waiting: string;
  tone: Tone;
}

export interface Automation {
  time: string;
  title: string;
  note: string;
  state: "done" | "pending" | "scheduled" | "automatic";
}

/** A recorded payment against a charge (PaymentRead mapped). */
export interface Payment {
  id: string;
  chargeId?: number;
  amount: number;
  method: PaymentMethod;
  paidAt: string; // ISO instant from the backend
  reference?: string | null;
  receiver?: string | null;
  reconciliationNote?: string | null;
  verificationStatus?: PaymentVerificationStatus;
  verifiedAt?: string | null;
}

/** Cash-visible economic state: a charge and its payments (ChargeRead mapped).
 * Every context field comes from the enriched backend projection. */
export interface Charge {
  id: string;
  serviceExecutionId: number;
  amount: number;
  paid: number;
  outstanding: number;
  createdAt: string; // ISO instant from the backend
  payments: Payment[];
  status: "Pagado" | "Parcial" | "Pendiente";
  visitId: number;
  patientId: number;
  patientName: string;
  serviceId: number;
  serviceName: string;
  locationId: number;
  locationName: string;
  practitionerId: number;
  practitionerName: string;
  executedAt: string;
  /** Derived from the canonical LocationRead used by the adapter. */
  locationTimeZone?: string;
}

/** One canonical service execution in the attendance → charge chain. */
export interface ServiceExecution {
  id: string;
  visitId: number | string;
  serviceId: number;
  serviceName: string;
  executedPrice: number;
  executedAt: string;
  chargeId: number | null;
  patientId: number | string;
  patientName: string;
  locationId: number;
  locationName?: string;
}

/** One attended encounter, with executions when the detail endpoint is used. */
export interface Visit {
  id: string;
  patientId: number | string;
  patientName: string;
  appointmentId: number | string | null;
  practitionerId: number;
  practitionerName: string;
  locationId: number;
  locationName: string;
  startedAt: string;
  executions: ServiceExecution[];
}

export interface ServiceOption {
  id: number;
  name: string;
  durationMinutes: number;
  isActive: boolean;
}

/** A product as the backend knows it: no category/branch/stock/minimum are
 * projected (ProductRead). Stock lives on the ledger per Location. */
export interface Product {
  id: string;
  name: string;
  unit: string;
  kind: "consumible" | "reventa";
  status: "Activo" | "Inactivo"; // derived from is_active
}

/** A clinic location (LocationRead). Named InventoryLocation to avoid the
 * DOM-global `Location` type. */
export interface InventoryLocation {
  id: string;
  name: string;
  timezone: string;
  isActive: boolean;
}

/** Real stock of a product at one location (BalanceRead mapped). */
export interface InventoryBalance {
  productId: string;
  locationId: string;
  available: number; // decimal parsed
}

export type MovementType = "ENTRADA" | "SALIDA" | "ADJUSTMENT" | "TRANSFER_OUT" | "TRANSFER_IN";

/** One kardex row (MovementRead mapped). Quantity is signed: ENTRADA/SALIDA/
 * TRANSFER_IN/TRANSFER_OUT are positive as stored (SALIDA/TRANSFER_OUT
 * subtract from the balance); ADJUSTMENT carries its own sign. */
export interface InventoryMovement {
  id: string;
  productId: string;
  locationId: string;
  type: MovementType;
  quantity: number;
  unitPrice: number | null;
  reason: string | null;
  transferId: string | null;
  movedAt: string; // ISO instant
}

/** A transfer between two locations (TransferRead mapped). */
export interface InventoryTransfer {
  transferId: string;
  productId: string;
  originLocationId: string;
  destinationLocationId: string;
  quantity: number;
  reason: string | null;
  outMovementId: number;
  inMovementId: number;
}

export interface ChatMessage {
  id: string;
  from: "patient" | "agent" | "staff";
  text: string;
  time: string;
}

export interface Conversation {
  id: string;
  patientId: string;
  name: string;
  initials: string;
  preview: string;
  time: string;
  unread: number;
  tag: "Paciente" | "Lead";
  tone: Tone;
  messages: ChatMessage[];
}

/** Collection follow-up projection. `isActiveCase` is a backend-derived rule. */
export interface ChargeFollowUp {
  id: string;
  chargeId: number;
  nextFollowUpOn: string;
  note: string | null;
  state: "open" | "closed";
  openedAt: string;
  closedAt: string | null;
  closeReason: "settled" | "closed_by_operator" | null;
  chargeAmount: number;
  chargePaid: number;
  chargeOutstanding: number;
  isActiveCase: boolean;
  patientId: number;
  patientName: string;
  serviceId: number;
  serviceName: string;
  locationId: number;
  locationName: string;
  /** Derived from ChargeRead context for the collections operational view. */
  practitionerId?: number;
  practitionerName?: string;
}

/** A service execution with its optional charge, used by Por facturar. */
export interface UnchargedExecution extends ServiceExecution {
  chargeId: number | null;
}

export interface PatientVisitHistory {
  visit: Visit;
  executions: Array<ServiceExecution & {
    charge: Charge | null;
    followUp: ChargeFollowUp | null;
  }>;
}


/* ---------------------------------------------------------------------------
 * Voice assistant wire types.
 *
 * Contributed VERBATIM by Alejandro Marcelo (AlejandroMarceloCh), ported from
 * alejandro/feat/asistente-voz (c0f418d). They mirror odontoflow-voice's
 * CONTRATO-API.md exactly, which is why the field names stay Spanish
 * (paciente_ref, cantidad_consumida, total_bruto, metodos_pago): they describe
 * the voice service's wire format. Renaming them here would hide the contract —
 * translation to OdontoFlow's own domain names belongs in an adapter, not in
 * the type. Do not "tidy" these.
 * ------------------------------------------------------------------------- */

export interface VoiceHealth {
  estado: string;
  insumos_en_catalogo: number;
}

export interface VoiceTranscription {
  texto: string;
  segundos_audio: number;
  segundos_proceso: number;
  modelo: string;
}

export interface VoiceStockRow {
  codigo: string;
  nombre: string;
  anterior: number | null;
  contado: number | null;
  diferencia: number | null;
  estado: "contado" | "pendiente";
}

export interface VoiceStockSummary {
  tipo: "inventario";
  filas: VoiceStockRow[];
  contados: number;
  total: number;
}

export interface VoiceVisitSummary {
  tipo: "consulta";
  paciente_ref: string | null;
  servicios: { codigo: string; nombre: string; cantidad: number | null }[];
  consumo: { codigo: string; nombre: string; cantidad_consumida: number | null }[];
  total_bruto: number | null;
  metodos_pago: string[];
  observaciones: string | null;
}

export type VoiceAttachment = VoiceStockSummary | VoiceVisitSummary;

export interface VoiceMessage {
  de: "bot" | "medico";
  texto: string;
  ts: string;
  adjunto: VoiceAttachment | null;
}

export interface VoiceReply {
  sesion_id: string;
  flujo: "consulta" | "inventario" | null;
  terminado: boolean;
  paso: number;
  total_pasos: number;
  pasos: string[];
  pregunta: string | null;
  mensajes: VoiceMessage[];
  transcripcion: VoiceTranscription | null;
}

export interface VoiceTurn extends VoiceMessage {
  id: string;
  audio: VoiceTranscription | null;
}

export interface NewAppointmentInput {
  patient: string;
  treatment: string;
  doctor: string;
  branch: string;
  date: string;
  time: string;
}

/**
 * One item of the approvals inbox (`GET /agent/inbox` → `InboxItem`), shaped
 * for a person who cares about money and time. Headline and evidence are
 * plain Spanish built only from backend values (charge facts, the agent's
 * evidence, payload, catalog names); when a value is missing the backend's own
 * `summary`/`reason` is shown instead — never an invented figure.
 */
export type ApprovalSource = InboxItem["source"];
export type ApprovalStatus = InboxStatus;
export type ApprovalCategory = "cobranza" | "inventario" | "lista_espera" | "cita";

export interface ApprovalFact {
  label: string;
  value: string;
}

export interface ApprovalItem {
  /** `${source}:${id}` — ids are only unique per source. */
  key: string;
  source: ApprovalSource;
  id: number;
  kind: InboxKind;
  category: ApprovalCategory;
  categoryLabel: string;
  agentLabel: string | null;
  status: ApprovalStatus;
  headline: string;
  detail: string | null;
  facts: ApprovalFact[];
  /** The exact text the patient(s) will receive, when the action sends one. */
  message: string | null;
  locationName: string | null;
  expiresAt: string;
  createdAt: string;
  actions: InboxAction[];
  payloadHash: string | null;
  conversationId: number | null;
  confirmationToken: string | null;
  decidedBy: string | null;
  outcome: string | null;
  errorCode: string | null;
}

export type ProposalDecision = "approve" | "decline";

/** Which person is acting, from `GET /me` (permissions drive the UI). */
export interface StaffIdentity {
  principalType: string;
  displayName: string;
  organizationName: string;
  roles: string[];
  permissions: string[];
}

export interface PersonaOption {
  key: string;
  displayName: string;
  role: string;
}

export type RunnableAgent = "cobranza" | "inventario" | "confirmaciones" | "backfill";

export interface AgentRunResult {
  agent: RunnableAgent;
  status: "completed" | "running" | "failed";
  /** Plain-Spanish count lines, e.g. "3 propuestas nuevas". */
  lines: string[];
  replayed: boolean;
  disabled: boolean;
}
