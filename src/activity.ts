/**
 * Actividad (`GET /activity`), Corridas (`GET /agent-runs`) and Productividad
 * (`GET /metrics/productivity`) behind the same `useMocks` seam as
 * `src/api.ts` (which re-exports this module).
 *
 * The three reads are for people: the backend answers 403 to agents and
 * integrations. `/activity` and `/agent-runs` need `proposals.read`;
 * `/metrics/productivity` needs `audit.read` (administrador) and refuses a
 * range wider than 92 days. Amounts are PEN decimals; dates are the clinic's
 * local calendar.
 */
import { USE_MOCKS } from "./env";
import {
  ApiError,
  getProductivity,
  listActivity,
  listAgentRuns,
  listLocations,
  toApiError,
  type ActivityItem,
  type AgentRunCounts,
  type AgentRunKey,
  type AgentRunOut,
  type MeRead,
  type ProductivityReport,
} from "./contracts/client";
import { mockActivityItems, mockActivityRow, mockAgentRuns, mockInboxItems, mockLocations, mockProductivityFacts } from "./mockData";
import { mockCurrentMe } from "./session";
import type {
  ActivityEntry,
  ActivityFeedPage,
  ActorKind,
  AgentRunCount,
  AgentRunEntry,
  AgentRunHistory,
  ClinicLocation,
  ProductivityView,
} from "./types";

export const CLINIC_TIME_ZONE = "America/Lima";
const ACTIVITY_PAGE_SIZE = 25;
export const RUNS_PAGE_SIZE = 25;
const RUNS_MAX_LIMIT = 100;
export const PRODUCTIVITY_MAX_SPAN_DAYS = 92;

/** Agent keys as the owner knows them. Shared with the Bandeja. */
export const AGENT_LABEL: Record<string, string> = {
  cobranza: "Cobranza",
  inventario: "Inventario",
  confirmaciones: "Confirmaciones",
  backfill: "Cupos liberados",
  reception: "Recepción",
};

/** Filter options, in the order the clinic meets the agents. */
export const ACTIVITY_AGENTS: ReadonlyArray<{ key: AgentRunKey; label: string }> = [
  { key: "reception", label: AGENT_LABEL.reception! },
  { key: "cobranza", label: AGENT_LABEL.cobranza! },
  { key: "confirmaciones", label: AGENT_LABEL.confirmaciones! },
  { key: "backfill", label: AGENT_LABEL.backfill! },
  { key: "inventario", label: AGENT_LABEL.inventario! },
];

// --- clinic locations (names for the feed, options for the filters) -------------

export async function loadClinicLocations(): Promise<Map<number, ClinicLocation>> {
  if (USE_MOCKS) return new Map(mockLocations.map((row) => [Number(row.id), { id: Number(row.id), name: row.name, timeZone: row.timezone }]));
  const rows = await listLocations();
  return new Map(rows.map((row) => [row.id, { id: row.id, name: row.name, timeZone: row.timezone }]));
}

// --- Actividad --------------------------------------------------------------------

const ACTOR_KINDS: readonly ActorKind[] = ["human", "agent", "integration", "system"];
/** Agent principals are named `airy-<agent_key>` by the backend. */
const AGENT_PRINCIPAL = /^airy-([a-z_]+)$/;

function agentKeyOf(item: ActivityItem, actorKind: ActorKind): string | null {
  if (item.agent_key) return item.agent_key;
  if (actorKind !== "agent") return null;
  const match = AGENT_PRINCIPAL.exec(item.actor_display_name);
  return match && AGENT_LABEL[match[1]!] ? match[1]! : null;
}

export function toUiActivityItem(item: ActivityItem, locations: ReadonlyMap<number, ClinicLocation>): ActivityEntry {
  const actorKind: ActorKind = (ACTOR_KINDS as readonly string[]).includes(item.actor_kind) ? (item.actor_kind as ActorKind) : "system";
  const agentKey = agentKeyOf(item, actorKind);
  const agentLabel = agentKey ? AGENT_LABEL[agentKey] ?? agentKey : null;
  // `summary` is "<actor_display_name> <verb>" for a templated action and
  // "<actor_display_name>: <action>" otherwise (app/observability/activity.py).
  const prefix = `${item.actor_display_name} `;
  const verb = item.summary.startsWith(prefix) ? item.summary.slice(prefix.length) : null;
  const actorLabel = actorKind === "agent"
    ? agentLabel ? `El agente de ${agentLabel}` : `El agente ${item.actor_display_name}`
    : item.actor_display_name;
  const location = item.location_id == null ? undefined : locations.get(item.location_id);
  return {
    key: `${item.source}:${item.id}`,
    source: item.source,
    occurredAt: item.occurred_at,
    timeZone: location?.timeZone ?? CLINIC_TIME_ZONE,
    action: item.action,
    actorKind,
    actorLabel,
    verb,
    context: actorKind !== "agent" && agentLabel ? `del agente de ${agentLabel}` : null,
    agentKey,
    agentLabel,
    locationName: location?.name ?? null,
  };
}

/** "Lucía Ramos aprobó una propuesta del agente de Cobranza". */
export function activitySentence(entry: ActivityEntry): string {
  if (entry.verb === null) return `${entry.actorLabel} · ${entry.action}`;
  return `${entry.actorLabel} ${entry.verb}${entry.context ? ` ${entry.context}` : ""}`;
}

export interface ActivityFilters {
  locationId?: number | null;
  agentKey?: string | null;
  cursor?: string | null;
}

export async function loadActivity(filters: ActivityFilters, locations: ReadonlyMap<number, ClinicLocation>): Promise<ActivityFeedPage> {
  const page = USE_MOCKS
    ? mockListActivity(filters)
    : await listActivity({
      ...(filters.locationId != null ? { location_id: filters.locationId } : {}),
      ...(filters.agentKey ? { agent_key: filters.agentKey } : {}),
      limit: ACTIVITY_PAGE_SIZE,
      ...(filters.cursor ? { cursor: filters.cursor } : {}),
    });
  return { entries: page.items.map((item) => toUiActivityItem(item, locations)), nextCursor: page.next_cursor };
}

// --- Corridas ---------------------------------------------------------------------

const TRIGGER_LABEL: Record<AgentRunOut["trigger"], string> = { manual: "Manual", schedule: "Programada", event: "Automática" };

function countLabels(agent: AgentRunKey): [string, string, string, string] {
  if (agent === "confirmaciones") return ["Citas revisadas", "Recordatorios en cola", "Ya estaban en cola", "Omitidos"];
  return ["Revisados", "Propuestas nuevas", "Ya propuestas", "Omitidos"];
}

function runCounts(agent: AgentRunKey, counts: AgentRunCounts): AgentRunCount[] {
  const [candidates, proposed, deduped, skipped] = countLabels(agent);
  return [
    { label: candidates, value: counts.candidates },
    { label: proposed, value: counts.proposed },
    { label: deduped, value: counts.deduped },
    { label: skipped, value: counts.skipped },
  ];
}

function durationLabel(startIso: string, endIso: string | null): string | null {
  if (!endIso) return null;
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${Math.max(seconds, 1)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return minutes % 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes / 60} h`;
}

export function toUiAgentRun(run: AgentRunOut): AgentRunEntry {
  // Reception runs are one conversation turn each; their counters were
  // removed from the backend (B3), so zeros there mean "not counted".
  const conversationTurn = run.agent_key === "reception";
  return {
    key: `run:${run.id}`,
    id: run.id,
    agent: run.agent_key,
    agentLabel: AGENT_LABEL[run.agent_key] ?? run.agent_key,
    trigger: run.trigger,
    triggerLabel: conversationTurn && run.trigger === "event" ? "Por mensaje" : TRIGGER_LABEL[run.trigger],
    status: run.status,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    durationLabel: durationLabel(run.started_at, run.finished_at),
    counts: conversationTurn ? [] : runCounts(run.agent_key, run.counts),
    rawCounts: run.counts,
    conversationTurn,
    errorCategory: run.error_category,
  };
}

/** The contract pages runs by `limit` only (1–100, newest first, no cursor):
 * "Cargar más" asks again for a longer list. */
export async function loadAgentRuns({ agentKey, limit = RUNS_PAGE_SIZE }: { agentKey?: AgentRunKey | null; limit?: number } = {}): Promise<AgentRunHistory> {
  const capped = Math.min(Math.max(1, Math.floor(limit)), RUNS_MAX_LIMIT);
  const page = USE_MOCKS
    ? mockListRuns(agentKey ?? null, capped)
    : await listAgentRuns({ ...(agentKey ? { agent_key: agentKey } : {}), limit: capped });
  return {
    entries: page.items.map(toUiAgentRun),
    hasMore: page.items.length === capped && capped < RUNS_MAX_LIMIT,
    limit: capped,
  };
}

// --- Productividad ------------------------------------------------------------------

/** "S/ 1,250.50" from the backend's decimal string (PEN only). */
export function formatSoles(value: string | number): string {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return `S/ ${value}`;
  return `S/ ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Today's date (YYYY-MM-DD) on the clinic's wall calendar. */
export function clinicDay(now: Date = new Date(), timeZone = CLINIC_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function shiftDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
}

export type ProductivityPreset = "today" | "last7" | "last30" | "month" | "last90";

export const PRODUCTIVITY_PRESETS: ReadonlyArray<{ id: ProductivityPreset; label: string }> = [
  { id: "today", label: "Hoy" },
  { id: "last7", label: "Últimos 7 días" },
  { id: "last30", label: "Últimos 30 días" },
  { id: "month", label: "Este mes" },
  { id: "last90", label: "Últimos 90 días" },
];

export function productivityPreset(preset: ProductivityPreset, now: Date = new Date()): { from: string; to: string } {
  const to = clinicDay(now);
  switch (preset) {
    case "today": return { from: to, to };
    case "last7": return { from: shiftDate(to, -6), to };
    case "month": return { from: `${to.slice(0, 8)}01`, to };
    case "last90": return { from: shiftDate(to, -89), to };
    default: return { from: shiftDate(to, -29), to };
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The backend's own rule (`validate_range`), in Spanish, or null when valid. */
export function productivityRangeError(from: string, to: string): string | null {
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) return "Elige una fecha de inicio y una de fin.";
  if (from > to) return "La fecha de inicio debe ser anterior o igual a la de fin.";
  if (daysBetween(from, to) > PRODUCTIVITY_MAX_SPAN_DAYS) return `El rango puede abarcar como máximo ${PRODUCTIVITY_MAX_SPAN_DAYS} días. Acórtalo para ver el reporte.`;
  return null;
}

export function toUiProductivity(report: ProductivityReport): ProductivityView {
  return {
    from: report.from,
    to: report.to,
    locationId: report.location_id,
    appointments: { completed: report.appointments.completed, noShow: report.appointments.no_show, cancelled: report.appointments.cancelled },
    money: { charged: formatSoles(report.money.charged), collected: formatSoles(report.money.collected), outstanding: formatSoles(report.money.outstanding) },
    proposals: report.proposals.map((row) => ({
      agent: row.agent_key,
      agentLabel: AGENT_LABEL[row.agent_key] ?? row.agent_key,
      created: row.created,
      approved: row.approved,
      declined: row.declined,
      expired: row.expired,
    })),
    remindersApproved: report.collection_reminders_approved,
  };
}

export async function loadProductivity({ from, to, locationId }: { from: string; to: string; locationId?: number | null }): Promise<ProductivityView> {
  const invalid = productivityRangeError(from, to);
  if (invalid) throw new ApiError(422, "RANGE_INVALID", invalid);
  const report = USE_MOCKS
    ? mockProductivity(from, to, locationId ?? null)
    : await getProductivity({ from, to, ...(locationId != null ? { location_id: locationId } : {}) });
  return toUiProductivity(report);
}

// --- errors a person can act on ---------------------------------------------------

export type ObservabilitySurface = "actividad" | "corridas" | "productividad";

export interface ObservabilityError {
  message: string;
  /** The list moved under a cursor: offer "Volver a cargar". */
  reload: boolean;
}

export function describeObservabilityError(caught: unknown, surface: ObservabilitySurface): ObservabilityError {
  const error = toApiError(caught);
  if (error.code === "RANGE_INVALID") return { message: error.message, reload: false };
  if (error.httpStatus === 401) return { message: "Elige una persona del equipo para continuar.", reload: false };
  if (error.httpStatus === 403) {
    if (surface === "productividad") return { message: "Solo el administrador puede ver la productividad.", reload: false };
    return { message: surface === "corridas" ? "Tu rol no permite ver las corridas de los agentes." : "Tu rol no permite ver la actividad de la clínica.", reload: false };
  }
  if (error.httpStatus === 422 && error.code === "INVALID_INPUT") {
    if (surface === "productividad") return { message: `Revisa las fechas: la de inicio no puede ser posterior a la de fin y el rango puede abarcar como máximo ${PRODUCTIVITY_MAX_SPAN_DAYS} días.`, reload: false };
    return { message: "La lista cambió mientras la leías. Vuelve a cargarla.", reload: true };
  }
  if (error.httpStatus === 429) return { message: "Demasiadas solicitudes seguidas. Espera un momento y vuelve a intentar.", reload: false };
  return { message: error.message, reload: false };
}

// --- mock mode: mirrors the backend rules -------------------------------------------

const MOCK_PERMISSION_DENIED = () => new ApiError(403, "PERMISSION_DENIED", "The authenticated principal lacks the required permission.");

function requireMockHuman(permission: string, humanOnly: boolean): MeRead {
  const me = mockCurrentMe();
  if (!me) throw new ApiError(401, "AUTHENTICATION_REQUIRED", "A valid credential is required.");
  if (humanOnly && me.principal.type !== "human") throw MOCK_PERMISSION_DENIED();
  if (!me.permissions.includes(permission)) throw MOCK_PERMISSION_DENIED();
  return me;
}

type FeedKey = [string, string, number];
const feedKey = (row: ActivityItem): FeedKey => [row.occurred_at, row.source, row.id];
/** Descending by (occurred_at, source, id), like the backend's ORDER BY. */
function compareFeed(a: FeedKey, b: FeedKey): number {
  for (let index = 0; index < 3; index += 1) {
    if (a[index]! < b[index]!) return 1;
    if (a[index]! > b[index]!) return -1;
  }
  return 0;
}
const encodeMockCursor = (key: FeedKey): string => btoa(JSON.stringify(key)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function decodeMockCursor(cursor: string): FeedKey {
  try {
    const raw = JSON.parse(atob(cursor.replace(/-/g, "+").replace(/_/g, "/"))) as unknown;
    if (Array.isArray(raw) && raw.length === 3 && typeof raw[0] === "string" && typeof raw[1] === "string" && Number.isInteger(raw[2])) return raw as FeedKey;
  } catch { /* falls through to the backend's 422 */ }
  throw new ApiError(422, "INVALID_INPUT", "The cursor is invalid.");
}

function mockListActivity(filters: ActivityFilters): { items: ActivityItem[]; next_cursor: string | null } {
  requireMockHuman("proposals.read", true);
  const after = filters.cursor ? decodeMockCursor(filters.cursor) : null;
  const rows = mockActivityItems
    .filter((row) => (filters.agentKey ? row.agent_key === filters.agentKey : true))
    .filter((row) => (filters.locationId != null ? row.location_id === filters.locationId : true))
    .filter((row) => (after ? compareFeed(feedKey(row), after) > 0 : true))
    .sort((a, b) => compareFeed(feedKey(a), feedKey(b)));
  const page = rows.slice(0, ACTIVITY_PAGE_SIZE);
  const last = page[page.length - 1];
  return { items: page.map((row) => ({ ...row })), next_cursor: rows.length > ACTIVITY_PAGE_SIZE && last ? encodeMockCursor(feedKey(last)) : null };
}

function mockListRuns(agentKey: AgentRunKey | null, limit: number): { items: AgentRunOut[] } {
  requireMockHuman("proposals.read", false);
  const rows = mockAgentRuns
    .filter((run) => (agentKey ? run.agent_key === agentKey : true))
    .sort((a, b) => b.started_at.localeCompare(a.started_at) || b.id - a.id);
  return { items: rows.slice(0, limit).map((run) => ({ ...run, counts: { ...run.counts } })) };
}

let mockAuditSequence = 2000;

/** Bandeja mock actions leave the same trace the backend's audit rows do. */
export function recordMockActivity(input: { source: "audit" | "proposal"; action: string; entity: readonly [string, string]; me: MeRead; agentKey?: string | null; locationId?: number | null }): void {
  mockActivityItems.push(mockActivityRow({
    source: input.source,
    id: mockAuditSequence++,
    occurredAt: new Date().toISOString(),
    action: input.action,
    entity: input.entity,
    actor: { id: input.me.principal.id, kind: input.me.principal.type, name: input.me.principal.display_name },
    agentKey: input.agentKey ?? null,
    locationId: input.locationId ?? null,
  }));
}

/** An agent's own proposal (e.g. the reminder a Cobranza run creates). */
export function recordMockProposalCreated(input: { id: number; agentKey: string; locationId: number | null; createdAt: string }): void {
  const name = `airy-${input.agentKey}`;
  mockActivityItems.push(mockActivityRow({
    source: "proposal",
    id: mockAuditSequence++,
    occurredAt: input.createdAt,
    action: "agent_proposal.created",
    entity: ["agent_proposal", String(input.id)],
    actor: { id: null, kind: "agent", name },
    agentKey: input.agentKey,
    locationId: input.locationId,
  }));
}

/** A finished "Ejecutar ahora": one `agent_runs` row, read by both Corridas and Actividad. */
export function recordMockRun(run: AgentRunOut, me: MeRead): void {
  mockAgentRuns.push({ ...run, counts: { ...run.counts } });
  mockActivityItems.push(mockActivityRow({
    source: "agent_run",
    id: run.id,
    occurredAt: run.started_at,
    action: `agent_run.${run.status}`,
    entity: ["agent_run", String(run.id)],
    actor: { id: me.principal.id, kind: me.principal.type, name: me.principal.display_name },
    agentKey: run.agent_key,
  }));
}

export function nextMockRunId(): number {
  return mockAgentRuns.reduce((max, run) => Math.max(max, run.id), 0) + 1;
}

const sum = (values: string[]): number => values.reduce((total, value) => total + Number(value), 0);

/** The productivity oracle over the mock facts and the Bandeja rows. */
function mockProductivity(from: string, to: string, locationId: number | null): ProductivityReport {
  requireMockHuman("audit.read", true);
  const today = clinicDay();
  const inRange = (isoDate: string) => isoDate >= from && isoDate <= to;
  const dayOf = (daysAgo: number) => shiftDate(today, -daysAgo);
  const atSede = (id: number | null | undefined) => locationId === null || id === locationId;
  const now = Date.now();

  const appointments = { completed: 0, no_show: 0, cancelled: 0 };
  for (const row of mockProductivityFacts.appointments) {
    if (atSede(row.locationId) && inRange(dayOf(row.daysAgo))) appointments[row.state as keyof typeof appointments] += 1;
  }

  const scoped = mockProductivityFacts.charges.filter((charge) => atSede(charge.locationId));
  const cohort = scoped.filter((charge) => inRange(dayOf(charge.daysAgo)));
  const live = mockProductivityFacts.payments.filter((payment) => !payment.reversed);
  const collected = live.filter((payment) => scoped.some((charge) => charge.id === payment.chargeId) && inRange(dayOf(payment.daysAgo)));
  const outstanding = cohort.reduce((total, charge) => total + Number(charge.amount) - sum(live.filter((payment) => payment.chargeId === charge.id).map((payment) => payment.amount)), 0);

  const buckets = new Map<string, [number, number, number, number]>([["cobranza", [0, 0, 0, 0]], ["reception", [0, 0, 0, 0]]]);
  let reminders = 0;
  const declinedAppointments = new Set(mockActivityItems.filter((row) => row.action === "appointment_proposal.declined").map((row) => row.entity_id));
  for (const row of mockInboxItems) {
    if (!atSede(row.location_id) || !inRange(clinicDay(new Date(row.created_at)))) continue;
    const lapsed = row.status === "pending" && new Date(row.expires_at).getTime() <= now;
    const key = row.source === "appointment_proposal" ? "reception" : row.agent_key ?? "unknown";
    const bucket = buckets.get(key) ?? [0, 0, 0, 0];
    bucket[0] += 1;
    if (row.source === "appointment_proposal") {
      const declined = declinedAppointments.has(String(row.id));
      if (row.status === "executed") bucket[1] += 1;
      if (declined) bucket[2] += 1;
      if ((row.status === "expired" && !declined) || lapsed) bucket[3] += 1;
    } else {
      const approved = row.decided_by !== null && row.status !== "declined";
      if (approved) bucket[1] += 1;
      if (row.status === "declined") bucket[2] += 1;
      if (row.status === "expired" || lapsed) bucket[3] += 1;
      if (approved && row.kind === "collection_reminder") reminders += 1;
    }
    buckets.set(key, bucket);
  }

  return {
    from,
    to,
    location_id: locationId,
    appointments,
    money: {
      currency: "PEN",
      charged: sum(cohort.map((charge) => charge.amount)).toFixed(2),
      collected: sum(collected.map((payment) => payment.amount)).toFixed(2),
      outstanding: outstanding.toFixed(2),
    },
    proposals: [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([agent_key, [created, approved, declined, expired]]) => ({ agent_key, created, approved, declined, expired })),
    collection_reminders_approved: reminders,
  };
}
