"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Check, ClipboardCheck, Play, RotateCcw, ShieldCheck } from "lucide-react";
import {
  beginDecision,
  canRunAgent,
  decideInboxItem,
  describeApprovalError,
  loadInbox,
  newIdempotencyKey,
  RUNNABLE_AGENTS,
  runAgentNow,
  useMocks,
  type ActionableError,
  type DecisionIntent,
} from "../api";
import { Card as CatalogCard, LegacyInboxCard } from "../catalog/Card";
import { AgentLabel } from "../catalog/AgentLabel";
import { Character } from "../crew/characters/Character";
import type { Card } from "../agui/card";
import { createDraftInbox, toCard, type DraftInboxRow } from "../approvals";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { usePersona } from "../components/PersonaContext";
import { Tabs } from "../components/Tabs";
import type { AgentRunResult, ApprovalItem, ApprovalStatus, ProposalDecision, RunnableAgent, StaffIdentity, Tone } from "../types";
import { createLatestRequest } from "../session";
import { getSessionVersion } from "../contracts/client";

/**
 * Bandeja: everything the agents propose, with its evidence, in one place.
 * Nothing runs until a person approves it; the backend decides who may
 * (`actions` per item) and re-checks every decision.
 */
export function ApprovalsPage() {
  const { identity, loading, version } = usePersona();
  const [reloadToken, setReloadToken] = useState(0);
  const human = identity?.principalType === "human";
  return <section className="page approvals-page">
    <div className="page-heading page-heading--with-actions">
      <div><h1>Bandeja</h1><p>Lo que proponen los agentes, con su evidencia. Tú decides qué se ejecuta.</p></div>
      <span className="cash-authority-note"><ShieldCheck size={17} aria-hidden="true" /> {useMocks ? "Simulación con datos de referencia" : "Cada decisión queda registrada"}</span>
    </div>
    {!loading && !human && <p className="approvals-notice" role="note">Para aprobar o declinar, elige quién eres en el menú de perfil, abajo a la izquierda.</p>}
    <BandejaStyles />
    <ClinicInbox key={version} reloadToken={reloadToken} />
    {!useMocks && <AgentRunsPanel identity={identity} onRan={() => setReloadToken((value) => value + 1)} />}
  </section>;
}

export interface InboxSummary { pending: number; pendingPartial: boolean; verification: number | null }
/** Same clinic queue in Bandeja and Mi turno, independent of an agent thread. */
export function ClinicInbox({ reloadToken = 0, onSummary }: { reloadToken?: number; onSummary?: (summary: InboxSummary) => void }) {
  const { identity, version } = usePersona();
  return <div className="clinic-inbox airi-catalog"><BandejaStyles />
    {useMocks ? <FixtureInbox key={version} identity={identity} onSummary={onSummary} /> : <InboxSection key={version} reloadToken={reloadToken} onSummary={onSummary} />}
  </div>;
}

// --- Ejecutar ahora ---------------------------------------------------------------

interface RunState {
  /** One key per click; a retry after an error reuses it. */
  key: string;
  busy: boolean;
  result: AgentRunResult | null;
  error: ActionableError | null;
}

function AgentRunsPanel({ identity, onRan }: { identity: StaffIdentity | null; onRan: () => void }) {
  const [runs, setRuns] = useState<Partial<Record<RunnableAgent, RunState>>>({});
  const agents = RUNNABLE_AGENTS.filter((agent) => canRunAgent(identity, agent.agent));
  if (agents.length === 0) return null;

  const run = async (agent: RunnableAgent) => {
    // Clicking again after a failure retries the same intent (same key);
    // after a finished run, a click is a new run.
    const previous = runs[agent];
    const key = previous?.error ? previous.key : newIdempotencyKey();
    setRuns((state) => ({ ...state, [agent]: { key, busy: true, result: null, error: null } }));
    try {
      const result = await runAgentNow(agent, key);
      setRuns((state) => ({ ...state, [agent]: { key, busy: false, result, error: null } }));
      onRan();
    } catch (caught) {
      setRuns((state) => ({ ...state, [agent]: { key, busy: false, result: null, error: describeApprovalError(caught) } }));
    }
  };

  return <section className="approvals-section agent-runs" aria-labelledby="agent-runs-title">
    <header className="approvals-section__header">
      <h2 id="agent-runs-title"><Play size={19} aria-hidden="true" /> Ejecutar ahora</h2>
      <p className="approvals-section__hint">Cada agente revisa los datos de la clínica y deja sus propuestas en la bandeja.</p>
    </header>
    <ul className="agent-runs__grid">
      {agents.map(({ agent, label, description }) => {
        const state = runs[agent];
        return <li key={agent} className="agent-run">
          <div className="agent-run__text"><h3>{label}</h3><p>{description}</p></div>
          <Button compact variant="primary" icon={Play} disabled={state?.busy} onClick={() => void run(agent)} aria-describedby={`agent-run-${agent}-result`}>
            {state?.busy ? "Ejecutando…" : "Ejecutar ahora"}
          </Button>
          <div id={`agent-run-${agent}-result`} className="agent-run__result" aria-live="polite">
            {state?.result && <RunSummary result={state.result} />}
            {state?.error && <div className="form-error agent-run__error" role="alert">
              <span>{state.error.message}</span>
              {!state.error.reload && <Button compact onClick={() => void run(agent)}>Reintentar</Button>}
            </div>}
          </div>
        </li>;
      })}
    </ul>
  </section>;
}

function RunSummary({ result }: { result: AgentRunResult }) {
  if (result.disabled) return <p className="field-note">El agente está apagado en esta clínica; no se revisó nada.</p>;
  return <>
    <p className="agent-run__status">
      {result.status === "failed" ? "La corrida falló." : result.status === "running" ? "La corrida sigue en curso." : "Listo."}
      {result.replayed && " Esta corrida ya se había hecho; se muestra el mismo resultado."}
    </p>
    <ul className="agent-run__counts">{result.lines.map((line) => <li key={line}>{line}</li>)}</ul>
    <Link className="agent-run__trace" href="/agente#corridas">Ver en Corridas</Link>
  </>;
}

// --- inbox ------------------------------------------------------------------------

const STATUS_TABS: Array<{ id: ApprovalStatus; label: string }> = [
  { id: "pending", label: "Pendientes" },
  { id: "approved", label: "Aprobadas/en proceso" },
  { id: "executed", label: "Ejecutadas" },
  { id: "declined", label: "Declinadas" },
  { id: "expired", label: "Vencidas" },
  { id: "failed", label: "Con error" },
  { id: "superseded", label: "Reemplazadas" },
];

const STATUS_BADGE: Record<ApprovalStatus, { label: string; tone: Tone }> = {
  pending: { label: "Pendiente", tone: "amber" },
  approved: { label: "Aprobada", tone: "blue" },
  executed: { label: "Ejecutada", tone: "green" },
  failed: { label: "Con error", tone: "red" },
  declined: { label: "Declinada", tone: "slate" },
  expired: { label: "Vencida", tone: "slate" },
  superseded: { label: "Reemplazada", tone: "slate" },
};

const EMPTY_COPY: Record<ApprovalStatus, string> = {
  pending: "No hay propuestas esperando revisión. Usa «Ejecutar ahora» para que un agente revise la clínica.",
  approved: "No hay propuestas aprobadas en curso.",
  executed: "Todavía no hay propuestas ejecutadas.",
  declined: "No hay propuestas declinadas.",
  expired: "No hay propuestas vencidas.",
  failed: "Ninguna propuesta falló al ejecutarse.",
  superseded: "No hay propuestas reemplazadas.",
};

function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

/** Re-render relative expiry copy without refetching. */
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

interface DecisionState {
  intent: DecisionIntent;
  busy: boolean;
  error: ActionableError | null;
}

function InboxSection({ reloadToken, onSummary }: { reloadToken: number; onSummary?: (summary: InboxSummary) => void }) {
  const [view, setView] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<ApprovalStatus>("pending");
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [decisions, setDecisions] = useState<Record<string, DecisionState>>({});
  const [announcement, setAnnouncement] = useState("");
  // A decided card leaves the pending list, so focus lands on the stable
  // section heading instead of falling to <body>.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reads = useRef(createLatestRequest());
  const currentStatus = useRef(status);
  const now = useNow();

  const refresh = useCallback(async () => {
    const isCurrent = reads.current.begin();
    setLoading(true);
    setLoadingMore(false);
    setNextCursor(null);
    setError("");
    setDecisions({});
    try {
      const page = await loadInbox({ status });
      if (!isCurrent()) return;
      setItems(page.items);
      setNextCursor(page.nextCursor);
    } catch (caught) {
      if (!isCurrent()) return;
      setItems([]);
      setNextCursor(null);
      setError(describeApprovalError(caught).message);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void refresh();
    return () => reads.current.invalidate();
  }, [refresh, reloadToken]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore || loading) return;
    const isCurrent = reads.current.begin();
    setLoadingMore(true);
    try {
      const page = await loadInbox({ status, cursor: nextCursor });
      if (!isCurrent()) return;
      setItems((rows) => [...rows, ...page.items.filter((item) => !rows.some((row) => row.key === item.key))]);
      setNextCursor(page.nextCursor);
    } catch (caught) {
      if (isCurrent()) setError(describeApprovalError(caught).message);
    } finally {
      if (isCurrent()) setLoadingMore(false);
    }
  };

  const decide = async (item: ApprovalItem, decision: ProposalDecision) => {
    const identityVersion = getSessionVersion();
    const isCurrent = () => identityVersion === getSessionVersion() && currentStatus.current === status;
    // Repeating the same decision after a failure is a retry of the same
    // intent and reuses its Idempotency-Key; a different decision is new.
    const previous = decisions[item.key];
    const intent = previous?.intent.decision === decision ? previous.intent : beginDecision(item, decision);
    setDecisions((state) => ({ ...state, [item.key]: { intent, busy: true, error: null } }));
    try {
      const { item: settled, replayed } = await decideInboxItem(item, intent);
      if (!isCurrent()) return;
      setDecisions((state) => {
        const next = { ...state };
        delete next[item.key];
        return next;
      });
      setAnnouncement(decisionAnnouncement(settled, decision, replayed));
      if (settled.status !== status) {
        setItems((rows) => rows.filter((row) => row.key !== item.key));
        headingRef.current?.focus();
      } else {
        setItems((rows) => rows.map((row) => (row.key === item.key ? settled : row)));
      }
    } catch (caught) {
      if (!isCurrent()) return;
      const error = describeApprovalError(caught, item.source);
      setDecisions((state) => ({ ...state, [item.key]: { intent, busy: false, error } }));
      throw new Error(error.message);
    }
  };

  const presentation = items.map(toCard);
  const filteredIds = new Set(filterInboxCards(presentation, view, true).map(card => card.id));
  const visible = items.filter(item => filteredIds.has(item.key) && (view !== "mine" || (item.status === "pending" && item.actions.length > 0)) && (view !== "verify" || item.status === "pending"));
  const pendingCount = items.filter(item => item.status === "pending").length;
  useEffect(() => { if (!loading && !error && status === "pending") onSummary?.({ pending: pendingCount, pendingPartial: nextCursor !== null, verification: null }); }, [loading, error, status, pendingCount, nextCursor, onSummary]);
  const active = visible.find(item => item.key === selected) ?? visible[0];
  const tabLabel = STATUS_TABS.find((tab) => tab.id === status)?.label ?? "";

  return <>
    <div className="approvals-live" aria-live="polite" role="status">
      {announcement && <div className="success-banner"><Check size={18} aria-hidden="true" />{announcement}</div>}
    </div>

    <section className="approvals-section" aria-labelledby="inbox-title" aria-busy={loading}>
      <header className="approvals-section__header approvals-section__header--inbox">
        <h2 id="inbox-title" ref={headingRef} tabIndex={-1}><ClipboardCheck size={19} aria-hidden="true" /> Propuestas {tabLabel.toLowerCase()}</h2>
        {!loading && !error && <span className="approvals-count" aria-label={`${items.length}${nextCursor ? " o más" : ""} propuestas`}>{items.length}{nextCursor ? "+" : ""}</span>}
        <Tabs ariaLabel="Filtrar por estado" panelId="inbox-list" value={status} onChange={(value) => { reads.current.invalidate(); currentStatus.current = value as ApprovalStatus; setAnnouncement(""); setStatus(value as ApprovalStatus); }} items={STATUS_TABS} />
      </header>
      {error && <div className="form-error approvals-error" role="alert">{error}<Button compact icon={RotateCcw} onClick={() => void refresh()}>Reintentar</Button></div>}
      <InboxViews value={view} onChange={setView} cards={presentation} canDecide mine={items.filter(item => item.status === "pending" && item.actions.length > 0).length} />
      <div id="inbox-list">
        {loading ? <p className="table-loading" role="status">Cargando propuestas…</p>
          : !error && visible.length === 0 ? <p className="empty-state approvals-empty">{view === "all" || view === "mine" ? EMPTY_COPY[status] : "No hay casos con este filtro en los datos disponibles."}</p>
          : <div className="bandeja-layout">
            <CaseList cards={visible.map(toCard)} selected={active?.key ?? null} onSelect={setSelected} states={Object.fromEntries(visible.map(item => [item.key, STATUS_BADGE[item.status].label]))} />
            {active && <div id="bandeja-selected" className="bandeja-detail"><ConversationContext card={toCard(active)} /><div className="bandeja-proposal"><ApprovalCard key={active.key} item={active} now={now} decision={decisions[active.key]} onDecide={decide} onReload={() => void refresh()} /></div></div>}
          </div>}
        {nextCursor && !loading && <div className="approvals-more"><Button compact onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "Cargando…" : "Cargar más"}</Button></div>}
      </div>
    </section>
  </>;
}

function decisionAnnouncement(item: ApprovalItem, decision: ProposalDecision, replayed: boolean): string {
  const replay = replayed ? " Ya estaba registrado; no se repitió." : "";
  if (decision === "decline") return `Declinada: ${item.headline}.${replay}`;
  if (item.status === "executed") return `Aprobada y ejecutada: ${item.headline}.${item.outcome ? ` ${item.outcome}.` : ""}${replay}`;
  if (item.status === "failed") return `Aprobada, pero no se pudo ejecutar: ${item.headline}.${item.errorCode ? ` Código ${item.errorCode}.` : ""}`;
  return `Aprobada: ${item.headline}.${replay}`;
}

function ApprovalCard({ item, now, decision, onDecide, onReload }: {
  item: ApprovalItem;
  now: number;
  decision: DecisionState | undefined;
  onDecide: (item: ApprovalItem, decision: ProposalDecision) => Promise<void>;
  onReload: () => void;
}) {
  const lapsed = item.status === "pending" && new Date(item.expiresAt).getTime() <= now;
  const badge = lapsed ? STATUS_BADGE.expired : STATUS_BADGE[item.status];
  const pending = item.status === "pending";
  const canApprove = pending && item.actions.includes("approve") && !lapsed;
  const canDecline = pending && item.actions.includes("decline");
  return <>
    <div className="bandeja-detail-meta"><Badge tone={badge.tone}>{badge.label}</Badge>
      {pending && <span>{lapsed ? "Pasó el plazo para aprobar" : `Vence en ${formatDuration(new Date(item.expiresAt).getTime() - now)}`}</span>}
    </div>
    <LegacyInboxCard card={toCard(item)} status={decision?.busy ? "loading" : pending ? "pending" : item.status === "declined" ? "rejected" : item.status === "failed" ? "error" : "done"}
      loadingReason={decision?.busy ? "approval" : null}
      {...(canApprove ? { onApprove: () => onDecide(item, "approve") } : {})}
      {...(canDecline ? { onAlternative: () => onDecide(item, "decline") } : {})}
      error={decision?.error?.message ?? null} />
    {pending && !item.actions.length && <p className="field-note">Tu rol no puede decidir esta propuesta.</p>}
    {item.decidedBy && <p className="field-note">Decidió {item.decidedBy}</p>}
    {item.errorCode && <p className="form-error">Código {item.errorCode}</p>}
    {decision?.error && <Button compact icon={RotateCcw} onClick={decision.error.reload ? onReload : () => void onDecide(item, decision.intent.decision).catch(() => {})}>{decision.error.reload ? "Volver a cargar" : "Reintentar"}</Button>}
  </>;
}

type InboxCard = Omit<Card, "version">;
const pendingCard = (card: InboxCard) => card.state === "pending" || card.state === "ready";
const scopeValue = (card: InboxCard, label: string) => card.scope?.find(item => item.label.toLowerCase() === label.toLowerCase())?.value;
const needsVerification = (card: InboxCard) => pendingCard(card) && /(?:por verificar|confirmar ingreso)/i.test(card.title);

export function filterInboxCards<T extends InboxCard>(cards: readonly T[], view: string, canDecide: boolean): T[] {
  return cards.filter(card => {
    if (view === "mine") return canDecide && pendingCard(card);
    if (view === "verify") return needsVerification(card);
    if (view === "unassigned") return pendingCard(card) && scopeValue(card, "Responsable")?.toLowerCase() === "sin asignar";
    if (view === "waiting") return scopeValue(card, "Estado")?.toLowerCase() === "esperando respuesta";
    return true;
  });
}

export function inboxContext(card: InboxCard) {
  const sources = (card.srcs ?? []).filter(source => /whatsapp/i.test(source));
  return {
    sources,
    evidence: sources.length && card.why ? card.why : "No consta",
    channel: scopeValue(card, "Canal") ?? "No consta",
    responsible: scopeValue(card, "Responsable") ?? "No consta",
    reply: "No consta",
  };
}

function ConversationContext({ card }: { card: InboxCard }) {
  const context = inboxContext(card);
  const titleId = useId();
  return <section className="bandeja-conversation" aria-labelledby={titleId}>
    <div className="bandeja-chat">
      <h3 id={titleId}>Conversación · WhatsApp</h3>
      <div className="bandeja-bubble"><small>Contexto registrado</small><p>{context.evidence}</p><small>{context.sources.length ? context.sources.join(" · ") : "Historial de mensajes: No consta"}</small></div>
      <p className="bandeja-chat-missing">Historial completo: No consta · Respuesta del equipo: {context.reply}</p>
    </div>
    <dl className="bandeja-window"><div><dt>Ventana / canal</dt><dd>{context.channel}</dd></div><div><dt>Responsable</dt><dd>{context.responsible}</dd></div></dl>
  </section>;
}

function InboxViews({ value, onChange, cards, canDecide, mine }: { value: string; onChange: (value: string) => void; cards: InboxCard[]; canDecide: boolean; mine: number }) {
  const views = [{ id: "mine", label: "Mías", count: mine },
    { id: "unassigned", label: "Sin asignar", count: filterInboxCards(cards, "unassigned", canDecide).length },
    { id: "verify", label: "Por verificar", count: filterInboxCards(cards, "verify", canDecide).length },
    { id: "waiting", label: "Esperando respuesta", count: filterInboxCards(cards, "waiting", canDecide).length },
    { id: "all", label: "Todas", count: cards.length }];
  return <div className="bandeja-views" role="group" aria-label="Vistas de bandeja">
    {views.map(view => <button key={view.id} type="button" aria-pressed={value === view.id} onClick={() => onChange(view.id)}>{`${view.label} `}<span>{view.count}</span></button>)}
    <p>Mías: pendientes que puedes decidir. Asignación y espera solo si constan.</p>
  </div>;
}

function CaseList({ cards, selected, onSelect, states }: { cards: InboxCard[]; selected: string | null; onSelect: (id: string) => void; states?: Record<string, string> }) {
  return <ul className="bandeja-cases" aria-label="Propuestas">
    {cards.map(card => <li key={card.id}><button type="button" aria-current={card.id === selected ? "true" : undefined} aria-controls="bandeja-selected" onClick={() => onSelect(card.id)}>
      <Character agent={card.agent} decorative gaze={false} state="idle" size={28} />
      <span className="bandeja-case-body"><b>{scopeValue(card, "Para") ?? card.title}</b><small>{scopeValue(card, "Para") ? card.title : <AgentLabel agent={card.agent} />}</small></span>
      <span className="bandeja-case-state">{states?.[card.id] ?? (card.state === "approved" ? "Aprobada" : card.state === "declined" ? "Descartada" : card.level === "borrador" ? "Borrador" : "Requiere decisión")}</span>
    </button></li>)}
  </ul>;
}

function FixtureInbox({ identity, onSummary }: { identity: StaffIdentity | null; onSummary?: (summary: InboxSummary) => void }) {
  const inbox = useRef<ReturnType<typeof createDraftInbox> | null>(null);
  const [rows, setRows] = useState<DraftInboxRow[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState("p-reprog");
  const [view, setView] = useState("all");
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const editButton = useRef<HTMLButtonElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const intents = useRef(new Map<string, { decision: ProposalDecision; key: string }>());
  useEffect(() => {
    let live = true;
    // Explicit seam: real mode never imports these business fixtures.
    if (useMocks) void import("../agui/sim/fixtures/proposals.json").then(({ default: proposals }) => {
      if (!live) return;
      inbox.current = createDraftInbox(proposals as Card[]);
      setRows(inbox.current.list());
      setLoaded(true);
    }).catch(caught => { if (live) { setError(describeApprovalError(caught).message); setLoaded(true); } });
    return () => { live = false; };
  }, []);
  const canDecide = identity?.principalType === "human" && identity.permissions.includes("proposals.decide");
  const cards = rows.map(row => row.card);
  const mine = filterInboxCards(cards, "mine", canDecide === true);
  const filteredIds = new Set(filterInboxCards(cards, view, canDecide === true).map(card => card.id));
  const visible = rows.filter(row => filteredIds.has(row.card.id));
  const pendingCount = cards.filter(pendingCard).length;
  const verificationCount = cards.filter(needsVerification).length;
  useEffect(() => { if (loaded && !error) onSummary?.({ pending: pendingCount, pendingPartial: false, verification: verificationCount }); }, [loaded, error, pendingCount, verificationCount, onSummary]);
  const active = visible.find(row => row.card.id === selected) ?? visible[0];
  const select = (id: string) => { setSelected(id); setEditing(false); setError(""); };
  const decide = (decision: ProposalDecision) => {
    if (!active || !inbox.current || !canDecide) return;
    const intentId = `${active.card.id}:${active.envelope.version}`;
    let intent = intents.current.get(intentId);
    if (!intent || intent.decision !== decision) {
      intent = { decision, key: newIdempotencyKey() };
      intents.current.set(intentId, intent);
    }
    try {
      inbox.current.decide(active.envelope, decision, intent.key);
      setRows(inbox.current.list());
      setError("");
      setAnnouncement(`${decision === "approve" ? "Aprobada" : "Descartada"}: ${active.card.title}`);
      detailHeading.current?.focus();
    } catch (caught) {
      const message = describeApprovalError(caught).message;
      setError(message);
      throw caught; // Catalog releases its intent latch on failure.
    }
  };
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!active || !inbox.current) return;
    try {
      const next = inbox.current.edit(active.envelope, text);
      setRows(inbox.current.list());
      setEditing(false);
      setError("");
      setAnnouncement(`Borrador guardado. Versión ${next.envelope.version}; vuelve a revisarlo antes de aprobar.`);
      requestAnimationFrame(() => editButton.current?.focus());
    } catch (caught) { setError(describeApprovalError(caught).message); }
  };
  return <section aria-labelledby="bandeja-title" className="bandeja-inbox" aria-busy={!loaded}>
    <header className="bandeja-section-head"><h2 id="bandeja-title">Necesita acción</h2><span>{mine.length} pendientes</span></header>
    <InboxViews value={view} onChange={value => { setView(value); setEditing(false); setError(""); }} mine={mine.length} cards={cards} canDecide={canDecide === true} />
    <p className="bandeja-announcement" role="status">{announcement}</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!loaded ? <p role="status">Cargando propuestas…</p> : !visible.length ? <p className="empty-state">No hay casos con este filtro en los datos disponibles. Revisa Todas para consultar la evidencia.</p> : <div className="bandeja-layout">
      <CaseList cards={visible.map(row => row.card)} selected={active?.card.id ?? null} onSelect={select} />
      {active && <div id="bandeja-selected" className="bandeja-detail">
        <ConversationContext card={active.card} /><div className="bandeja-proposal">
        <h2 ref={detailHeading} tabIndex={-1} className="bandeja-detail-heading">Detalle de propuesta <span>Versión {active.envelope.version}</span></h2>
        {editing ? <form className="bandeja-editor" onSubmit={save}>
          <label htmlFor="bandeja-draft">Texto del borrador</label>
          <textarea id="bandeja-draft" value={text} onChange={event => setText(event.target.value)} autoFocus required maxLength={4000} />
          <p>Guardar crea una nueva versión. Los montos, las fuentes y el alcance se conservan.</p>
          <div><Button compact onClick={() => { setEditing(false); requestAnimationFrame(() => editButton.current?.focus()); }}>Cancelar</Button><Button compact type="submit" variant="primary" disabled={!text.trim()}>Guardar nueva versión</Button></div>
        </form> : <>
          <CatalogCard card={active.card}
            {...(canDecide ? { onApprove: () => decide("approve"), onAlternative: () => decide("decline") } : {})} />
          {canDecide && active.card.level === "borrador" && active.card.state === "pending" && <button ref={editButton} className="catalog-button bandeja-edit" type="button" onClick={() => { setText(active.card.body.replace(/<[^>]*>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim()); setEditing(true); }}>Editar borrador</button>}
        </>}
        {!canDecide && <p className="field-note">Elige una persona con permiso para decidir.</p>}
      </div></div>}
    </div>}
  </section>;
}

function BandejaStyles() {
  return <style>{`
    .approvals-page{max-width:1200px;margin:0 auto;color:var(--ink)}
    .clinic-inbox{min-width:0;color:var(--ink)}
    .bandeja-section-head,.bandeja-detail-meta{display:flex;align-items:center;gap:12px;margin:12px 0}
    .bandeja-section-head h2{font:500 19px var(--font-display);margin:0}
    .bandeja-section-head>span,.bandeja-detail-meta>span{font-size:13px;color:var(--muted)}
    .bandeja-section-head h2:before{content:"";display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--yellow);margin-right:9px}
    .bandeja-views{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:10px 0}
    .bandeja-views button{display:flex;gap:6px;align-items:center;min-height:36px;padding:6px 12px;border:1px solid var(--line);border-radius:99px;background:transparent;color:var(--ink);font:inherit;font-size:14px;cursor:pointer}
    .bandeja-views button[aria-pressed=true]{background:var(--btn);color:var(--btn-ink);border-color:var(--btn)}
    .bandeja-views p{flex-basis:100%;font-size:12px;color:var(--muted);margin:2px 0}
    .bandeja-views span{font-variant-numeric:tabular-nums}
    .bandeja-layout{display:grid;gap:16px;align-items:start}
    .bandeja-cases{margin:0;padding:0;list-style:none;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
    .bandeja-cases .personaje,.bandeja-cases .personaje *{animation:none!important;transition:none!important}
    .bandeja-cases li+li{border-top:1px solid var(--line)}
    .bandeja-cases button{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:12px;align-items:center;text-align:left;padding:10px 14px;width:100%;min-height:66px;border:0;background:transparent;color:var(--ink);font:inherit;cursor:pointer;overflow-wrap:anywhere}
    .bandeja-cases button:hover{background:var(--hover)}
    .bandeja-cases button[aria-current=true]{background:var(--blue-soft)}
    .bandeja-cases b{font-weight:500;font-size:14px;line-height:1.5}
    .bandeja-case-body small{display:block;font-size:13px;color:var(--muted);margin-top:3px}
    .bandeja-case-state{font-size:12px;color:var(--muted);text-align:right}
    .bandeja-detail{min-width:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:start;scroll-margin-top:80px}
    .bandeja-conversation{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;min-width:0}
    .bandeja-chat{padding:16px;display:grid;gap:12px}
    .bandeja-chat h3{font:500 14px var(--font-text);margin:0;color:var(--muted)}
    .bandeja-bubble{padding:10px 12px;background:var(--surface-2);border-radius:12px 12px 12px 4px;font-size:14px;line-height:1.6;overflow-wrap:anywhere}
    .bandeja-bubble p{margin:0 0 5px}.bandeja-bubble small,.bandeja-chat-missing{font-size:12px;color:var(--muted)}
    .bandeja-chat-missing{margin:0}.bandeja-window{display:grid;gap:6px;margin:0;padding:12px 16px;border-top:1px solid var(--line);font-size:12px;line-height:1.6}
    .bandeja-window div{display:flex;gap:6px;flex-wrap:wrap}.bandeja-window dt{color:var(--muted)}.bandeja-window dt:after{content:":"}.bandeja-window dd{margin:0;overflow-wrap:anywhere}
    .bandeja-proposal{min-width:0}.bandeja-detail-heading{font:400 12px var(--font-text);display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;margin:0 0 8px;color:var(--muted)}
    .bandeja-detail-heading span{font-variant-numeric:tabular-nums}
    .bandeja-editor{padding:20px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius)}
    .bandeja-editor label{display:block;font-weight:500;margin-bottom:12px}
    .bandeja-editor textarea{width:100%;min-height:180px;resize:vertical;padding:12px;background:var(--surface-2);color:var(--ink);border:1px solid var(--line-2);border-radius:8px;font:inherit}
    .bandeja-editor p{font-size:13px;color:var(--muted);line-height:1.6}.bandeja-editor>div{display:flex;flex-wrap:wrap;gap:8px}
    .bandeja-edit{margin-top:12px;min-height:44px}.bandeja-announcement:empty{display:none}.bandeja-announcement{color:var(--green-ink);font-size:14px;line-height:1.6}
    .clinic-inbox button:focus-visible,.clinic-inbox textarea:focus-visible,.bandeja-detail-heading:focus-visible{outline:2px solid var(--focus);outline-offset:3px}
    @media(max-width:1100px){.turn-page .bandeja-detail{grid-template-columns:minmax(0,1fr)}}
    @media(max-width:760px){.bandeja-detail{grid-template-columns:minmax(0,1fr)}.bandeja-cases button{grid-template-columns:28px minmax(0,1fr);padding:10px 12px;gap:6px 10px}.bandeja-case-state{grid-column:2;text-align:left}.bandeja-views button{min-height:44px}}
  `}</style>;
}
