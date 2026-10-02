/**
 * Chat (`GET /conversations`, `GET /conversations/{id}/messages`) and the
 * handoff queue (`GET /handoffs`, `POST /handoffs/{id}/claim`) behind the same
 * `useMocks` seam as `src/api.ts` (which re-exports this module).
 *
 * Read-only for staff: the backend has no staff send route, and handing a
 * conversation back to the agent is `/internal/*`, which the BFF refuses on
 * purpose. All four routes are for people (agents and integrations get 403):
 * reads need `conversations.read`, the claim `conversations.resume`.
 */
import { USE_MOCKS } from "./env";
import { CLINIC_TIME_ZONE, clinicDay, recordMockActivity } from "./activity";
import {
  ApiError,
  claimHandoff as claimHandoffRequest,
  listConversationMessages,
  listHandoffs,
  listStaffConversations,
  newIdempotencyKey,
  toApiError,
  type ConversationPage,
  type ConversationStatus,
  type ConversationSummary,
  type HandoffPage,
  type HandoffRead,
  type HandoffStatus,
  type MeRead,
  type MessagePage,
  type Replayable,
  type StaffMessageRead,
} from "./contracts/client";
import { mockConversationMessages, mockConversations, mockHandoffs } from "./mockData";
import { mockCurrentMe } from "./session";
import type {
  ChatConversation,
  ChatConversationPage,
  ChatThreadMessage,
  ChatThreadPage,
  ChatUnavailableReason,
  HandoffEntry,
  HandoffQueuePage,
  Tone,
} from "./types";

export const CONVERSATION_PAGE_SIZE = 25;
export const MESSAGE_PAGE_SIZE = 50;
export const HANDOFF_PAGE_SIZE = 25;
/** The backend cuts previews at 80 characters. */
const PREVIEW_CHARS = 80;

export const CONVERSATION_STATUS: Record<ConversationStatus, { label: string; tone: Tone }> = {
  open: { label: "Abierta", tone: "blue" },
  awaiting_confirmation: { label: "Por confirmar", tone: "amber" },
  human_handoff: { label: "Derivada", tone: "purple" },
  closed: { label: "Cerrada", tone: "slate" },
};

/** Inbox filters, mapped one to one onto the backend's `status`. */
export const CONVERSATION_FILTERS: ReadonlyArray<{ status: ConversationStatus | null; label: string }> = [
  { status: null, label: "Todas" },
  { status: "open", label: "Abiertas" },
  { status: "awaiting_confirmation", label: "Por confirmar" },
  { status: "human_handoff", label: "Derivadas" },
  { status: "closed", label: "Cerradas" },
];

const HANDOFF_STATUS: Record<HandoffStatus, { label: string; tone: Tone }> = {
  pending: { label: "Pendiente", tone: "amber" },
  claimed: { label: "Tomada", tone: "green" },
  resolved: { label: "Resuelta", tone: "slate" },
};

export const HANDOFF_FILTERS: ReadonlyArray<{ status: HandoffStatus; label: string }> = [
  { status: "pending", label: "Pendientes" },
  { status: "claimed", label: "Tomadas" },
  { status: "resolved", label: "Resueltas" },
];

/** `reception_handoffs.reason_code` (backend CHECK constraint). */
export const HANDOFF_REASON_LABEL: Record<string, string> = {
  requested_by_contact: "Pidió hablar con una persona",
  urgent_symptoms: "Síntomas urgentes",
  complaint: "Reclamo",
  pricing_exception: "Excepción de precio",
  clinical_case: "Consulta clínica",
  low_confidence: "El agente no estaba seguro",
  other: "Otro motivo",
};

const DELIVERY_LABEL: Record<string, string> = {
  pending: "Enviando",
  processing: "Enviando",
  sent: "Enviado",
  delivered: "Entregado",
  read: "Leído",
  failed: "No se entregó",
  dead_letter: "No se entregó",
};

const UNAVAILABLE_LABEL: Record<Exclude<ChatUnavailableReason, "media">, string> = {
  redacted: "Mensaje no disponible: se eliminó por privacidad.",
  expired: "Mensaje no disponible: venció su plazo de conservación.",
  empty: "Mensaje no disponible.",
};

const AVATAR_TONES: readonly Tone[] = ["cyan", "blue", "purple", "green", "pink", "amber"];

// --- dates on the clinic's wall clock -------------------------------------------

function shiftDay(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function clockTime(iso: string): string {
  return new Intl.DateTimeFormat("es-PE", { timeZone: CLINIC_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

/** "11:42" today, "Ayer", else "20/09". */
function listTime(iso: string, now: Date): string {
  const day = clinicDay(new Date(iso));
  const today = clinicDay(now);
  if (day === today) return clockTime(iso);
  if (day === shiftDay(today, -1)) return "Ayer";
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

/** Thread separator: "Hoy", "Ayer", "lunes, 28 de septiembre". */
function dayLabel(iso: string, now: Date): string {
  const day = clinicDay(new Date(iso));
  const today = clinicDay(now);
  if (day === today) return "Hoy";
  if (day === shiftDay(today, -1)) return "Ayer";
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  const label = new Intl.DateTimeFormat("es-PE", { timeZone: CLINIC_TIME_ZONE, weekday: "long", day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) }).format(new Date(iso));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function waitingLabel(iso: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "hace un momento";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "hace 1 día" : `hace ${days} días`;
}

// --- view models --------------------------------------------------------------------

const MASKED_PHONE = /^\+[•\d]+$/;

function initialsOf(name: string, masked: boolean): string {
  if (masked) return name.slice(-2);
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "?";
}

export function toUiConversation(row: ConversationSummary, now: Date = new Date()): ChatConversation {
  const status = CONVERSATION_STATUS[row.status as ConversationStatus] ?? { label: row.status, tone: "slate" as Tone };
  const maskedPhone = MASKED_PHONE.test(row.contact_display_name);
  const last = row.last_message_preview;
  const text = last?.text?.trim() ? last.text : null;
  const previewFrom = last ? (last.direction === "inbound" ? "patient" : "clinic") : null;
  let preview = "Sin mensajes todavía";
  if (last && text === null) preview = "Mensaje no disponible";
  if (text !== null) {
    const body = text.length >= PREVIEW_CHARS ? `${text}…` : text;
    preview = previewFrom === "clinic" ? `Clínica: ${body}` : body;
  }
  return {
    id: row.id,
    status: row.status,
    statusLabel: status.label,
    statusTone: status.tone,
    name: row.contact_display_name,
    initials: initialsOf(row.contact_display_name, maskedPhone),
    tone: AVATAR_TONES[row.id % AVATAR_TONES.length]!,
    maskedPhone,
    preview,
    previewUnavailable: Boolean(last) && text === null,
    previewFrom,
    lastMessageAt: row.last_message_at,
    timeLabel: listTime(row.last_message_at, now),
    assignedTo: row.assigned_display_name,
    pendingHandoffId: row.pending_handoff_id,
  };
}

function unavailableOf(message: StaffMessageRead): { reason: ChatUnavailableReason; label: string } | null {
  if (message.content_state === "redacted" || message.content_state === "expired") {
    return { reason: message.content_state, label: UNAVAILABLE_LABEL[message.content_state] };
  }
  if (message.text?.trim()) return null;
  if (message.has_media) return { reason: "media", label: message.message_type === "audio" ? "Nota de voz: no se muestra aquí." : "Imagen: no se muestra aquí." };
  return { reason: "empty", label: UNAVAILABLE_LABEL.empty };
}

export function toUiMessage(message: StaffMessageRead, now: Date = new Date()): ChatThreadMessage {
  const unavailable = unavailableOf(message);
  const outbound = message.direction !== "inbound";
  return {
    id: message.id,
    from: outbound ? "clinic" : "patient",
    text: unavailable ? null : message.text,
    unavailable: unavailable?.reason ?? null,
    unavailableLabel: unavailable?.label ?? null,
    occurredAt: message.occurred_at,
    timeLabel: clockTime(message.occurred_at),
    dayLabel: dayLabel(message.occurred_at, now),
    deliveryLabel: outbound ? DELIVERY_LABEL[message.delivery_status] ?? null : null,
    deliveryFailed: outbound && (message.delivery_status === "failed" || message.delivery_status === "dead_letter"),
  };
}

export function toUiHandoff(row: HandoffRead, now: Date = new Date()): HandoffEntry {
  const status = HANDOFF_STATUS[row.status as HandoffStatus] ?? { label: row.status, tone: "slate" as Tone };
  // The backend names a claimant only while `claimed`; never show a stale one.
  const claimed = row.status === "claimed";
  return {
    id: row.id,
    conversationId: row.conversation_id,
    name: row.contact_display_name,
    reasonCode: row.reason_code,
    reasonLabel: HANDOFF_REASON_LABEL[row.reason_code] ?? HANDOFF_REASON_LABEL.other!,
    reasonSummary: row.reason_summary,
    status: row.status,
    statusLabel: status.label,
    statusTone: status.tone,
    claimedBy: claimed ? row.claimed_by_display_name : null,
    claimedById: claimed ? row.claimed_by_principal_id : null,
    createdAt: row.created_at,
    waitingLabel: waitingLabel(row.created_at, now),
  };
}

// --- reads ----------------------------------------------------------------------------

export interface ConversationFilters {
  status?: ConversationStatus | null;
  cursor?: string | null;
  limit?: number;
}

export async function loadConversations(filters: ConversationFilters, now: Date = new Date()): Promise<ChatConversationPage> {
  const limit = filters.limit ?? CONVERSATION_PAGE_SIZE;
  const page = USE_MOCKS
    ? mockListConversations(filters.status ?? null, filters.cursor ?? null, limit)
    : await listStaffConversations({ ...(filters.status ? { status: filters.status } : {}), ...(filters.cursor ? { cursor: filters.cursor } : {}), limit });
  return { items: page.items.map((row) => toUiConversation(row, now)), nextCursor: page.next_cursor };
}

/** One page of a thread, oldest first; `nextCursor` leads to newer messages. */
export async function loadThread(conversationId: number, options: { cursor?: string | null; limit?: number } = {}, now: Date = new Date()): Promise<ChatThreadPage> {
  const limit = options.limit ?? MESSAGE_PAGE_SIZE;
  const page = USE_MOCKS
    ? mockListMessages(conversationId, options.cursor ?? null, limit)
    : await listConversationMessages(conversationId, { ...(options.cursor ? { cursor: options.cursor } : {}), limit });
  return { messages: page.items.map((message) => toUiMessage(message, now)), nextCursor: page.next_cursor };
}

export async function loadHandoffs(filters: { status?: HandoffStatus; cursor?: string | null; limit?: number }, now: Date = new Date()): Promise<HandoffQueuePage> {
  const status = filters.status ?? "pending";
  const limit = filters.limit ?? HANDOFF_PAGE_SIZE;
  const page = USE_MOCKS
    ? mockListHandoffs(status, filters.cursor ?? null, limit)
    : await listHandoffs({ status, ...(filters.cursor ? { cursor: filters.cursor } : {}), limit });
  return { items: page.items.map((row) => toUiHandoff(row, now)), nextCursor: page.next_cursor };
}

// --- taking a handoff ("Tomar") ---------------------------------------------------------

/** One click owns one Idempotency-Key; retrying that click reuses it. */
export interface ClaimIntent {
  handoffId: number;
  idempotencyKey: string;
}

export function beginClaim(handoffId: number): ClaimIntent {
  return { handoffId, idempotencyKey: newIdempotencyKey() };
}

export interface ClaimResult {
  handoff: HandoffEntry;
  /** The backend replayed an earlier claim; `handoff` is the live state. */
  replayed: boolean;
}

export async function claimHandoff(intent: ClaimIntent, now: Date = new Date()): Promise<ClaimResult> {
  const { data, replayed } = USE_MOCKS ? mockClaim(intent) : await claimHandoffRequest(intent.handoffId, intent.idempotencyKey);
  return { handoff: toUiHandoff(data, now), replayed };
}

// --- errors a person can act on ----------------------------------------------------------

export type ChatSurface = "conversaciones" | "mensajes" | "derivaciones" | "tomar";

export interface ChatError {
  message: string;
  /** What is on screen is stale: offer "Volver a cargar". */
  reload: boolean;
}

export function describeChatError(caught: unknown, surface: ChatSurface): ChatError {
  const error = toApiError(caught);
  if (error.code === "HANDOFF_NOT_PENDING") {
    return error.details.status === "resolved"
      ? { message: "Esta derivación ya se resolvió y la conversación volvió al agente. Vuelve a cargar la cola.", reload: true }
      : { message: "Otra persona ya tomó esta conversación. Vuelve a cargar la cola para ver quién la atiende.", reload: true };
  }
  if (error.code === "IDEMPOTENCY_KEY_REUSED") return { message: "No se pudo repetir esa acción. Vuelve a pulsar «Tomar».", reload: false };
  if (error.httpStatus === 401) return { message: "Elige una persona del equipo para continuar.", reload: false };
  if (error.httpStatus === 403) {
    return { message: surface === "tomar" ? "Tu rol no permite tomar conversaciones." : "Tu rol no permite ver las conversaciones de la clínica.", reload: false };
  }
  if (error.httpStatus === 404) {
    return surface === "mensajes" || surface === "conversaciones"
      ? { message: "Esta conversación ya no está disponible.", reload: true }
      : { message: "Esta derivación ya no existe. Vuelve a cargar la cola.", reload: true };
  }
  if (error.httpStatus === 422 && error.code === "INVALID_INPUT") return { message: "La lista cambió mientras la leías. Vuelve a cargarla.", reload: true };
  if (error.httpStatus === 429) return { message: "Demasiadas solicitudes seguidas. Espera un momento y vuelve a intentar.", reload: false };
  return { message: error.message, reload: false };
}

// --- mock mode: mirrors the backend rules ---------------------------------------------------

const PERMISSION_DENIED = () => new ApiError(403, "PERMISSION_DENIED", "The authenticated principal lacks the required permission.");

function requireMockHuman(permission: string): MeRead {
  const me = mockCurrentMe();
  if (!me) throw new ApiError(401, "AUTHENTICATION_REQUIRED", "A valid credential is required.");
  if (me.principal.type !== "human" || !me.permissions.includes(permission)) throw PERMISSION_DENIED();
  return me;
}

type Key = [string, number];
/** Ascending by (instant, id); the conversation list walks it in reverse. */
const compareKey = (a: Key, b: Key): number => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]);
const encodeCursor = (key: Key): string => btoa(JSON.stringify(key)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function decodeCursor(cursor: string): Key {
  try {
    const raw = JSON.parse(atob(cursor.replace(/-/g, "+").replace(/_/g, "/"))) as unknown;
    if (Array.isArray(raw) && raw.length === 2 && typeof raw[0] === "string" && Number.isInteger(raw[1])) return raw as Key;
  } catch { /* falls through to the backend's 422 */ }
  throw new ApiError(422, "INVALID_INPUT", "The cursor is invalid.");
}

function keysetPage<T>(rows: T[], keyOf: (row: T) => Key, cursor: string | null, limit: number, descending: boolean): { items: T[]; next_cursor: string | null } {
  const after = cursor ? decodeCursor(cursor) : null;
  const direction = descending ? -1 : 1;
  const ordered = rows
    .filter((row) => (after ? direction * compareKey(keyOf(row), after) > 0 : true))
    .sort((a, b) => direction * compareKey(keyOf(a), keyOf(b)));
  const items = ordered.slice(0, limit);
  const last = items[items.length - 1];
  return { items: structuredClone(items), next_cursor: ordered.length > limit && last ? encodeCursor(keyOf(last)) : null };
}

function mockListConversations(status: ConversationStatus | null, cursor: string | null, limit: number): ConversationPage {
  requireMockHuman("conversations.read");
  const rows = mockConversations.filter((row) => (status ? row.status === status : true));
  return keysetPage(rows, (row) => [row.last_message_at, row.id], cursor, limit, true);
}

function mockListMessages(conversationId: number, cursor: string | null, limit: number): MessagePage {
  requireMockHuman("conversations.read");
  const rows = mockConversationMessages[conversationId];
  if (!rows) throw new ApiError(404, "NOT_FOUND", "Conversation not found.");
  return keysetPage(rows, (row) => [row.occurred_at, row.id], cursor, limit, false);
}

function mockListHandoffs(status: HandoffStatus, cursor: string | null, limit: number): HandoffPage {
  requireMockHuman("conversations.read");
  return keysetPage(mockHandoffs.filter((row) => row.status === status), (row) => [row.created_at, row.id], cursor, limit, false);
}

/** Idempotency receipts: key → handoff id (settled only when the claim commits). */
const mockClaimReceipts = new Map<string, number>();

function mockClaim(intent: ClaimIntent): Replayable<HandoffRead> {
  const me = requireMockHuman("conversations.resume");
  const receipt = mockClaimReceipts.get(intent.idempotencyKey);
  if (receipt !== undefined && receipt !== intent.handoffId) {
    throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED", "The idempotency key was already used for another request.");
  }
  const handoff = mockHandoffs.find((row) => row.id === intent.handoffId);
  if (!handoff) throw new ApiError(404, "NOT_FOUND", "Handoff not found.");
  if (receipt !== undefined) return { data: structuredClone(handoff), replayed: true };

  const conversation = mockConversations.find((row) => row.id === handoff.conversation_id);
  const mine = handoff.status === "claimed" && conversation?.assigned_principal_id === me.principal.id;
  if (!mine) {
    if (handoff.status !== "pending") throw new ApiError(409, "HANDOFF_NOT_PENDING", "The handoff is no longer pending.", { status: handoff.status });
    const now = new Date().toISOString();
    Object.assign(handoff, { status: "claimed", claimed_by_principal_id: me.principal.id, claimed_by_display_name: me.principal.display_name, updated_at: now });
    if (conversation) Object.assign(conversation, { assigned_principal_id: me.principal.id, assigned_display_name: me.principal.display_name, pending_handoff_id: null });
    recordMockActivity({ source: "audit", action: "reception_handoff.claimed", entity: ["reception_handoff", String(handoff.id)], me });
  }
  mockClaimReceipts.set(intent.idempotencyKey, handoff.id);
  return { data: structuredClone(handoff), replayed: false };
}
