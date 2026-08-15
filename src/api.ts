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
const copy = <T,>(value: T): T => structuredClone(value);

async function getOrMock<T>(path: string, fallback: T): Promise<T> {
  if (useMocks) return copy(fallback);
  const response = await api.get<T>(path);
  return response.data;
}

export const getPatients = () => getOrMock<Patient[]>("/patients", patients);

export async function createPatient(input: Omit<Patient, "id" | "initials" | "tone">): Promise<Patient> {
  if (!useMocks) {
    const response = await api.post<Patient>("/patients", input);
    return response.data;
  }
  const saved: Patient = {
    ...input,
    id: `patient-${Date.now()}`,
    initials: input.name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
    tone: "cyan",
  };
  patients.unshift(saved);
  return copy(saved);
}

export const getAppointments = () => getOrMock<Appointment[]>("/appointments", appointments);

export async function createAppointment(input: NewAppointmentInput): Promise<Appointment> {
  if (!useMocks) {
    const response = await api.post<Appointment>("/appointments", input);
    return response.data;
  }
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
