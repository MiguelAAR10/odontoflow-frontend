"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Boxes, CalendarCheck2, Check, ClipboardCheck, Hourglass, Play, RotateCcw, ShieldCheck, WalletCards, type LucideIcon } from "lucide-react";
import {
  beginDecision,
  canRunAgent,
  decideInboxItem,
  describeApprovalError,
  loadInbox,
  newIdempotencyKey,
  RUNNABLE_AGENTS,
  runAgentNow,
  type ActionableError,
  type DecisionIntent,
} from "../api";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { usePersona } from "../components/PersonaContext";
import { Tabs } from "../components/Tabs";
import type { AgentRunResult, ApprovalCategory, ApprovalItem, ApprovalStatus, ProposalDecision, RunnableAgent, StaffIdentity, Tone } from "../types";

/**
 * Bandeja: everything the agents propose, with its evidence, in one place.
 * Nothing runs until a person approves it; the backend decides who may
 * (`actions` per item) and re-checks every decision.
 */
export function ApprovalsPage() {
  const { identity, loading } = usePersona();
  const [reloadToken, setReloadToken] = useState(0);
  const human = identity?.principalType === "human";
  return <section className="page approvals-page">
    <div className="page-heading page-heading--with-actions">
      <div><h1>Bandeja</h1><p>Lo que proponen los agentes, con su evidencia. Nada se ejecuta sin una aprobación.</p></div>
      <span className="cash-authority-note"><ShieldCheck size={17} aria-hidden="true" /> El backend valida cada decisión</span>
    </div>
    {!loading && !human && <p className="approvals-notice" role="note">Para aprobar o declinar, elige quién eres en el menú de perfil, abajo a la izquierda.</p>}
    <AgentRunsPanel identity={identity} onRan={() => setReloadToken((value) => value + 1)} />
    <InboxSection reloadToken={reloadToken} />
  </section>;
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
  </>;
}

// --- inbox ------------------------------------------------------------------------

const STATUS_TABS: Array<{ id: ApprovalStatus; label: string }> = [
  { id: "pending", label: "Pendientes" },
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

const CATEGORY_ICON: Record<ApprovalCategory, LucideIcon> = {
  cobranza: WalletCards,
  inventario: Boxes,
  lista_espera: Hourglass,
  cita: CalendarCheck2,
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
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

interface DecisionState {
  intent: DecisionIntent;
  busy: boolean;
  error: ActionableError | null;
}

function InboxSection({ reloadToken }: { reloadToken: number }) {
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
  const now = useNow();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    setDecisions({});
    try {
      const page = await loadInbox({ status });
      setItems(page.items);
      setNextCursor(page.nextCursor);
    } catch (caught) {
      setItems([]);
      setNextCursor(null);
      setError(describeApprovalError(caught).message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void refresh();
  }, [refresh, reloadToken]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await loadInbox({ status, cursor: nextCursor });
      setItems((rows) => [...rows, ...page.items.filter((item) => !rows.some((row) => row.key === item.key))]);
      setNextCursor(page.nextCursor);
    } catch (caught) {
      setError(describeApprovalError(caught).message);
    } finally {
      setLoadingMore(false);
    }
  };

  const decide = async (item: ApprovalItem, decision: ProposalDecision) => {
    // Repeating the same decision after a failure is a retry of the same
    // intent and reuses its Idempotency-Key; a different decision is new.
    const previous = decisions[item.key];
    const intent = previous?.intent.decision === decision ? previous.intent : beginDecision(item, decision);
    setDecisions((state) => ({ ...state, [item.key]: { intent, busy: true, error: null } }));
    try {
      const { item: settled, replayed } = await decideInboxItem(item, intent);
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
      setDecisions((state) => ({ ...state, [item.key]: { intent, busy: false, error: describeApprovalError(caught) } }));
    }
  };

  const tabLabel = STATUS_TABS.find((tab) => tab.id === status)?.label ?? "";

  return <>
    <div className="approvals-live" aria-live="polite" role="status">
      {announcement && <div className="success-banner"><Check size={18} aria-hidden="true" />{announcement}</div>}
    </div>

    <section className="approvals-section" aria-labelledby="inbox-title" aria-busy={loading}>
      <header className="approvals-section__header approvals-section__header--inbox">
        <h2 id="inbox-title" ref={headingRef} tabIndex={-1}><ClipboardCheck size={19} aria-hidden="true" /> Propuestas {tabLabel.toLowerCase()}</h2>
        {!loading && !error && <span className="approvals-count" aria-label={`${items.length}${nextCursor ? " o más" : ""} propuestas`}>{items.length}{nextCursor ? "+" : ""}</span>}
        <Tabs ariaLabel="Filtrar por estado" panelId="inbox-list" value={status} onChange={(value) => { setAnnouncement(""); setStatus(value as ApprovalStatus); }} items={STATUS_TABS} />
      </header>
      {error && <div className="form-error approvals-error" role="alert">{error}<Button compact icon={RotateCcw} onClick={() => void refresh()}>Reintentar</Button></div>}
      <div id="inbox-list">
        {loading ? <p className="table-loading" role="status">Cargando propuestas…</p>
          : !error && items.length === 0 ? <p className="empty-state approvals-empty">{EMPTY_COPY[status]}</p>
          : <ul className="approvals-grid">
            {items.map((item) => <li key={item.key}>
              <ApprovalCard item={item} now={now} decision={decisions[item.key]} onDecide={decide} onReload={() => void refresh()} />
            </li>)}
          </ul>}
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
  onDecide: (item: ApprovalItem, decision: ProposalDecision) => void;
  onReload: () => void;
}) {
  const titleId = `approval-${item.key.replace(/[^a-z0-9]/gi, "-")}-title`;
  const Icon = CATEGORY_ICON[item.category];
  const remaining = new Date(item.expiresAt).getTime() - now;
  const lapsed = item.status === "pending" && remaining <= 0;
  const badge = lapsed ? STATUS_BADGE.expired : STATUS_BADGE[item.status];
  const canApprove = item.actions.includes("approve") && !lapsed;
  const canDecline = item.actions.includes("decline");
  const busy = decision?.busy ?? false;

  return <article className={`approval-card approval-card--${lapsed ? "lapsed" : item.status}`} aria-labelledby={titleId}>
    <header className="approval-card__header">
      <span className="approval-card__category"><Icon size={15} aria-hidden="true" />{item.categoryLabel}</span>
      <Badge tone={badge.tone}>{badge.label}</Badge>
    </header>
    <div className="approval-card__lead">
      <h3 id={titleId}>{item.headline}</h3>
      {item.detail && <p className="approval-card__detail">{item.detail}</p>}
    </div>
    {item.facts.length > 0 && <dl className="approval-card__facts">
      {item.facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
    </dl>}
    {item.message && <figure className="approval-card__message">
      <figcaption>{item.status === "pending" ? "Mensaje que se enviará" : "Mensaje"}</figcaption>
      <blockquote>{item.message}</blockquote>
    </figure>}
    <p className="approval-card__meta">
      {item.agentLabel ? `Propuesto por el agente de ${item.agentLabel}` : "Propuesto desde una conversación"}
      {item.locationName && ` · ${item.locationName}`}
      {item.status === "pending" && (lapsed ? ` · Venció hace ${formatDuration(-remaining)}` : ` · Vence en ${formatDuration(remaining)}`)}
    </p>
    {(item.decidedBy || item.outcome || item.errorCode) && <p className="approval-card__outcome">
      {item.outcome}{item.outcome && item.decidedBy ? " · " : ""}{item.decidedBy && `Decidió ${item.decidedBy}`}
      {item.errorCode && ` · Código ${item.errorCode}`}
    </p>}
    {item.status === "pending" && <footer className="approval-card__actions">
      {lapsed && <p className="field-note">Pasó el plazo; ya no se puede aprobar.</p>}
      {!lapsed && canDecline && !item.actions.includes("approve") && <p className="field-note">Tu rol solo puede declinar esta propuesta.</p>}
      {item.actions.length === 0 && <p className="field-note">Tu rol no puede decidir esta propuesta.</p>}
      {decision?.error && <div className="form-error approval-card__error" role="alert">
        <span>{decision.error.message}</span>
        {decision.error.reload
          ? <Button compact icon={RotateCcw} onClick={onReload}>Volver a cargar</Button>
          : <Button compact onClick={() => onDecide(item, decision.intent.decision)}>Reintentar</Button>}
      </div>}
      {canDecline && <Button compact variant="danger" disabled={busy} aria-describedby={titleId} onClick={() => onDecide(item, "decline")}>
        {busy && decision?.intent.decision === "decline" ? "Declinando…" : "Declinar"}
      </Button>}
      {canApprove && <Button compact variant="primary" disabled={busy} aria-describedby={titleId} onClick={() => onDecide(item, "approve")}>
        {busy && decision?.intent.decision === "approve" ? "Aprobando…" : "Aprobar"}
      </Button>}
    </footer>}
  </article>;
}
