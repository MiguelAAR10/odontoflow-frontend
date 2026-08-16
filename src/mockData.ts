import type {
  AgentActivity,
  Appointment,
  Automation,
  Charge,
  Conversation,
  HumanQueueItem,
  Patient,
  Product,
} from "./types";

export const patients: Patient[] = [
  { id: "ana", initials: "AT", name: "Ana Torres", dni: "74859632", phone: "+51 987 654 321", branch: "Lince", nextAppointment: "15 ago · 10:30 a. m.", treatment: "Limpieza dental", status: "Activo", tone: "cyan", origin: "Instagram", interest: "Alto" },
  { id: "carlos", initials: "CR", name: "Carlos Rojas", dni: "70241589", phone: "+51 965 241 830", branch: "Jesús María", nextAppointment: "18 ago · 09:00 a. m.", treatment: "Evaluación", status: "Lead", tone: "blue", origin: "Referido", interest: "Medio" },
  { id: "lucia", initials: "LP", name: "Lucía Pérez", dni: "72103458", phone: "+51 922 865 174", branch: "Magdalena", nextAppointment: "19 ago · 11:00 a. m.", treatment: "Ortodoncia", status: "Activo", tone: "purple", origin: "Facebook", interest: "Alto" },
  { id: "diego", initials: "DS", name: "Diego Salazar", dni: "76893412", phone: "+51 977 104 862", branch: "Lince", nextAppointment: "22 ago · 12:00 p. m.", treatment: "Control", status: "Lead", tone: "green", origin: "Google", interest: "Medio" },
  { id: "maria", initials: "MF", name: "María Flores", dni: "71520846", phone: "+51 930 684 211", branch: "Jesús María", nextAppointment: "Por reprogramar", treatment: "Endodoncia", status: "Pendiente", tone: "pink", origin: "Instagram", interest: "Alto" },
  { id: "jose", initials: "JR", name: "José Ramírez", dni: "73410285", phone: "+51 945 318 206", branch: "Magdalena", nextAppointment: "25 ago · 04:00 p. m.", treatment: "Implantes", status: "Activo", tone: "amber", origin: "Referido", interest: "Alto" },
];

export const appointments: Appointment[] = [
  { id: "apt-1", day: 0, time: "09:00", patient: "Ana Torres", treatment: "Limpieza", doctor: "Dra. Valeria Ruiz", branch: "Lince", status: "Confirmada" },
  { id: "apt-2", day: 1, time: "10:30", patient: "Carlos Rojas", treatment: "Evaluación", doctor: "Dr. Mateo León", branch: "Jesús María", status: "Por confirmar" },
  { id: "apt-3", day: 2, time: "11:00", patient: "Lucía Pérez", treatment: "Ortodoncia", doctor: "Dra. Valeria Ruiz", branch: "Magdalena", status: "Confirmada" },
  { id: "apt-4", day: 3, time: "12:00", patient: "Diego Salazar", treatment: "Control", doctor: "Dra. Valeria Ruiz", branch: "Lince", status: "Confirmada" },
  { id: "apt-5", day: 4, time: "13:00", patient: "María Flores", treatment: "Endodoncia", doctor: "Dr. Mateo León", branch: "Jesús María", status: "No respondió" },
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
  { id: "1", serviceExecutionId: 101, amount: 180, paid: 180, outstanding: 0, createdAt: "2026-08-14T14:15:00Z", payments: [{ id: "p1", amount: 180, method: "Yape", paidAt: "2026-08-14T14:15:00Z" }], status: "Pagado", branch: "Lince", party: "Ana Torres", concept: "Limpieza dental", owner: "Carla R." },
  { id: "2", serviceExecutionId: 102, amount: 500, paid: 200, outstanding: 300, createdAt: "2026-08-14T14:48:00Z", payments: [{ id: "p2", amount: 200, method: "Tarjeta", paidAt: "2026-08-14T14:48:00Z" }], status: "Parcial", branch: "Jesús María", party: "Carlos Rojas", concept: "Adelanto ortodoncia", owner: "Miguel P." },
  { id: "3", serviceExecutionId: 103, amount: 120, paid: 120, outstanding: 0, createdAt: "2026-08-14T15:25:00Z", payments: [{ id: "p3", amount: 120, method: "Efectivo", paidAt: "2026-08-14T15:25:00Z" }], status: "Pagado", branch: "Magdalena", party: "Lucía Pérez", concept: "Control de ortodoncia", owner: "Sofía M." },
  { id: "4", serviceExecutionId: 104, amount: 100, paid: 0, outstanding: 100, createdAt: "2026-08-14T16:20:00Z", payments: [], status: "Pendiente", branch: "Lince", party: "Diego Salazar", concept: "Evaluación dental", owner: "Carla R." },
  { id: "5", serviceExecutionId: 105, amount: 450, paid: 450, outstanding: 0, createdAt: "2026-08-14T17:05:00Z", payments: [{ id: "p4", amount: 450, method: "Plin", paidAt: "2026-08-14T17:05:00Z" }], status: "Pagado", branch: "Jesús María", party: "María Flores", concept: "Endodoncia · sesión 1", owner: "Miguel P." },
];

export const products: Product[] = [
  { id: "prd-1", name: "Guantes de nitrilo", category: "Insumos", branch: "Todas las sedes", stock: 240, unit: "cajas", minimum: 80, status: "Disponible", tone: "blue", updated: "14 ago 2026" },
  { id: "prd-2", name: "Resina compuesta A2", category: "Material restaurador", branch: "Lince", stock: 12, unit: "unidades", minimum: 15, status: "Stock bajo", tone: "amber", updated: "14 ago 2026" },
  { id: "prd-3", name: "Anestesia lidocaína 2%", category: "Medicamentos", branch: "Jesús María", stock: 28, unit: "cartuchos", minimum: 20, status: "Disponible", tone: "green", updated: "13 ago 2026" },
  { id: "prd-4", name: "Mascarillas quirúrgicas", category: "Bioseguridad", branch: "Magdalena", stock: 45, unit: "cajas", minimum: 50, status: "Stock bajo", tone: "purple", updated: "13 ago 2026" },
  { id: "prd-5", name: "Ácido fosfórico 37%", category: "Material restaurador", branch: "Lince", stock: 8, unit: "jeringas", minimum: 10, status: "Crítico", tone: "red", updated: "12 ago 2026" },
  { id: "prd-6", name: "Hilo de sutura 4-0", category: "Cirugía", branch: "Jesús María", stock: 62, unit: "unidades", minimum: 30, status: "Disponible", tone: "green", updated: "12 ago 2026" },
  { id: "prd-7", name: "Alginato cromático", category: "Impresión", branch: "Magdalena", stock: 14, unit: "bolsas", minimum: 18, status: "Stock bajo", tone: "cyan", updated: "11 ago 2026" },
  { id: "prd-8", name: "Flúor neutro", category: "Preventivo", branch: "Todas las sedes", stock: 38, unit: "frascos", minimum: 15, status: "Disponible", tone: "blue", updated: "11 ago 2026" },
];

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
