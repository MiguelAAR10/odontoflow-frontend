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

export interface CashMovement {
  id: string;
  time: string;
  branch: string;
  party: string;
  concept: string;
  method: string;
  amount: number;
  owner: string;
  status: "Pagado" | "Egreso" | "Pendiente";
  type: "income" | "expense" | "pending";
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
