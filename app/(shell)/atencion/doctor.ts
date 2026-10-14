import { z } from "zod";

// Projection of the official AgendaItem, never a clinical-domain DTO.
export const doctorAppointmentSchema = z.object({
  id: z.string().min(1), start_at: z.iso.datetime({ offset: true }), end_at: z.iso.datetime({ offset: true }),
  practitioner: z.string().min(1), practitioner_name: z.string().min(1), patient: z.string().min(1),
  procedure: z.string().min(1), sede: z.string().min(1),
  state: z.enum(["cerrada", "sin cerrar", "ausente", "en consulta", "llegó", "confirmada", "sin confirmar"]),
  arrived_at: z.iso.datetime({ offset: true }).nullable(),
});
export type DoctorAppointment = z.infer<typeof doctorAppointmentSchema>;
export const limaTime = (value: string) => new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
export const limaDate = (value: string) => new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));

export function doctorDay(input: unknown, practitioner: string, sede: string, cut: string): DoctorAppointment[] {
  if (!practitioner) return [];
  return z.array(doctorAppointmentSchema).parse(input)
    .filter(row => row.practitioner === practitioner && (!sede || row.sede === sede) && limaDate(row.start_at) === limaDate(cut))
    .sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
}
export function nextPatient(rows: DoctorAppointment[], cut: string) {
  return rows.find(row => row.state === "en consulta") ?? rows.find(row => row.state === "llegó")
    ?? rows.find(row => ["confirmada", "sin confirmar"].includes(row.state) && Date.parse(row.start_at) >= Date.parse(cut));
}
export function pendingFields(text: string) { return (text.match(/\[/g) ?? []).length; }
export function canSignDraft(input: { mocks: boolean; role: string; text: string; reviewedText: string | null }) {
  return input.mocks && input.role === "doctor" && !!input.text.trim() && !pendingFields(input.text)
    && input.reviewedText === input.text;
}
export function scenarioDraft(value: unknown): string | null {
  const parsed = z.object({ state: z.literal("borrador"), text: z.string().min(1) }).safeParse(value);
  return parsed.success ? parsed.data.text : null;
}
export interface BriefBlock { title: string; text: string; status: string; source: string; missing: boolean }
export function briefBlocks(row: DoctorAppointment, cut: string): BriefBlock[] {
  const source = `Agenda · ${limaDate(row.start_at)} · corte ${limaTime(cut)} (Lima)`;
  const unavailable = `Datos clínicos no disponibles en este corte · ${limaDate(cut)}`;
  return [
    { title: "Identidad y visita", text: `${row.patient} · ${row.procedure} · ${row.sede}`, status: "registrado en agenda", source, missing: false },
    { title: "Motivo y pieza prevista", text: `${row.procedure}. No consta el motivo referido por el paciente.`, status: "motivo por confirmar", source, missing: true },
    { title: "Alergias y medicación", text: "No consta información de alergias ni medicación en esta fuente.", status: "dato faltante", source: unavailable, missing: true },
    { title: "Última evolución", text: "No consta una evolución firmada en esta fuente.", status: "dato faltante", source: unavailable, missing: true },
    { title: "Siguiente paso del plan", text: "No consta un plan clínico validado en esta fuente.", status: "dato faltante", source: unavailable, missing: true },
    { title: "Faltantes", text: "No consta información de radiografías, laboratorio ni consentimiento.", status: "por comprobar", source: unavailable, missing: true },
  ];
}
