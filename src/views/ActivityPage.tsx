"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Bot, History, Plug, RotateCcw, Settings2, UserRound } from "lucide-react";
import {
  ACTIVITY_AGENTS,
  activitySentence,
  CLINIC_TIME_ZONE,
  describeObservabilityError,
  hasPermissions,
  loadActivity,
  loadAgentRuns,
  loadClinicLocations,
  RUNS_PAGE_SIZE,
  type ObservabilityError,
} from "../api";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { usePersona } from "../components/PersonaContext";
import type { ActivityEntry, ActorKind, AgentRunEntry, ClinicLocation, Tone } from "../types";
import type { AgentRunKey } from "../contracts/client";

/**
 * Actividad: one timeline of who did what — people and agents told apart —
 * and the history of agent runs, so every "Ejecutar ahora" leaves a trace.
 * Both are backend reads (`/activity`, `/agent-runs`); nothing is derived
 * beyond naming the agent.
 */
export function ActivityPage() {
  const { identity, loading } = usePersona();
  // null until the catalog read settles, so the feed is read once with sede names.
  const [locations, setLocations] = useState<Map<number, ClinicLocation> | null>(null);
  const human = identity?.principalType === "human";
  const allowed = hasPermissions(identity, ["proposals.read"]);

  useEffect(() => {
    let active = true;
    // Names only: a failed catalog read leaves rows without a sede, never with an invented one.
    loadClinicLocations().then((map) => { if (active) setLocations(map); }, () => { if (active) setLocations(new Map()); });
    return () => { active = false; };
  }, []);

  return <section className="page activity-page">
    <div className="page-heading">
      <div><h1>Actividad</h1><p>Quién hizo qué en la clínica: las personas del equipo y los agentes, en orden.</p></div>
    </div>
    {loading ? <p className="table-loading" role="status">Cargando…</p>
      : !human ? <p className="approvals-notice" role="note">Para ver la actividad, elige quién eres en el menú de perfil, abajo a la izquierda.</p>
      : !allowed ? <p className="approvals-notice" role="note">Tu rol no permite ver la actividad de la clínica.</p>
      : <div className="activity-layout">
        <ActivityFeed locations={locations} />
        <RunHistory />
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
