/**
 * Bandeja — the approvals inbox (`GET /agent/inbox`), approve/decline and the
 * "Ejecutar ahora" agent runs, behind the same `useMocks` seam as `src/api.ts`
 * (which re-exports this module).
 *
 * Two inbox sources share one list but not one decision route:
 * - `agent_proposal` → `POST /agent/proposals/{id}/approve` with
 *   `{payload_hash}` (+ Idempotency-Key) and `/decline`;
 * - `appointment_proposal` (no `payload_hash`) → the existing
 *   `/scheduling/appointment-proposals/confirm|decline` with
 *   `{conversation_id, confirmation_token}` from the same inbox item.
 */
import { USE_MOCKS } from "./env";
import {
  ApiError,
  approveProposal,
  confirmAppointmentProposal,
  createAgentRun,
  declineAppointmentProposal,
  declineProposal,
  listEligiblePractitioners,
  listInbox,
  listLocations,
  listServices,
  newIdempotencyKey,
  runDueAgentJobs,
  toApiError,
  type AgentRunCounts,
  type AgentRunOut,
  type InboxAction,
  type InboxItem,
  type InboxStatus,
  type JobsRunOut,
  type MeRead,
} from "./contracts/client";
import { mockInboxItems, mockLocations, mockPractitionerNames, mockServices } from "./mockData";
import { canRunAgent, mockCurrentMe, toStaffIdentity } from "./session";
import type { AgentRunResult, ApprovalCategory, ApprovalFact, ApprovalItem, ProposalDecision, RunnableAgent } from "./types";

const INBOX_PAGE_SIZE = 50;
const DEFAULT_TIME_ZONE = "America/Lima";

// --- plain-Spanish formatting ---------------------------------------------------

type Json = Record<string, unknown>;

const asRecord = (value: unknown): Json | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null);
const asText = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);
const asNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

/** Whole amounts without decimals ("S/ 180"), otherwise two ("S/ 95.50"). */
function plainNumber(value: unknown): string | null {
  const parsed = asNumber(value);
  if (parsed === null) return null;
  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(2);
}

function money(value: unknown): string | null {
  const text = plainNumber(value);
  return text === null ? null : `S/ ${text}`;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Product units are stored singular ("caja", "cartucho", "unidad"). */
function unitFor(quantity: number | null, unit: string | null): string {
  if (!unit) return quantity === 1 ? "unidad" : "unidades";
  if (quantity === 1 || /s$/i.test(unit)) return unit;
  return /[aeiouáéíóú]$/i.test(unit) ? `${unit}s` : `${unit}es`;
}

function localDate(iso: string, timeZone: string): string {
  const date = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: iso.length === 10 ? "UTC" : timeZone });
}

function localSlot(startIso: string, endIso: string | null, timeZone: string): string {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return startIso;
  const time = (date: Date) => date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone });
  const day = start.toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short", timeZone });
  const end = endIso ? new Date(endIso) : null;
  return end && !Number.isNaN(end.getTime()) ? `${day} · ${time(start)} – ${time(end)}` : `${day} · ${time(start)}`;
}

// --- InboxItem → ApprovalItem ----------------------------------------------------

export interface InboxCatalogNames {
  locations: Map<number, { name: string; timezone: string }>;
  services: Map<number, string>;
  practitioners: Map<number, string>;
}

const CATEGORY: Record<InboxItem["kind"], ApprovalCategory> = {
  collection_reminder: "cobranza",
  collection_follow_up: "cobranza",
  inventory_transfer: "inventario",
  inventory_entry: "inventario",
  waitlist_offer: "lista_espera",
  appointment_booking: "cita",
};

export const CATEGORY_LABEL: Record<ApprovalCategory, string> = {
  cobranza: "Cobranza",
  inventario: "Inventario",
  lista_espera: "Lista de espera",
  cita: "Cita",
};

const AGENT_LABEL: Record<string, string> = {
  cobranza: "Cobranza",
  inventario: "Inventario",
  confirmaciones: "Confirmaciones",
  backfill: "Cupos liberados",
  reception: "Recepción",
};

function outcomeFor(item: InboxItem): string | null {
  if (item.status === "failed") return "No se pudo ejecutar";
  const ref = asRecord(item.result_ref);
  switch (ref?.type) {
    case "outbound_message": return "Mensaje en cola de envío";
    case "charge_follow_up": return "Seguimiento agendado";
    case "inventory_transfer": return "Traspaso registrado en el kardex";
    case "inventory_movement": return "Entrada registrada en el kardex";
    case "waitlist_offer": {
      const offered = Array.isArray(ref.entry_ids) ? ref.entry_ids.length : null;
      return offered === null ? "Cupo ofrecido" : `Cupo ofrecido a ${plural(offered, "paciente", "pacientes")}`;
    }
    case "appointment": return "Cita creada";
    default: return null;
  }
}

interface Presentation {
  headline: string;
  detail: string | null;
  facts: ApprovalFact[];
  message: string | null;
  locationName?: string | null;
}

const fact = (label: string, value: string | null): ApprovalFact[] => (value ? [{ label, value }] : []);

function collectionPresentation(item: InboxItem): Presentation | null {
  const facts = asRecord(item.facts);
  const evidence = asRecord(item.evidence) ?? {};
  const payload = asRecord(item.payload) ?? {};
  const patient = asText(facts?.patient_name);
  const balance = money(facts?.balance ?? evidence.balance);
  if (!patient || !balance) return null;
  const days = asNumber(evidence.days_since_issued);
  const lastPaid = asText(evidence.last_payment_at);
  const lastAmount = money(evidence.last_payment_amount);
  const commonFacts = [
    ...fact("Monto del cargo", money(facts?.amount ?? evidence.amount)),
    ...fact("Ya pagó", money(facts?.paid)),
    ...fact("Último pago", lastPaid ? `${lastAmount ?? ""} el ${localDate(lastPaid, DEFAULT_TIME_ZONE)}`.trim() : asText(evidence.issued_on) ? "Sin pagos" : null),
    ...fact("Atención del", asText(evidence.issued_on) ? localDate(String(evidence.issued_on), DEFAULT_TIME_ZONE) : null),
  ];
  if (item.kind === "collection_follow_up") {
    const when = asText(payload.next_follow_up_on);
    return {
      headline: `Agendar seguimiento de cobro a ${patient}`,
      detail: when ? `Debe ${balance}; contactar el ${localDate(when, DEFAULT_TIME_ZONE)}` : `Debe ${balance}`,
      facts: [...commonFacts, ...fact("Nota", asText(payload.note))],
      message: null,
    };
  }
  return {
    headline: `Recordar el pago a ${patient}`,
    detail: days === null ? `Debe ${balance}` : `Debe ${balance} hace ${plural(days, "día", "días")}`,
    facts: commonFacts,
    message: asText(payload.message_text),
  };
}

function inventoryPresentation(item: InboxItem): Presentation | null {
  const evidence = asRecord(item.evidence);
  const target = asRecord(evidence?.target);
  const product = asText(evidence?.product_name);
  const targetName = asText(target?.name);
  const quantityValue = asNumber(evidence?.quantity);
  const quantity = plainNumber(evidence?.quantity);
  if (!evidence || !target || !product || !targetName || quantity === null) return null;
  const units = unitFor(quantityValue, asText(evidence.unit));
  const stock = `${targetName} tiene ${plainNumber(target.balance) ?? "?"} (mínimo ${plainNumber(target.min_quantity) ?? "?"})`;
  const usage = fact("Consumo últimos 7 días", plainNumber(target.consumption_7d) === null ? null : `${plainNumber(target.consumption_7d)} en ${targetName}`);
  if (item.kind === "inventory_transfer") {
    const donor = asRecord(evidence.donor);
    const donorName = asText(donor?.name);
    if (!donor || !donorName) return null;
    return {
      headline: `Traspasar ${quantity} ${units} de ${product} a ${targetName}`,
      detail: `${stock}; ${donorName} tiene ${plainNumber(donor.balance) ?? "?"} y le sobran ${plainNumber(donor.surplus) ?? "?"}`,
      facts: [...fact("Desde", donorName), ...fact("Hacia", targetName), ...usage],
      message: null,
      locationName: targetName,
    };
  }
  return {
    headline: `Reponer ${quantity} ${units} de ${product} en ${targetName}`,
    detail: `${stock}; ninguna otra sede tiene excedente`,
    facts: [...fact("Sede", targetName), ...usage],
    message: null,
    locationName: targetName,
  };
}

function waitlistPresentation(item: InboxItem, timeZone: string): Presentation | null {
  const evidence = asRecord(item.evidence);
  const service = asText(evidence?.service);
  const matched = asNumber(evidence?.matched);
  const offered = Array.isArray(evidence?.offered_to) ? evidence.offered_to.length : null;
  if (!evidence || !service || matched === null || offered === null) return null;
  const start = asText(evidence.start_utc);
  const location = asText(evidence.location);
  return {
    headline: `Ofrecer el cupo liberado de ${service}`,
    detail: `${matched === 1 ? "1 paciente espera" : `${matched} pacientes esperan`} este cupo; se ofrece a ${offered}`,
    facts: [...fact("Fecha y hora", start ? localSlot(start, null, timeZone) : null), ...fact("Sede", location)],
    message: asText(asRecord(item.payload)?.message_text),
    locationName: location,
  };
}

function appointmentPresentation(item: InboxItem, names: Partial<InboxCatalogNames> | undefined, timeZone: string, locationName: string | null): Presentation | null {
  const payload = asRecord(item.payload);
  const patient = asText(payload?.full_name);
  const start = asText(payload?.start_utc);
  if (!payload || !patient || !start) return null;
  const slot = localSlot(start, asText(payload.end_utc), timeZone);
  const service = names?.services?.get(Number(payload.service_id)) ?? null;
  const practitioner = names?.practitioners?.get(Number(payload.practitioner_id)) ?? null;
  return {
    headline: `Cita para ${patient}`,
    detail: service ? `${service} · ${slot}` : slot,
    facts: [...fact("Servicio", service), ...fact("Fecha y hora", slot), ...fact("Sede", locationName), ...fact("Profesional", practitioner)],
    message: null,
  };
}

export function toUiInboxItem(item: InboxItem, names?: Partial<InboxCatalogNames>): ApprovalItem {
  const location = item.location_id == null ? undefined : names?.locations?.get(item.location_id);
  const timeZone = location?.timezone ?? DEFAULT_TIME_ZONE;
  const category = CATEGORY[item.kind];
  const presentation =
    category === "cobranza" ? collectionPresentation(item)
      : category === "inventario" ? inventoryPresentation(item)
        : category === "lista_espera" ? waitlistPresentation(item, timeZone)
          : appointmentPresentation(item, names, timeZone, location?.name ?? null);
  return {
    key: `${item.source}:${item.id}`,
    source: item.source,
    id: item.id,
    kind: item.kind,
    category,
    categoryLabel: CATEGORY_LABEL[category],
    agentLabel: item.agent_key ? AGENT_LABEL[item.agent_key] ?? item.agent_key : null,
    status: item.status,
    headline: presentation?.headline ?? item.summary,
    detail: presentation ? presentation.detail : item.reason,
    facts: presentation?.facts ?? [],
    message: presentation?.message ?? null,
    locationName: location?.name ?? presentation?.locationName ?? null,
    expiresAt: item.expires_at,
    createdAt: item.created_at,
    actions: [...item.actions],
    payloadHash: item.payload_hash,
    conversationId: item.conversation_id,
    confirmationToken: item.confirmation_token,
    decidedBy: item.decided_by?.display_name ?? null,
    outcome: outcomeFor(item),
    errorCode: item.error_code,
  };
}

// --- reading -------------------------------------------------------------------

export interface InboxPageView {
  items: ApprovalItem[];
  nextCursor: string | null;
}

/** Names from the real catalog reads. A failed read degrades to "no name",
 * never to an invented one. */
async function resolveNames(items: InboxItem[]): Promise<InboxCatalogNames> {
  const names: InboxCatalogNames = { locations: new Map(), services: new Map(), practitioners: new Map() };
  const bookings = items.filter((item) => item.source === "appointment_proposal");
  const pairs = [...new Map(bookings.flatMap((item) => {
    const serviceId = asNumber(item.payload.service_id);
    return serviceId === null || item.location_id == null ? [] : [[`${serviceId}:${item.location_id}`, { serviceId, locationId: item.location_id }] as const];
  })).values()];
  const [locations, services, ...eligible] = await Promise.allSettled([
    items.some((item) => item.location_id != null) ? listLocations() : Promise.resolve([]),
    bookings.length ? listServices() : Promise.resolve([]),
    ...pairs.map((pair) => listEligiblePractitioners(pair.serviceId, pair.locationId)),
  ] as const);
  if (locations?.status === "fulfilled") for (const row of locations.value) names.locations.set(row.id, { name: row.name, timezone: row.timezone });
  if (services?.status === "fulfilled") for (const row of services.value) names.services.set(row.id, row.name);
  for (const result of eligible) {
    if (result.status === "fulfilled") for (const row of result.value) names.practitioners.set(row.id, row.display_name);
  }
  return names;
}

export async function loadInbox({ status = "pending", cursor }: { status?: InboxStatus; cursor?: string | null } = {}): Promise<InboxPageView> {
  if (USE_MOCKS) return mockLoadInbox(status);
  const page = await listInbox({ status, limit: INBOX_PAGE_SIZE, ...(cursor ? { cursor } : {}) });
  const names = await resolveNames(page.items);
  return { items: page.items.map((item) => toUiInboxItem(item, names)), nextCursor: page.next_cursor };
}

// --- deciding ------------------------------------------------------------------

/** One user intent (approve or decline one item) owns one Idempotency-Key.
 * Retrying that same intent reuses it; a new click is a new intent. */
export interface DecisionIntent {
  itemKey: string;
  decision: ProposalDecision;
  idempotencyKey: string;
}

export function beginDecision(item: ApprovalItem, decision: ProposalDecision): DecisionIntent {
  return { itemKey: item.key, decision, idempotencyKey: newIdempotencyKey() };
}

export interface DecisionResult {
  item: ApprovalItem;
  replayed: boolean;
}

export async function decideInboxItem(item: ApprovalItem, intent: DecisionIntent): Promise<DecisionResult> {
  if (intent.itemKey !== item.key) throw new Error("The decision intent belongs to another item.");
  if (USE_MOCKS) return mockDecide(item, intent);
  const keep = (next: ApprovalItem): ApprovalItem => ({ ...next, locationName: item.locationName ?? next.locationName, facts: next.facts.length ? next.facts : item.facts });

  if (item.source === "agent_proposal") {
    if (intent.decision === "decline") return { item: keep(toUiInboxItem(await declineProposal(item.id, intent.idempotencyKey))), replayed: false };
    if (!item.payloadHash) throw new ApiError(0, "PROPOSAL_HASH_MISSING", "La propuesta no trae su huella; vuelve a cargar la bandeja.");
    const { data, replayed } = await approveProposal(item.id, item.payloadHash, intent.idempotencyKey);
    return { item: keep(toUiInboxItem(data)), replayed };
  }

  if (item.conversationId == null || !item.confirmationToken) {
    throw new ApiError(0, "PROPOSAL_INCOMPLETE", "A esta propuesta de cita le falta la conversación; vuelve a cargar la bandeja.");
  }
  const body = { conversation_id: item.conversationId, confirmation_token: item.confirmationToken };
  const read = intent.decision === "approve"
    ? await confirmAppointmentProposal(body, intent.idempotencyKey)
    : await declineAppointmentProposal(body, intent.idempotencyKey);
  return { item: settledAppointment(item, intent.decision, read.status), replayed: false };
}

/** The scheduling routes answer with the appointment-proposal row. The inbox
 * shows a confirmed row as `executed`; a declined row is stored as `expired`
 * by the backend, but to the person who just declined it, it is declined. */
function settledAppointment(item: ApprovalItem, decision: ProposalDecision, rowStatus: string): ApprovalItem {
  const status: InboxStatus = rowStatus === "confirmed" ? "executed" : decision === "decline" && rowStatus === "expired" ? "declined" : rowStatus === "expired" ? "expired" : "pending";
  return { ...item, status, actions: [], outcome: status === "executed" ? "Cita creada" : null };
}

// --- errors a person can act on ---------------------------------------------------

export interface ActionableError {
  message: string;
  /** The inbox is stale: offer "Volver a cargar". */
  reload: boolean;
}

export function describeApprovalError(caught: unknown): ActionableError {
  const error = toApiError(caught);
  switch (error.code) {
    case "PROPOSAL_SUPERSEDED":
    case "PROPOSAL_HASH_MISMATCH":
      return { message: "La propuesta cambió, vuelve a cargar la bandeja.", reload: true };
    case "PROPOSAL_NOT_PENDING":
      return { message: "Alguien ya resolvió esta propuesta. Vuelve a cargar la bandeja.", reload: true };
    case "PROPOSAL_EXPIRED":
      return { message: "La propuesta venció. Vuelve a cargar la bandeja.", reload: true };
    case "AGENT_DISABLED": {
      const agent = AGENT_LABEL[String(error.details.agent_key ?? "")] ?? "este agente";
      return error.details.reason === "not_provisioned"
        ? { message: `El agente de ${agent} no está habilitado en esta clínica.`, reload: false }
        : { message: `El agente de ${agent} está apagado en esta clínica.`, reload: false };
    }
  }
  if (error.httpStatus === 403) return { message: "Tu rol no permite esta acción.", reload: false };
  if (error.httpStatus === 401) return { message: "Elige una persona del equipo para continuar.", reload: false };
  if (error.httpStatus === 429) return { message: "Demasiadas solicitudes seguidas. Espera un momento y vuelve a intentar.", reload: false };
  return { message: error.message, reload: false };
}

// --- Ejecutar ahora ------------------------------------------------------------

export const RUNNABLE_AGENTS: ReadonlyArray<{ agent: RunnableAgent; label: string; description: string }> = [
  { agent: "cobranza", label: "Cobranza", description: "Busca saldos vencidos y propone un recordatorio de pago." },
  { agent: "inventario", label: "Inventario", description: "Revisa el stock por sede y propone traspasos o reposiciones." },
  { agent: "confirmaciones", label: "Confirmaciones", description: "Pone en cola el recordatorio de las citas de mañana." },
  { agent: "backfill", label: "Cupos liberados", description: "Detecta cancelaciones y propone ofrecer el cupo a la lista de espera." },
];

function runLines(agent: Exclude<RunnableAgent, "backfill">, counts: AgentRunCounts): string[] {
  if (agent === "confirmaciones") {
    return [
      `${plural(counts.candidates, "cita de mañana revisada", "citas de mañana revisadas")}`,
      `${plural(counts.proposed, "recordatorio en cola", "recordatorios en cola")}`,
      `${counts.deduped} ${counts.deduped === 1 ? "ya estaba en cola" : "ya estaban en cola"}`,
      `${plural(counts.skipped, "omitido", "omitidos")}`,
    ];
  }
  return [
    agent === "cobranza"
      ? plural(counts.candidates, "cargo revisado", "cargos revisados")
      : plural(counts.candidates, "faltante de stock revisado", "faltantes de stock revisados"),
    plural(counts.proposed, "propuesta nueva", "propuestas nuevas"),
    `${counts.deduped} ${counts.deduped === 1 ? "ya estaba propuesta" : "ya estaban propuestas"}`,
    plural(counts.skipped, "omitido", "omitidos"),
  ];
}

function toRunResult(run: AgentRunOut, replayed: boolean): AgentRunResult {
  const agent = run.agent_key as Exclude<RunnableAgent, "backfill">;
  return { agent, status: run.status, lines: runLines(agent, run.counts), replayed, disabled: false };
}

function toTickResult(tick: JobsRunOut): AgentRunResult {
  const errors = tick.failed + tick.dead + tick.lost;
  const lines = tick.enqueued === 0 && tick.claimed === 0
    ? ["Sin cancelaciones nuevas"]
    : [
      ...(tick.enqueued ? [plural(tick.enqueued, "cancelación nueva detectada", "cancelaciones nuevas detectadas")] : []),
      ...(tick.claimed ? [plural(tick.done, "revisada", "revisadas")] : []),
      ...(errors ? [plural(errors, "con error", "con error")] : []),
    ];
  return { agent: "backfill", status: "completed", lines, replayed: false, disabled: tick.disabled_agents.includes("backfill") };
}

export async function runAgentNow(agent: RunnableAgent, idempotencyKey: string): Promise<AgentRunResult> {
  if (USE_MOCKS) return mockRun(agent, idempotencyKey);
  if (agent === "backfill") return toTickResult(await runDueAgentJobs(idempotencyKey));
  const { data, replayed } = await createAgentRun(agent, idempotencyKey);
  return toRunResult(data, replayed);
}

// --- mock mode: mirrors the backend rules -------------------------------------------

const KIND_PERMISSION: Record<InboxItem["kind"], string> = {
  collection_reminder: "deliveries.create",
  collection_follow_up: "follow_ups.create",
  inventory_transfer: "movements.create",
  inventory_entry: "movements.create",
  waitlist_offer: "deliveries.create",
  appointment_booking: "contact_appointments.book",
};

const PERMISSION_DENIED = () => new ApiError(403, "PERMISSION_DENIED", "The authenticated principal lacks the required permission.");
const mockReceipts = new Map<string, { fingerprint: string; value: unknown }>();
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function requireMockMe(): MeRead {
  const me = mockCurrentMe();
  if (!me) throw new ApiError(401, "AUTHENTICATION_REQUIRED", "A valid credential is required.");
  return me;
}

function mockEffectiveStatus(row: InboxItem, now: number): InboxStatus {
  return row.status === "pending" && new Date(row.expires_at).getTime() <= now ? "expired" : row.status;
}

/** `_agent_items` / `_appointment_items`: actions only for a pending row and a
 * human; approve needs the kind's permission, decline only `proposals.decide`. */
function mockActions(row: InboxItem, me: MeRead, status: InboxStatus): InboxAction[] {
  if (status !== "pending" || me.principal.type !== "human") return [];
  const has = (code: string) => me.permissions.includes(code);
  if (row.source === "appointment_proposal") return has(KIND_PERMISSION.appointment_booking) ? ["approve", "decline"] : [];
  if (!has("proposals.decide")) return [];
  return has(KIND_PERMISSION[row.kind]) ? ["approve", "decline"] : ["decline"];
}

function mockNames(): InboxCatalogNames {
  return {
    locations: new Map(mockLocations.map((location) => [Number(location.id), { name: location.name, timezone: location.timezone }])),
    services: new Map(mockServices.map((service) => [service.id, service.name])),
    practitioners: new Map(mockPractitionerNames),
  };
}

function mockView(row: InboxItem, me: MeRead, now = Date.now()): ApprovalItem {
  const status = mockEffectiveStatus(row, now);
  return toUiInboxItem({ ...row, status, actions: mockActions(row, me, status) }, mockNames());
}

function mockLoadInbox(status: InboxStatus): InboxPageView {
  const me = requireMockMe();
  if (!me.permissions.includes("proposals.read")) throw PERMISSION_DENIED();
  const now = Date.now();
  const rows = mockInboxItems
    .filter((row) => (row.source === "agent_proposal" || me.permissions.includes("appointments.read")) && mockEffectiveStatus(row, now) === status)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { items: rows.map((row) => mockView(row, me, now)), nextCursor: null };
}

function mockDecide(item: ApprovalItem, intent: DecisionIntent): DecisionResult {
  const receiptKey = `inbox-${intent.decision}:${intent.idempotencyKey}`;
  const receipt = mockReceipts.get(receiptKey);
  if (receipt) {
    if (receipt.fingerprint !== item.key) throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED", "The idempotency key was already used by a different request.");
    return { item: copy(receipt.value as ApprovalItem), replayed: true };
  }
  const me = requireMockMe();
  const row = mockInboxItems.find((candidate) => `${candidate.source}:${candidate.id}` === item.key);
  if (!row) throw new ApiError(404, "NOT_FOUND", "Proposal not found.");
  if (me.principal.type !== "human") throw PERMISSION_DENIED();
  const has = (code: string) => me.permissions.includes(code);
  const expired = new Date(row.expires_at).getTime() <= Date.now();

  if (row.source === "appointment_proposal") {
    if (!has(KIND_PERMISSION.appointment_booking)) throw PERMISSION_DENIED();
    if (intent.decision === "approve") {
      if (row.status !== "pending" || expired) throw new ApiError(422, "INVALID_INPUT", "The appointment proposal is no longer confirmable.");
      row.status = "executed";
      row.result_ref = { type: "appointment", id: 5000 + row.id };
    } else {
      if (row.status === "executed") throw new ApiError(422, "INVALID_INPUT", "A confirmed appointment proposal cannot be declined.");
      row.status = "expired"; // the backend stores a declined appointment proposal as expired
    }
    const settled = settledAppointment(item, intent.decision, row.status === "executed" ? "confirmed" : "expired");
    mockReceipts.set(receiptKey, { fingerprint: item.key, value: copy(settled) });
    return { item: settled, replayed: false };
  }

  if (!has("proposals.decide")) throw PERMISSION_DENIED();
  if (intent.decision === "approve") {
    if (!has(KIND_PERMISSION[row.kind])) throw PERMISSION_DENIED();
    if (row.status !== "pending") throw mockStatusError(row.status);
    if (expired) { row.status = "expired"; throw mockStatusError("expired"); }
    if (item.payloadHash !== row.payload_hash) throw new ApiError(409, "PROPOSAL_HASH_MISMATCH", "The approved payload does not match the proposal.");
    row.status = "executed";
    row.result_ref = mockResultRef(row);
  } else if (row.status !== "declined") {
    if (row.status !== "pending") throw mockStatusError(row.status);
    if (expired) { row.status = "expired"; throw mockStatusError("expired"); }
    row.status = "declined";
  }
  row.decided_by = { id: me.principal.id, display_name: me.principal.display_name };
  const settled = mockView(row, me);
  mockReceipts.set(receiptKey, { fingerprint: item.key, value: copy(settled) });
  return { item: settled, replayed: false };
}

function mockStatusError(status: string): ApiError {
  if (status === "expired") return new ApiError(410, "PROPOSAL_EXPIRED", "The proposal has expired.");
  if (status === "superseded") return new ApiError(409, "PROPOSAL_SUPERSEDED", "The proposal is out of date: its subject changed.");
  return new ApiError(409, "PROPOSAL_NOT_PENDING", "The proposal is no longer pending.", { status });
}

function mockResultRef(row: InboxItem): Record<string, unknown> {
  if (row.kind === "collection_reminder") return { type: "outbound_message", id: 900 + row.id };
  if (row.kind === "collection_follow_up") return { type: "charge_follow_up", id: 900 + row.id };
  if (row.kind === "inventory_transfer") return { type: "inventory_transfer", id: 900 + row.id };
  if (row.kind === "inventory_entry") return { type: "inventory_movement", id: 900 + row.id };
  return { type: "waitlist_offer", entry_ids: asRecord(row.payload)?.entry_ids ?? [] };
}

/** Overdue charges the mock Cobranza sweep sees. One has no proposal yet, so
 * the first run proposes exactly one and every later run dedupes all three. */
const MOCK_OVERDUE = [
  { chargeId: 31 },
  { chargeId: 32 },
  { chargeId: 33, patient: "Luis Mendoza", amount: "140.00", days: 8, conversationId: 14, locationId: 3, location: "Magdalena" },
] as const;
let mockRunSequence = 10;
let mockConfirmacionesQueued = false;

function mockRun(agent: RunnableAgent, key: string): AgentRunResult {
  const receipt = mockReceipts.get(`run:${key}`);
  if (receipt) {
    if (receipt.fingerprint !== agent) throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED", "The idempotency key was already used by a different request.");
    return { ...copy(receipt.value as AgentRunResult), replayed: true };
  }
  const me = requireMockMe();
  if (!canRunAgent(toStaffIdentity(me), agent)) throw PERMISSION_DENIED();
  const counts: AgentRunCounts = { candidates: 0, proposed: 0, deduped: 0, skipped: 0 };
  let result: AgentRunResult;
  if (agent === "backfill") {
    result = toTickResult({ enqueued: 0, claimed: 0, done: 0, failed: 0, dead: 0, lost: 0, disabled_agents: [], jobs: [] });
  } else {
    if (agent === "cobranza") {
      for (const candidate of MOCK_OVERDUE) {
        counts.candidates += 1;
        const exists = mockInboxItems.some((row) => row.kind === "collection_reminder" && asRecord(row.subject)?.id === String(candidate.chargeId));
        if (exists || !("patient" in candidate)) { counts.deduped += 1; continue; }
        counts.proposed += 1;
        mockInboxItems.push(mockReminder(candidate));
      }
    } else if (agent === "inventario") {
      counts.candidates = 1;
      counts.deduped = 1; // the open Lince transfer already covers the only shortfall
    } else {
      counts.candidates = 2;
      if (mockConfirmacionesQueued) counts.deduped = 2; else counts.proposed = 2;
      mockConfirmacionesQueued = true;
    }
    result = toRunResult({ id: mockRunSequence++, agent_key: agent, trigger: "manual", status: "completed", triggered_by_principal_id: me.principal.id, counts, error_category: null, started_at: new Date().toISOString(), finished_at: new Date().toISOString() }, false);
  }
  mockReceipts.set(`run:${key}`, { fingerprint: agent, value: copy(result) });
  return result;
}

function mockReminder(candidate: Extract<(typeof MOCK_OVERDUE)[number], { patient: string }>): InboxItem {
  const firstName = candidate.patient.split(" ")[0];
  const now = Date.now();
  return {
    source: "agent_proposal",
    id: 300 + mockInboxItems.length + 10,
    kind: "collection_reminder",
    agent_key: "cobranza",
    status: "pending",
    location_id: candidate.locationId,
    summary: `Recordatorio de pago a ${candidate.patient} — saldo S/ ${candidate.amount}`,
    reason: `Saldo vencido de S/ ${candidate.amount} hace ${candidate.days} días`,
    facts: { charge_id: candidate.chargeId, patient_id: 9, patient_name: candidate.patient, amount: candidate.amount, paid: "0.00", balance: candidate.amount },
    evidence: { run_id: mockRunSequence, amount: candidate.amount, balance: candidate.amount, days_since_issued: candidate.days, issued_on: new Date(now - candidate.days * 86_400_000).toISOString().slice(0, 10), last_payment_at: null, last_payment_amount: null },
    payload: { charge_id: candidate.chargeId, message_text: `Hola ${firstName}, le escribimos de ${candidate.location}. Tiene un saldo pendiente de S/ ${candidate.amount} por su atención reciente. Puede pagarlo en la sede o responder este mensaje para coordinar. ¡Gracias!` },
    payload_hash: "f".repeat(64),
    subject: { type: "charge", id: String(candidate.chargeId) },
    conversation_id: candidate.conversationId,
    confirmation_token: null,
    expires_at: new Date(now + 72 * 3_600_000).toISOString(),
    created_at: new Date(now).toISOString(),
    decided_by: null,
    result_ref: null,
    error_code: null,
    actions: [],
  };
}
