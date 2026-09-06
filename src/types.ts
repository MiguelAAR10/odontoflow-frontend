export type Tone = "cyan" | "blue" | "green" | "amber" | "red" | "purple" | "pink" | "slate";

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
  amount: number;
  method: string;
  paidAt: string; // ISO instant from the backend
}

/** Cash-visible economic state: a charge and its payments (ChargeRead mapped).
 * The branch/party/concept/owner fields are mock-mode only — the backend
 * projects no location/party/owner, so real mode always renders them empty. */
export interface Charge {
  id: string;
  serviceExecutionId: number;
  amount: number;
  paid: number;
  outstanding: number;
  createdAt: string; // ISO instant from the backend
  payments: Payment[];
  status: "Pagado" | "Parcial" | "Pendiente";
  branch: string;
  party: string;
  concept: string;
  owner: string;
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
