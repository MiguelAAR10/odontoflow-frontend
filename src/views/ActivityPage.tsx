"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Bot, History, Plug, RotateCcw, Settings2, UserRound } from "lucide-react";
import {
  ACTIVITY_AGENTS,
  useMocks,
  toApiError,
  CLINIC_TIME_ZONE,
  describeObservabilityError,
  hasPermissions,
  loadActivity,
  loadAgentRuns,
  loadClinicLocations,
  RUNS_PAGE_SIZE,
  type ObservabilityError,
} from "../api";
import { z } from "zod";
import { AgentIdSchema, ReversibleSchema } from "../agui/card";
import { useAgent } from "../agui/useAgent";
import { AgentLabel } from "../catalog/AgentLabel";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { usePersona } from "../components/PersonaContext";
import { useShellContext } from "../components/shell/ShellContext";
import { hasLocationPermissions } from "../session";
import type { ActivityEntry, ActorKind, AgentRunEntry, ClinicLocation, Tone } from "../types";
import type { AgentRunKey } from "../contracts/client";

/**
 * Actividad: one timeline of who did what — people and agents told apart —
 * and the history of agent runs, so every "Ejecutar ahora" leaves a trace.
 * Both are backend reads (`/activity`, `/agent-runs`); nothing is derived
 * beyond naming the agent.
 */
export function ActivityPage() {
  return useMocks ? <SimulatedTrail /> : <RealActivityPage />;
}

function RealActivityPage() {
  const { identity, loading } = usePersona();
  const { locationId } = useShellContext();
  // null until the catalog read settles, so the feed is read once with sede names.
  const [locations, setLocations] = useState<Map<number, ClinicLocation> | null>(null);
  const human = identity?.principalType === "human";
  const allowed = hasLocationPermissions(identity, ["proposals.read"], locationId ? Number(locationId) : undefined);
  const canReadRuns = hasPermissions(identity, ["proposals.read"]);

  useEffect(() => {
    let active = true;
    // Names only: a failed catalog read leaves rows without a sede, never with an invented one.
    loadClinicLocations().then((map) => { if (active) setLocations(map); }, () => { if (active) setLocations(new Map()); });
    return () => { active = false; };
  }, []);

  return <section className="page activity-page">
    <div className="page-heading">
      <div><h1>Rastro de acciones</h1><p>Quién hizo qué en la clínica: las personas del equipo y los agentes, en orden.</p></div>
    </div>
    {loading ? <p className="table-loading" role="status">Cargando…</p>
      : !human ? <p className="approvals-notice" role="note">Para ver la actividad, elige quién eres en el menú de perfil, abajo a la izquierda.</p>
      : !allowed ? <p className="approvals-notice" role="note">Tu rol no permite ver la actividad de la clínica.</p>
      : <div className="activity-layout">
        <ActivityFeed locations={locations} />
        {canReadRuns && <RunHistory />}
      </div>}
  </section>;
}

// --- shared formatting ----------------------------------------------------------

const dayKey = (iso: string, timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

function dayLabel(iso: string, timeZone: string, now: Date): string {
  const key = dayKey(iso, timeZone);
  if (key === dayKey(now.toISOString(), timeZone)) return "Hoy";
  if (key === dayKey(new Date(now.getTime() - 86_400_000).toISOString(), timeZone)) return "Ayer";
  const label = new Date(iso).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", timeZone });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const timeOfDay = (iso: string, timeZone: string) => new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone });
const shortDateTime = (iso: string, timeZone: string) => new Date(iso).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true, timeZone });

function ErrorNotice({ error, onRetry }: { error: ObservabilityError; onRetry: () => void }) {
  return <div className="form-error approvals-error" role="alert">
    <span>{error.message}</span>
    <Button compact icon={RotateCcw} onClick={onRetry}>{error.reload ? "Volver a cargar" : "Reintentar"}</Button>
  </div>;
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <label className="field activity-filter"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>;
}

// --- Actividad ----------------------------------------------------------------------

const ACTOR: Record<ActorKind, { label: string; icon: typeof Bot }> = {
  human: { label: "Persona", icon: UserRound },
  agent: { label: "Agente", icon: Bot },
  integration: { label: "Integración", icon: Plug },
  system: { label: "Sistema", icon: Settings2 },
};

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "?";

function ActivityFeed({ locations }: { locations: Map<number, ClinicLocation> | null }) {
  const [locationId, setLocationId] = useState("");
  const [agentKey, setAgentKey] = useState("");
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<ObservabilityError | null>(null);
  const filters = { locationId: locationId ? Number(locationId) : null, agentKey: agentKey || null };

  const refresh = useCallback(async () => {
    if (!locations) return;
    setLoading(true);
    setError(null);
    try {
      const page = await loadActivity({ locationId: locationId ? Number(locationId) : null, agentKey: agentKey || null }, locations);
      setEntries(page.entries);
      setNextCursor(page.nextCursor);
    } catch (caught) {
      setEntries([]);
      setNextCursor(null);
      setError(describeObservabilityError(caught, "actividad"));
    } finally {
      setLoading(false);
    }
  }, [locationId, agentKey, locations]);

  useEffect(() => { void refresh(); }, [refresh]);

  const loadMore = async () => {
    if (!nextCursor || !locations) return;
    setLoadingMore(true);
    try {
      const page = await loadActivity({ ...filters, cursor: nextCursor }, locations);
      setEntries((rows) => [...rows, ...page.entries.filter((entry) => !rows.some((row) => row.key === entry.key))]);
      setNextCursor(page.nextCursor);
    } catch (caught) {
      setError(describeObservabilityError(caught, "actividad"));
    } finally {
      setLoadingMore(false);
    }
  };

  const now = new Date();
  const groups: Array<{ key: string; label: string; entries: ActivityEntry[] }> = [];
  for (const entry of entries) {
    const key = dayKey(entry.occurredAt, entry.timeZone);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.entries.push(entry);
    else groups.push({ key, label: dayLabel(entry.occurredAt, entry.timeZone, now), entries: [entry] });
  }
  const filtered = Boolean(locationId || agentKey);

  return <section className="approvals-section activity-feed" aria-labelledby="activity-title" aria-busy={loading}>
    <header className="approvals-section__header">
      <h2 id="activity-title"><History size={19} aria-hidden="true" /> Lo que pasó</h2>
      <div className="activity-filters">
        <FilterSelect label="Sede" value={locationId} onChange={setLocationId}>
          <option value="">Todas las sedes</option>
          {[...(locations?.values() ?? [])].map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
        </FilterSelect>
        <FilterSelect label="Agente" value={agentKey} onChange={setAgentKey}>
          <option value="">Todos</option>
          {ACTIVITY_AGENTS.map((agent) => <option key={agent.key} value={agent.key}>{agent.label}</option>)}
        </FilterSelect>
      </div>
      {filtered && <p className="approvals-section__hint">
        {agentKey ? "Con un agente elegido se ven sus propuestas, las decisiones sobre ellas y sus corridas. " : ""}
        {locationId ? "Con una sede elegida no aparecen las corridas, que no pertenecen a una sede." : ""}
      </p>}
    </header>
    {error && <ErrorNotice error={error} onRetry={() => void refresh()} />}
    {loading ? <p className="table-loading" role="status">Cargando actividad…</p>
      : !error && entries.length === 0 ? <p className="empty-state approvals-empty">
        {filtered ? "No hay actividad con estos filtros. Prueba con «Todas las sedes» o «Todos» los agentes." : "Todavía no hay actividad registrada. Cuando alguien agende, cobre o decida una propuesta, aparecerá aquí."}
      </p>
      : <div className="activity-days">
        {groups.map((group) => <section key={group.key} className="activity-day" aria-label={group.label}>
          <h3 className="activity-day__label">{group.label}</h3>
          <ol className="activity-list-v2">
            {group.entries.map((entry) => <ActivityRow key={entry.key} entry={entry} />)}
          </ol>
        </section>)}
      </div>}
    {nextCursor && !loading && <div className="approvals-more"><Button compact onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "Cargando…" : "Cargar más"}</Button></div>}
  </section>;
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const actor = ACTOR[entry.actorKind];
  const Icon = actor.icon;
  return <li className={`activity-entry activity-entry--${entry.actorKind}`}>
    <time className="activity-entry__time" dateTime={entry.occurredAt}>{timeOfDay(entry.occurredAt, entry.timeZone)}</time>
    <span className={`activity-entry__marker activity-entry__marker--${entry.actorKind}`} aria-hidden="true">
      {entry.actorKind === "human" ? initials(entry.actorLabel) : <Icon size={16} strokeWidth={2} />}
    </span>
    <div className="activity-entry__body">
      <p className="activity-entry__sentence">
        <strong>{entry.actorLabel}</strong>
        {entry.verb === null ? <> · <span className="activity-entry__code">{entry.action}</span></> : ` ${entry.verb}${entry.context ? ` ${entry.context}` : ""}`}
        <span className="sr-only"> ({actor.label})</span>
      </p>
      <p className="activity-entry__meta">
        <span className="activity-entry__kind"><Icon size={13} aria-hidden="true" />{actor.label}</span>
        {entry.locationName && <span>{entry.locationName}</span>}
      </p>
    </div>
  </li>;
}

// --- Corridas -----------------------------------------------------------------------

const RUN_STATUS: Record<AgentRunEntry["status"], { label: string; tone: Tone }> = {
  completed: { label: "Completada", tone: "green" },
  running: { label: "En curso", tone: "amber" },
  failed: { label: "Falló", tone: "red" },
};

function RunHistory() {
  const [agentKey, setAgentKey] = useState<AgentRunKey | "">("");
  const [limit, setLimit] = useState(RUNS_PAGE_SIZE);
  const [entries, setEntries] = useState<AgentRunEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ObservabilityError | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const history = await loadAgentRuns({ agentKey: agentKey || null, limit });
      setEntries(history.entries);
      setHasMore(history.hasMore);
    } catch (caught) {
      setError(describeObservabilityError(caught, "corridas"));
    } finally {
      setLoading(false);
    }
  }, [agentKey, limit]);

  useEffect(() => { void refresh(); }, [refresh]);

  const atCap = !hasMore && entries.length >= 100;

  return <section id="corridas" className="approvals-section run-history" aria-labelledby="runs-title" aria-busy={loading}>
    <header className="approvals-section__header">
      <h2 id="runs-title"><Bot size={19} aria-hidden="true" /> Corridas de los agentes</h2>
      <p className="approvals-section__hint">Cada revisión que hizo un agente: a mano desde la Bandeja, programada o por un mensaje.</p>
      <div className="activity-filters">
        <FilterSelect label="Agente" value={agentKey} onChange={(value) => { setAgentKey(value as AgentRunKey | ""); setLimit(RUNS_PAGE_SIZE); }}>
          <option value="">Todos</option>
          {ACTIVITY_AGENTS.map((agent) => <option key={agent.key} value={agent.key}>{agent.label}</option>)}
        </FilterSelect>
      </div>
    </header>
    {error && <ErrorNotice error={error} onRetry={() => void refresh()} />}
    {loading && entries.length === 0 ? <p className="table-loading" role="status">Cargando corridas…</p>
      : !error && entries.length === 0 ? <p className="empty-state approvals-empty">{agentKey ? "Este agente todavía no ha corrido." : "Todavía no hay corridas. Usa «Ejecutar ahora» en la Bandeja para que un agente revise la clínica."}</p>
      : <ol className="run-list">{entries.map((entry) => <RunRow key={entry.key} entry={entry} />)}</ol>}
    {hasMore && <div className="approvals-more"><Button compact disabled={loading} onClick={() => setLimit((value) => Math.min(value + RUNS_PAGE_SIZE, 100))}>{loading ? "Cargando…" : "Cargar más"}</Button></div>}
    {atCap && <p className="field-note run-history__cap">Se muestran las 100 corridas más recientes.</p>}
  </section>;
}

function RunRow({ entry }: { entry: AgentRunEntry }) {
  const status = RUN_STATUS[entry.status];
  const titleId = `run-${entry.id}-title`;
  return <li className={`run-card run-card--${entry.status}`} aria-labelledby={titleId}>
    <header className="run-card__header">
      <h3 id={titleId}>{entry.agentLabel}</h3>
      <Badge tone={status.tone}>{status.label}</Badge>
    </header>
    <p className="run-card__meta">
      <time dateTime={entry.startedAt}>{shortDateTime(entry.startedAt, CLINIC_TIME_ZONE)}</time>
      {` · ${entry.triggerLabel}`}{entry.durationLabel && ` · ${entry.durationLabel}`}
    </p>
    {entry.conversationTurn
      ? <p className="run-card__note">Respondió un turno de conversación.</p>
      : <dl className="run-card__counts">{entry.counts.map((count) => <div key={count.label}><dt>{count.label}</dt><dd>{count.value}</dd></div>)}</dl>}
    {entry.status === "failed" && <p className="run-card__error">No terminó{entry.errorCategory ? ` · motivo: ${entry.errorCategory}` : ""}.</p>}
  </li>;
}


// Exact TrailEntry DTO; streaming world state can project the same rows.
const trailSchema = z.strictObject({
  at: z.iso.datetime({ offset: true }), agent: AgentIdSchema,
  action: z.string().min(1), object: z.string().min(1), result: z.string().min(1),
  approver: z.string().min(1), reversible: ReversibleSchema,
  reversibility_label: z.string().min(1),
});
type TrailEntry = z.infer<typeof trailSchema>;
export function OperationsStyles() {
  return <style jsx global>{`
    .airi-operations {max-width:1200px;margin:0 auto;padding:28px 24px 110px;color:var(--ink);font:14.5px/1.5 var(--font-text);overflow-wrap:anywhere}
    .airi-operations h1 {font:600 30px/1.2 var(--font-display);margin:0 0 8px}
    .airi-operations h2 {font:600 19px/1.3 var(--font-display);margin:0 0 14px}
    .airi-operations p {margin:0 0 16px}
    .airi-operations small,.airi-operations time,.operations-meta {color:var(--muted);font-size:13.5px}
    .operations-head {display:flex;justify-content:space-between;gap:16px;align-items:start;margin-bottom:24px;flex-wrap:wrap}
    .operations-head label {display:grid;gap:4px}
    .airi-operations select {font:inherit;padding:8px 12px;background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:8px;min-height:44px}
    .operations-note {color:var(--ink-2);max-width:85ch}
    .operations-rows {padding:0;margin:0;list-style:none;border:1px solid var(--line);border-radius:14px;background:var(--surface);overflow:hidden}
    .operations-row {display:grid;grid-template-columns:60px 115px minmax(0,1fr) auto auto;gap:16px;align-items:center;padding:16px;border-bottom:1px solid var(--line)}
    .operations-row:last-child {border-bottom:0}
    .operations-row small {display:block;margin-top:4px}
    .operations-row .catalog-agent,.operations-agent {white-space:nowrap}.operations-agent{display:flex;align-items:center;gap:6px;font-size:13px}.operations-agent img{flex:none}
    .operations-layout {display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px}
    .operations-panel {border:1px solid var(--line);background:var(--surface);border-radius:14px;padding:18px;min-width:0}
    .operations-panel + .operations-panel {margin-top:18px}
    .operations-appointment {display:grid;grid-template-columns:52px minmax(0,1fr) auto;gap:10px;padding:12px 0;border-top:1px solid var(--line);align-items:center}
    .operations-count {font:600 20px var(--font-display);font-variant-numeric:tabular-nums}
    .operations-case {margin-top:16px}
    .airi-operations button:focus-visible,.airi-operations select:focus-visible,.airi-operations a:focus-visible {outline:2px solid var(--ink);outline-offset:4px}
    @media(max-width:760px) {.airi-operations {padding:22px 16px 110px}.operations-layout {grid-template-columns:1fr}.operations-row {grid-template-columns:48px minmax(0,1fr);gap:6px 12px}.operations-row>div,.operations-row>.operations-meta {grid-column:2}.operations-appointment {grid-template-columns:44px minmax(0,1fr)}.operations-appointment>.operations-meta {grid-column:2}}
  `}</style>;
}

const trailCharacters = { airi: "01-diente", cepillo: "02-cepillo", pasta: "03-pasta", hilo: "04-hilo", enjuague: "05-enjuague", espejo: "06-espejo", escudo: "07-escudo" } as const;

function SimulatedTrail() {
  const agent = useAgent();
  const [filter, setFilter] = useState("");
  const [fixtures, setFixtures] = useState<TrailEntry[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void import("../agui/sim/fixtures/trail.json").then(module => {
      const rows = z.array(trailSchema).parse(module.default);
      if (active) setFixtures(rows);
    }).catch(caught => { if (active) setError(toApiError(caught).message); });
    return () => { active = false; };
  }, []);
  const live = z.object({ trail: z.array(trailSchema) }).safeParse(agent.worldState);
  const rows = [...(live.success ? live.data.trail : fixtures ?? [])].sort((a,b) => a.at.localeCompare(b.at));
  const visible = rows.filter(row => !filter || row.agent === filter);
  // Approval evidence comes only from the confirmed card/store, never the chat.
  const completed = Object.values(agent.cards).filter(entry => entry.status === "approved" && (!filter || entry.card.agent === filter));
  return <section className="airi-operations" aria-labelledby="trail-title">
    <OperationsStyles />
    <header className="operations-head"><div><h1 id="trail-title">Rastro de acciones</h1><p className="operations-meta">Hora Lima · hechos y decisiones del equipo</p></div>
      <label>Agente<select aria-label="Filtrar por agente" value={filter} onChange={event => setFilter(event.target.value)}><option value="">Todos los agentes</option>{AgentIdSchema.options.map(id => <option key={id} value={id}>{id === "airi" ? "AIRI" : id[0]!.toUpperCase()+id.slice(1)}</option>)}</select></label></header>
    <p className="operations-note">Una fila por hecho: agente, acción, objeto, resultado, quién aprobó y si se puede deshacer.</p>
    {error ? <p role="alert">{error}</p> : fixtures === null ? <p role="status">Cargando rastro…</p> : <>
      <ol className="operations-rows" aria-label="Hechos registrados">{visible.map((row,index) => <li data-trail-row key={`${row.at}:${row.agent}:${index}`} className="operations-row">
        <time dateTime={row.at} title={shortDateTime(row.at, CLINIC_TIME_ZONE)}>{new Date(row.at).toLocaleTimeString("es-PE", {timeZone:CLINIC_TIME_ZONE,hour:"2-digit",minute:"2-digit",hourCycle:"h23"})}</time>
        <span className="operations-agent"><img src={`/personajes/svg/${trailCharacters[row.agent]}-flat.svg`} width={24} height={24} alt="" /><span>{row.agent === "airi" ? "AIRI" : row.agent[0]!.toUpperCase() + row.agent.slice(1)}</span></span><div><strong>{row.action}</strong><small>{row.object} · {row.result}</small></div>
        <span className="operations-meta">{row.approver === "—" ? "Sin aprobador registrado" : `Aprobó ${row.approver}`}</span><span className="operations-meta">{row.reversibility_label === "—" ? "Reversibilidad no informada" : row.reversibility_label}</span>
      </li>)}</ol>{!visible.length && <p role="status">No hay acciones con este filtro.</p>}
    </>}
    {completed.length > 0 && <section style={{marginTop:24}} aria-label="Decisiones confirmadas del hilo"><h2>Decisiones confirmadas en este hilo</h2><ol className="operations-rows">{completed.map(({card}) => <li className="operations-row" key={card.id}><span className="operations-meta">Sin hora</span><AgentLabel agent={card.agent}/><div><strong>{card.title}</strong><small>{card.result}</small></div><span className="operations-meta">Aprobada por ti</span><span className="operations-meta">{card.reversible === "none" ? "No reversible" : "Consulta el alcance de la tarjeta"}</span></li>)}</ol></section>}
  </section>;
}
