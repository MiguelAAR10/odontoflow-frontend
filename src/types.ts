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

export interface Product {
  id: string;
  name: string;
  category: string;
  branch: string;
  stock: number;
  unit: string;
  minimum: number;
  status: "Disponible" | "Stock bajo" | "Crítico";
  tone: Tone;
  updated: string;
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

export interface NewAppointmentInput {
  patient: string;
  treatment: string;
  doctor: string;
  branch: string;
  date: string;
  time: string;
}
