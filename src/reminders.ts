/** E2 presentation over the generated backend contract. No simulated business state. */
import { z } from "zod";
import { USE_MOCKS } from "./env";
import { ApiError, toApiError, getReminderCoverage, prepareReminderBatch, createTelegramReminderLink, optOutReminderContact } from "./contracts/client";

export const REMINDER_TYPE_LABEL: Record<string, string> = { d1: "24 horas antes", h09: "09:00 del día de la cita", h1: "1 hora antes" };
export const REMINDER_STATUS_LABEL: Record<string, string> = {
  planned: "Pendiente de autorización", omitted: "Omitido", authorized: "Autorizado para su hora", sending: "En curso",
  accepted: "Aceptado por Telegram", uncertain: "Incierto: requiere revisión", failed: "No aceptado", missed: "Venció sin envío",
  invalidated: "Invalidado por cambio de cita", suppressed: "Suprimido",
};
export const REMINDER_REASON_LABEL: Record<string, string> = {
  merged_into_h1: "Incluido en el aviso de una hora antes", outside_hours: "Fuera del horario de 08:00 a 20:00",
  no_telegram_link: "Sin vínculo de Telegram", no_consent: "Sin consentimiento", opted_out: "El paciente pidió la baja",
  confirmed: "El paciente ya confirmó", past_due_at_creation: "Ya había vencido al preparar", appointment_changed: "La cita cambió",
  appointment_cancelled: "La cita fue cancelada", opted_out_before_call: "Baja registrada antes del envío",
  appointment_changed_before_call: "Cita modificada antes del envío",
  unapproved: "Venció sin autorización", window_expired: "Pasó la ventana de envío", excluded: "Excluido por recepción",
  lease_expired: "No se pudo confirmar el resultado del envío", transport_error: "No se pudo confirmar la respuesta de Telegram",
  no_items: "No hay avisos futuros para autorizar", first_due_too_close: "El primer aviso está demasiado cerca para autorizarlo",
};
export const reminderReason = (reason: string | null) => reason ? REMINDER_REASON_LABEL[reason] ?? "Requiere revisión en recepción" : null;
export function reminderDate(iso: string): string {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Lima" }).format(date) : "Fecha no disponible";
}

// These are validation/projection rules for the UI, not handwritten API types.
const id = z.number().int().positive();
const instant = z.iso.datetime({ offset: true });
const notice = z.object({
  item_id: id, appointment_id: id, appointment_version: id, patient_name: z.string().optional(), type: z.enum(["d1", "h09", "h1"]),
  due_at: instant, window_end: instant, text: z.string().min(1), buttons: z.array(z.string().min(1)).min(1),
});
const omission = z.object({ appointment_id: id, type: z.enum(["d1", "h09", "h1"]), reason: z.string().min(1) });
const batch = z.object({ location_id: id, items: z.array(notice), omissions: z.array(omission) });
const counters = z.object({ eligible_due: z.number().int().nonnegative(), accepted_in_window: z.number().int().nonnegative(), missed: z.number().int().nonnegative(), late: z.number().int().nonnegative(), uncertain: z.number().int().nonnegative(), failed: z.number().int().nonnegative() });
const coverage = z.object({
  totals: z.record(z.string(), counters),
  appointments: z.array(z.object({
    appointment_id: id, version: id, patient_confirmed_at: instant.nullable(),
    contact: z.object({ contact_id: id, status: z.enum(["linked", "unlinked"]), consent_status: z.enum(["pending", "opted_in", "opted_out"]) }).nullable(),
    items: z.array(z.object({ item_id: id, type: z.string(), due_at: instant, status: z.string(), reason: z.string().nullable() })).default([]),
    open_change_requests: z.array(z.object({ id, contact_id: id, source: z.enum(["button", "free_text"]), body: z.string().nullable(), candidate_appointment_ids: z.array(id), appointment_id: id.nullable(), appointment_version: id.nullable() })).default([]),
  })).default([]),
  omissions: z.record(z.string(), z.number().int().nonnegative()).default({}),
  appointments_without_link: z.array(id).default([]),
});
function project<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(0, "REMINDER_DATA_INCOMPLETE", "Los datos de recordatorios están incompletos. Vuelve a cargar la vista.");
  return result.data;
}
export function toUiReminderBatch(payload: unknown, patientNames?: ReadonlyMap<number, string>) {
  const data = project(batch, payload);
  return { locationId: data.location_id, firstDueAt: data.items.length ? data.items.reduce((first, row) => Date.parse(row.due_at) < Date.parse(first) ? row.due_at : first, data.items[0]!.due_at) : null,
    items: data.items.map(row => ({ ...row, ...(patientNames?.has(row.appointment_id) ? { patient_name: patientNames.get(row.appointment_id)! } : {}) })).sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at)), omissions: data.omissions };
}
export type ReminderBatchView = ReturnType<typeof toUiReminderBatch>;
export function toUiReminderCoverage(value: unknown) {
  const data = project(coverage, value);
  const totals = Object.entries(data.totals).map(([type, row]) => ({ type, label: REMINDER_TYPE_LABEL[type] ?? "Otro recordatorio", ...row,
    percentage: row.eligible_due === 0 ? null : 100 * row.accepted_in_window / row.eligible_due }));
  return { totals, appointments: data.appointments, omissions: data.omissions, appointmentsWithoutLink: data.appointments_without_link };
}
export type ReminderCoverageView = ReturnType<typeof toUiReminderCoverage>;

async function realOnly<T>(operation: () => Promise<T>): Promise<T> {
  if (USE_MOCKS) throw new ApiError(0, "DEMO_UNAVAILABLE", "Los recordatorios de Telegram requieren el modo conectado al backend.");
  try { return await operation(); } catch (caught) {
    const error = toApiError(caught);
    const reason = typeof error.details.reason === "string" ? REMINDER_REASON_LABEL[error.details.reason] : undefined;
    throw reason ? new ApiError(error.httpStatus, error.code, reason, error.details) : error;
  }
}
export function loadReminderCoverage(query: { locationId: number; from: string; to: string }) {
  return realOnly(async () => toUiReminderCoverage(await getReminderCoverage(query)));
}
export function prepareReminders(locationId: number, key: string) {
  return realOnly(async () => {
    const receipt = await prepareReminderBatch(locationId, key);
    // Receipt items are persisted records; the exact text/buttons to approve live in the proposal payload.
    toUiReminderBatch(receipt.proposal.payload);
    return { created: receipt.created, proposalId: receipt.proposal.id, firstDueAt: receipt.first_due_at };
  });
}
export function linkTelegramReminders(patientId: number, key: string, locationId?: number) {
  return realOnly(async () => {
    const result = project(z.object({ contact_id: id.nullable(), deep_link: z.string().url(), expires_at: instant }), await createTelegramReminderLink(patientId, key, locationId));
    const url = new URL(result.deep_link);
    if (url.protocol !== "https:" || url.hostname !== "t.me" || url.username || url.password) throw new ApiError(0, "INVALID_TELEGRAM_LINK", "El enlace de Telegram no es válido. Vuelve a solicitarlo.");
    return { contactId: result.contact_id, deepLink: result.deep_link, expiresAt: result.expires_at };
  });
}
export function optOutReminders(contactId: number, key: string, locationId?: number) {
  return realOnly(() => optOutReminderContact(contactId, key, locationId));
}
