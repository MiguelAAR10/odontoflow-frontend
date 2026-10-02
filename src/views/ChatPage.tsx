"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, Bot, Clock3, EyeOff, Hand, Lock, MessageCircle, RotateCcw, Search, UserRoundCheck } from "lucide-react";
import {
  beginClaim,
  canClaimHandoffs,
  claimHandoff,
  CLINIC_TIME_ZONE,
  CONVERSATION_FILTERS,
  describeChatError,
  HANDOFF_FILTERS,
  loadConversations,
  loadHandoffs,
  loadThread,
  type ChatError,
  type ClaimIntent,
} from "../api";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { usePersona } from "../components/PersonaContext";
import { Tabs } from "../components/Tabs";
import type { ChatConversation, ChatThreadMessage, HandoffEntry, HandoffStatus } from "../types";

type ConversationStatus = NonNullable<(typeof CONVERSATION_FILTERS)[number]["status"]>;
type PanelView = "conversaciones" | "derivaciones";

/** A thread opens with up to this many pages (oldest first) so the newest
 * messages are on screen; longer threads offer "Ver mensajes más recientes". */
const THREAD_PAGES_ON_OPEN = 4;

interface ListState<T> {
  items: T[];
  nextCursor: string | null;
  loading: boolean;
  error: ChatError | null;
}

const emptyList = <T,>(): ListState<T> => ({ items: [], nextCursor: null, loading: true, error: null });

interface ClaimState {
  /** One key per click; retrying after an error reuses it. */
  intent: ClaimIntent;
  busy: boolean;
  error: ChatError | null;
}

/** Who is with the conversation right now, in words. A stale assignee left by
 * a hand-back is ignored: only a `human_handoff` conversation has a person. */
function attendant(conversation: ChatConversation): { icon: typeof Bot; label: string } {
  if (conversation.status === "closed") return { icon: Archive, label: "Conversación cerrada" };
  if (conversation.status === "human_handoff") {
    if (conversation.assignedTo) return { icon: UserRoundCheck, label: `La atiende ${conversation.assignedTo}` };
    return { icon: Hand, label: "Esperando a una persona del equipo" };
  }
  return { icon: Bot, label: conversation.status === "awaiting_confirmation" ? "El agente espera la confirmación de una cita" : "La atiende el agente automático" };
}

const dateTime = (iso: string) => new Intl.DateTimeFormat("es-PE", { timeZone: CLINIC_TIME_ZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

export function ChatPage() {
  const { identity, loading: identityLoading } = usePersona();
  const human = identity?.principalType === "human";
  const canClaim = canClaimHandoffs(identity);

  const [view, setView] = useState<PanelView>("conversaciones");
  const [status, setStatus] = useState<ConversationStatus | null>(null);
  const [query, setQuery] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [conversations, setConversations] = useState<ListState<ChatConversation>>(emptyList);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [queueStatus, setQueueStatus] = useState<HandoffStatus>("pending");
  const [queue, setQueue] = useState<ListState<HandoffEntry>>(emptyList);
  const [pendingCount, setPendingCount] = useState<{ count: number; more: boolean } | null>(null);
  const [claims, setClaims] = useState<Record<number, ClaimState>>({});
  const [notice, setNotice] = useState("");

  const reload = () => { setNotice(""); setReloadToken((value) => value + 1); };

  useEffect(() => {
    let active = true;
    setConversations(emptyList());
    loadConversations({ status })
      .then((page) => { if (active) setConversations({ items: page.items, nextCursor: page.nextCursor, loading: false, error: null }); })
      .catch((caught) => { if (active) setConversations({ items: [], nextCursor: null, loading: false, error: describeChatError(caught, "conversaciones") }); });
    return () => { active = false; };
  }, [status, reloadToken]);

  useEffect(() => {
    let active = true;
    setQueue(emptyList());
    loadHandoffs({ status: queueStatus })
      .then((page) => {
        if (!active) return;
        setQueue({ items: page.items, nextCursor: page.nextCursor, loading: false, error: null });
        if (queueStatus === "pending") setPendingCount({ count: page.items.length, more: Boolean(page.nextCursor) });
      })
      .catch((caught) => { if (active) setQueue({ items: [], nextCursor: null, loading: false, error: describeChatError(caught, "derivaciones") }); });
    return () => { active = false; };
  }, [queueStatus, reloadToken]);

  const loadMoreConversations = async () => {
    if (!conversations.nextCursor) return;
    setConversations((state) => ({ ...state, loading: true }));
    try {
      const page = await loadConversations({ status, cursor: conversations.nextCursor });
      setConversations((state) => {
        const seen = new Set(state.items.map((item) => item.id));
        return { items: [...state.items, ...page.items.filter((item) => !seen.has(item.id))], nextCursor: page.nextCursor, loading: false, error: null };
      });
    } catch (caught) {
      setConversations((state) => ({ ...state, loading: false, error: describeChatError(caught, "conversaciones") }));
    }
  };

  const loadMoreHandoffs = async () => {
    if (!queue.nextCursor) return;
    setQueue((state) => ({ ...state, loading: true }));
    try {
      const page = await loadHandoffs({ status: queueStatus, cursor: queue.nextCursor });
      setQueue((state) => ({ items: [...state.items, ...page.items], nextCursor: page.nextCursor, loading: false, error: null }));
    } catch (caught) {
      setQueue((state) => ({ ...state, loading: false, error: describeChatError(caught, "derivaciones") }));
    }
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? conversations.items.filter((item) => item.name.toLowerCase().includes(needle)) : conversations.items;
  }, [conversations.items, query]);

  const selected = conversations.items.find((item) => item.id === selectedId) ?? (selectedId === null ? visible[0] : undefined);

  const claim = async (handoffId: number) => {
    const previous = claims[handoffId];
    const intent = previous?.error ? previous.intent : beginClaim(handoffId);
    setClaims((state) => ({ ...state, [handoffId]: { intent, busy: true, error: null } }));
    setNotice("");
    try {
      const { handoff, replayed } = await claimHandoff(intent);
      setClaims((state) => ({ ...state, [handoffId]: { intent, busy: false, error: null } }));
      setQueue((state) => ({ ...state, items: state.items.map((item) => (item.id === handoff.id ? handoff : item)) }));
      setConversations((state) => ({
        ...state,
        items: state.items.map((item) => (item.id === handoff.conversationId
          ? { ...item, assignedTo: handoff.claimedBy ?? item.assignedTo, pendingHandoffId: handoff.status === "pending" ? item.pendingHandoffId : null }
          : item)),
      }));
      if (handoff.status === "pending") return;
      setPendingCount((count) => (count ? { ...count, count: Math.max(0, count.count - 1) } : count));
      setNotice(handoff.status === "claimed"
        ? `${replayed ? "Ya habías tomado" : "Tomaste"} la conversación con ${handoff.name}: quedó a tu nombre y el agente sigue en pausa con este contacto.`
        : `La derivación de ${handoff.name} ya se resolvió: la conversación volvió al agente.`);
    } catch (caught) {
      setClaims((state) => ({ ...state, [handoffId]: { intent, busy: false, error: describeChatError(caught, "tomar") } }));
    }
  };

  const openConversation = (conversationId: number) => {
    setSelectedId(conversationId);
    setView("conversaciones");
    if (!conversations.items.some((item) => item.id === conversationId)) {
      setStatus(null);
      setQuery("");
    }
  };

  const pendingLabel = pendingCount ? `Derivaciones (${pendingCount.count}${pendingCount.more ? "+" : ""})` : "Derivaciones";

  return (
    <section className="page chat-page">
      <div className="page-heading page-heading--with-actions">
        <div><h1>Centro de conversaciones</h1><p>Las conversaciones reales de la clínica con pacientes y leads</p></div>
        <span className="cash-authority-note"><Lock size={16} aria-hidden="true" />Solo lectura</span>
      </div>
      {!identityLoading && !human && <p className="approvals-notice" role="note">Para leer las conversaciones, elige quién eres en el menú de perfil, abajo a la izquierda.</p>}
      {notice && <p className="chat-assignment-notice chat-page__notice" role="status">{notice}</p>}
      <div className="chat-workspace">
        <aside className="conversation-panel" aria-label="Conversaciones y derivaciones">
          <div className="chat-panel-tabs">
            <Tabs ariaLabel="Ver conversaciones o derivaciones" value={view} onChange={(value) => setView(value as PanelView)} items={[{ id: "conversaciones", label: "Conversaciones" }, { id: "derivaciones", label: pendingLabel }]} />
          </div>

          {view === "conversaciones" ? <>
            <label className="search-control search-control--full chat-patient-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre" aria-label="Buscar por nombre en las conversaciones cargadas" /><Search size={18} aria-hidden="true" /></label>
            <div className="chat-filter-toolbar">
              <div className="chat-filters" role="group" aria-label="Filtrar por estado">{CONVERSATION_FILTERS.map((option) => <button type="button" key={option.label} aria-pressed={status === option.status} className={status === option.status ? "chat-filter--active" : ""} onClick={() => setStatus(option.status)}>{option.label}</button>)}</div>
            </div>
            <div className="conversation-list" aria-busy={conversations.loading}>
              {conversations.error && <ListError error={conversations.error} onReload={reload} />}
              {!conversations.error && !conversations.loading && visible.length === 0 && <p className="chat-filter-empty">{query.trim() ? "Ninguna conversación cargada coincide con ese nombre." : "No hay conversaciones con este estado."}</p>}
              {visible.map((conversation) => <button type="button" key={conversation.id} className={`conversation-item ${conversation.id === selected?.id ? "conversation-item--active" : ""}`} aria-current={conversation.id === selected?.id ? "true" : undefined} onClick={() => { setSelectedId(conversation.id); setNotice(""); }}>
                <span className={`avatar avatar--${conversation.tone}`} aria-hidden="true">{conversation.initials}</span>
                <span className="conversation-item__copy"><strong>{conversation.name}</strong><small className={conversation.previewUnavailable ? "conversation-item__preview--unavailable" : undefined}>{conversation.preview}</small><Badge tone={conversation.statusTone}>{conversation.statusLabel}</Badge></span>
                <span className="conversation-item__meta"><time dateTime={conversation.lastMessageAt}>{conversation.timeLabel}</time>{conversation.pendingHandoffId !== null && <b title="Esperando a una persona" aria-label="Esperando a una persona"><Hand size={13} aria-hidden="true" /></b>}</span>
              </button>)}
              {conversations.loading && <p className="chat-filter-empty" role="status">Cargando conversaciones…</p>}
              {!conversations.loading && conversations.nextCursor && <button type="button" className="chat-load-more" onClick={() => void loadMoreConversations()}>Cargar más conversaciones</button>}
            </div>
          </> : <>
            <div className="chat-filter-toolbar">
              <div className="chat-filters" role="group" aria-label="Filtrar derivaciones">{HANDOFF_FILTERS.map((option) => <button type="button" key={option.status} aria-pressed={queueStatus === option.status} className={queueStatus === option.status ? "chat-filter--active" : ""} onClick={() => setQueueStatus(option.status)}>{option.label}</button>)}</div>
            </div>
            <p className="handoff-queue__hint">Conversaciones que el agente pasó a una persona, de la más antigua a la más reciente.</p>
            <ul className="conversation-list handoff-queue" aria-busy={queue.loading}>
              {queue.error && <li><ListError error={queue.error} onReload={reload} /></li>}
              {!queue.error && !queue.loading && queue.items.length === 0 && <li className="chat-filter-empty">{queueStatus === "pending" ? "Nadie espera a una persona ahora mismo." : "No hay derivaciones en este estado."}</li>}
              {queue.items.map((handoff) => <HandoffCard key={handoff.id} handoff={handoff} claim={claims[handoff.id]} canClaim={canClaim} onClaim={() => void claim(handoff.id)} onOpen={() => openConversation(handoff.conversationId)} onReload={reload} />)}
              {queue.loading && <li className="chat-filter-empty" role="status">Cargando derivaciones…</li>}
              {!queue.loading && queue.nextCursor && <li><button type="button" className="chat-load-more" onClick={() => void loadMoreHandoffs()}>Cargar más derivaciones</button></li>}
            </ul>
          </>}
        </aside>

        {selected
          ? <ThreadPanel key={selected.id} conversation={selected} canClaim={canClaim} claim={selected.pendingHandoffId !== null ? claims[selected.pendingHandoffId] : undefined} onClaim={() => selected.pendingHandoffId !== null && void claim(selected.pendingHandoffId)} onReload={reload} />
          : <section className="message-panel empty-state">{conversations.loading ? "Cargando…" : "Selecciona una conversación"}</section>}

        <aside className="patient-panel">
          <h2>Datos de la conversación</h2>
          {selected && <ConversationFacts conversation={selected} />}
          <div className="chat-scope">
            <h3>Qué puedes hacer aquí</h3>
            <p>Leer cada conversación completa y tomar las que el agente derivó a una persona.</p>
            <p>Todavía no se puede responder al paciente ni devolver la conversación al agente desde esta pantalla.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}

function ListError({ error, onReload }: { error: ChatError; onReload: () => void }) {
  return <div className="chat-list-error" role="alert"><p>{error.message}</p>{error.reload && <Button compact icon={RotateCcw} onClick={onReload}>Volver a cargar</Button>}</div>;
}

function HandoffCard({ handoff, claim, canClaim, onClaim, onOpen, onReload }: { handoff: HandoffEntry; claim?: ClaimState; canClaim: boolean; onClaim: () => void; onOpen: () => void; onReload: () => void }) {
  return <li className="handoff-item">
    <div className="handoff-item__head"><strong>{handoff.name}</strong><Badge tone={handoff.statusTone}>{handoff.statusLabel}</Badge></div>
    <p className="handoff-item__reason">{handoff.reasonLabel}</p>
    <p className="handoff-item__summary">{handoff.reasonSummary}</p>
    <p className="handoff-item__meta"><Clock3 size={13} aria-hidden="true" /><time dateTime={handoff.createdAt}>Derivada {handoff.waitingLabel}</time>{handoff.claimedBy && <span>· La atiende {handoff.claimedBy}</span>}</p>
    <div className="handoff-item__actions">
      {handoff.status === "pending" && canClaim && <Button compact variant="primary" icon={Hand} disabled={claim?.busy} onClick={onClaim}>{claim?.busy ? "Tomando…" : claim?.error ? "Reintentar" : "Tomar"}</Button>}
      <Button compact icon={MessageCircle} onClick={onOpen}>Ver chat</Button>
    </div>
    {claim?.error && <div className="handoff-item__error" role="alert"><p>{claim.error.message}</p>{claim.error.reload && <Button compact icon={RotateCcw} onClick={onReload}>Volver a cargar</Button>}</div>}
  </li>;
}

function ThreadPanel({ conversation, canClaim, claim, onClaim, onReload }: { conversation: ChatConversation; canClaim: boolean; claim?: ClaimState; onClaim: () => void; onReload: () => void }) {
  const [messages, setMessages] = useState<ChatThreadMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ChatError | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const stickToEnd = useRef(true);

  const fetchPages = useCallback(async (cursor: string | null, pages: number) => {
    const collected: ChatThreadMessage[] = [];
    let next = cursor;
    for (let index = 0; index < pages; index += 1) {
      const page = await loadThread(conversation.id, { cursor: next });
      collected.push(...page.messages);
      next = page.nextCursor;
      if (!next) break;
    }
    return { collected, next };
  }, [conversation.id]);

  useEffect(() => {
    let active = true;
    stickToEnd.current = true;
    fetchPages(null, THREAD_PAGES_ON_OPEN)
      .then(({ collected, next }) => { if (active) { setMessages(collected); setNextCursor(next); setLoading(false); } })
      .catch((caught) => { if (active) { setError(describeChatError(caught, "mensajes")); setLoading(false); } });
    return () => { active = false; };
  }, [fetchPages, conversation.lastMessageAt]);

  useEffect(() => {
    if (!stickToEnd.current || !historyRef.current) return;
    historyRef.current.scrollTop = historyRef.current.scrollHeight;
  }, [messages]);

  const loadNewer = async () => {
    if (!nextCursor) return;
    setLoading(true);
    stickToEnd.current = false;
    try {
      const { collected, next } = await fetchPages(nextCursor, 1);
      setMessages((current) => [...current, ...collected]);
      setNextCursor(next);
    } catch (caught) {
      setError(describeChatError(caught, "mensajes"));
    } finally {
      setLoading(false);
    }
  };

  const who = attendant(conversation);
  const WhoIcon = who.icon;
  const waiting = conversation.status === "human_handoff" && conversation.pendingHandoffId !== null;

  return <section className="message-panel" aria-label={`Conversación con ${conversation.name}`}>
    <header className="message-header">
      <span className={`avatar avatar--${conversation.tone}`} aria-hidden="true">{conversation.initials}</span>
      <div><h2>{conversation.name}</h2><span>{conversation.maskedPhone ? "Contacto sin nombre registrado" : "WhatsApp"} <Badge tone={conversation.statusTone}>{conversation.statusLabel}</Badge></span></div>
    </header>
    <div className="agent-strip">
      <span><WhoIcon aria-hidden="true" /> {who.label}</span>
      {waiting && canClaim && <Button compact variant="primary" disabled={claim?.busy} onClick={onClaim}>{claim?.busy ? "Tomando…" : claim?.error ? "Reintentar" : "Tomar"}</Button>}
    </div>
    <div className="message-history" ref={historyRef} aria-busy={loading}>
      {claim?.error && <div className="chat-list-error" role="alert"><p>{claim.error.message}</p>{claim.error.reload && <Button compact icon={RotateCcw} onClick={onReload}>Volver a cargar</Button>}</div>}
      {error && <div className="chat-list-error" role="alert"><p>{error.message}</p>{error.reload && <Button compact icon={RotateCcw} onClick={onReload}>Volver a cargar</Button>}</div>}
      {!error && !loading && messages.length === 0 && <p className="chat-filter-empty">Esta conversación todavía no tiene mensajes.</p>}
      {messages.map((message, index) => <Fragment key={message.id}>
        {(index === 0 || messages[index - 1]!.dayLabel !== message.dayLabel) && <p className="message-day"><span>{message.dayLabel}</span></p>}
        <div className={`message-bubble message-bubble--${message.from === "patient" ? "patient" : "agent"}${message.unavailable ? " message-bubble--unavailable" : ""}`}>
          {message.text !== null ? <p>{message.text}</p> : <p><EyeOff size={14} aria-hidden="true" />{message.unavailableLabel}</p>}
          <time dateTime={message.occurredAt}>{message.timeLabel}</time>
          {message.from === "clinic" && <small className={message.deliveryFailed ? "message-bubble__delivery--failed" : undefined}>Clínica{message.deliveryLabel ? ` · ${message.deliveryLabel}` : ""}</small>}
        </div>
      </Fragment>)}
      {loading && <p className="chat-filter-empty" role="status">Cargando mensajes…</p>}
      {!loading && nextCursor && <button type="button" className="chat-load-more" onClick={() => void loadNewer()}>Ver mensajes más recientes</button>}
    </div>
    <p className="chat-readonly-note" role="note"><Lock size={16} aria-hidden="true" />Solo lectura: desde aquí aún no se puede responder ni devolver la conversación al agente.</p>
  </section>;
}

function ConversationFacts({ conversation }: { conversation: ChatConversation }) {
  const who = attendant(conversation);
  return <>
    <div className="patient-panel__hero"><span className={`avatar avatar--${conversation.tone}`} aria-hidden="true">{conversation.initials}</span><div><h3>{conversation.name}</h3><Badge tone={conversation.statusTone}>{conversation.statusLabel}</Badge></div></div>
    <dl className="patient-facts chat-facts">
      <div><dt>Quién atiende</dt><dd>{who.label}</dd></div>
      <div><dt>Último mensaje</dt><dd><time dateTime={conversation.lastMessageAt}>{dateTime(conversation.lastMessageAt)}</time></dd></div>
      <div><dt>Derivación</dt><dd>{conversation.pendingHandoffId !== null ? "Pendiente de tomar" : conversation.status === "human_handoff" && conversation.assignedTo ? "Tomada" : "Ninguna pendiente"}</dd></div>
      {conversation.maskedPhone && <div><dt>Contacto</dt><dd>Aún no es paciente ni lead registrado</dd></div>}
    </dl>
  </>;
}
