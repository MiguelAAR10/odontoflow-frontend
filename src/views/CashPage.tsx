"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  CalendarClock,
  Check,
  ChevronDown,
  Clock3,
  FilePlus2,
  Receipt,
  Search,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import {
  clinicToday,
  cashContextForLocation,
  closeFollowUpRecord,
  loadCashContext,
  loadCanonicalLocations,
  loadFollowUps,
  loadUnchargedExecutions,
  newIdempotencyKey,
  openFollowUpRecord,
  registerPayment,
  rescheduleFollowUpRecord,
  sumOutstanding,
  useMocks,
  toApiError,
  verifyPaymentRecord,
} from "../api";
import { useShellContext } from "../components/shell/ShellContext";
import { CardSchema, type Card as CardDto } from "../agui/card";
import { Card } from "../catalog/Card";
import { ApiError } from "../contracts/client";
import { preparePaymentVerificationReview } from "../paymentVerification";
import { createAgentStore, useAgentStore } from "../agui/store";
import { EventType } from "../agui/events";
import type { AgentSource } from "../agui/source";
import { Badge, statusTone } from "../components/Badge";
import { Button } from "../components/Button";
import { type Column, DataTable } from "../components/DataTable";
import { KpiCard } from "../components/KpiCard";
import { Modal } from "../components/Modal";
import { Tabs } from "../components/Tabs";
import { DIGITAL_METHODS, PAYMENT_METHOD_LABEL, isDigitalPaymentMethod } from "../ui";
import type { Charge, ChargeFollowUp, Payment, PaymentMethod, UnchargedExecution } from "../types";

type CashTab = "charges" | "uncharged" | "collections" | "reconciliation";
type PaymentMode = "full" | "partial" | "later";
type FollowUpAction = "open" | "reschedule" | "close";

const paymentMethods: PaymentMethod[] = ["efectivo", "tarjeta", "yape", "plin", "transferencia", "link_pago"];
const tabItems = [
  { id: "charges", label: "Cobros" },
  { id: "uncharged", label: "Por facturar" },
  { id: "collections", label: "Cobranza" },
  { id: "reconciliation", label: "Conciliación" },
];

const money = (value: number) => `S/ ${value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Display subtotals only. Paid/outstanding remain authoritative charge fields. */
export function cashPaymentTotals(charges: Pick<Charge, "payments">[]) {
  let verified = 0, pending = 0;
  for (const charge of charges) for (const payment of charge.payments) {
    if (payment.reversed) continue;
    const cents = Math.round(payment.amount * 100);
    if (payment.verificationStatus === "verified") verified += cents;
    else pending += cents;
  }
  return { verified: verified / 100, pending: pending / 100 };
}

type CashCut = { cut_at: string; sedes: { name: string; complete: boolean; exception: string;
  collected: { amount_cents: number }; pending_verification: { amount_cents: number } }[] };

/** Simulation-only projection over the immutable backend cut, once per card. */
export function projectCashCut(snapshot: CashCut, cards: CardDto[], locationName?: string) {
  const sedes = snapshot.sedes.filter(sede => !locationName || sede.name === locationName);
  let verified = sedes.reduce((sum, sede) => sum + sede.collected.amount_cents, 0);
  let pending = sedes.reduce((sum, sede) => sum + sede.pending_verification.amount_cents, 0);
  const applied = new Set<string>();
  for (const card of cards) {
    if (card.state !== "approved" || !card.delta || applied.has(card.id)) continue;
    if (!sedes.some(sede => sede.name === card.delta?.sede)) continue;
    applied.add(card.id);
    verified += card.delta.amount_cents;
    pending -= card.delta.amount_cents;
  }
  return { verified: verified / 100, pending: pending / 100 };
}

/** Cash fixture source composed with the common approval store/envelope. It is
 * loaded only by the mock seam; its lifetime is the client session, not a view. */
export async function createCashPreviewSession() {
  const [states, proposals, { envelopeFor }] = await Promise.all([
    import("../agui/sim/fixtures/state.json"), import("../agui/sim/fixtures/proposals.json"),
    import("../agui/sim/schema"),
  ]);
  const cards = proposals.default.filter(card => card.id === "p-yape" || card.id === "p-caja")
    .map(card => CardSchema.parse(card)).sort((a, b) => Number(b.id === "p-yape") - Number(a.id === "p-yape"));
  const confirmed = new Set<string>();
  const receipts = new Map<string, { fingerprint: string; card: CardDto }>();
  const approveCard = async (card: CardDto, key: string): Promise<CardDto> => {
    const fingerprint = JSON.stringify(CardSchema.parse(card));
    const receipt = receipts.get(key);
    if (key.trim() && receipt?.fingerprint === fingerprint) return structuredClone(receipt.card);
    const proposal = cards.find(item => item.id === card.id);
    if (!key.trim() || receipt || !proposal || confirmed.has(card.id)
      || JSON.stringify(proposal) !== fingerprint) {
      throw new ApiError(409, "PROPOSAL_CONFLICT", "La propuesta cambió o la clave pertenece a otro intento. Revisa la tarjeta antes de aprobar.");
    }
    const response: CardDto = { ...proposal, state: "approved" };
    confirmed.add(card.id);
    receipts.set(key, { fingerprint, card: structuredClone(response) });
    return structuredClone(response);
  };
  const source: AgentSource = {
    async run(input, emit) {
      emit({ type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId });
      emit({ type: EventType.RUN_FINISHED, threadId: input.threadId, runId: input.runId,
        outcome: { type: "interrupt", interrupts: cards.map(card => ({ id: card.id,
          reason: "Decisión humana pendiente", metadata: { card, approval: envelopeFor(card) } })) } });
    },
    stop() {},
  };
  const store = createAgentStore({ source, approveCard, toApiError, newIdempotencyKey });
  await store.send("Corte de caja");
  return { snapshot: states.default[0]!, store, source, approveCard };
}
type CashPreviewSession = Awaited<ReturnType<typeof createCashPreviewSession>>;
let cashPreviewSession: Promise<CashPreviewSession> | undefined;
function getCashPreviewSession() {
  cashPreviewSession ??= createCashPreviewSession().catch(error => { cashPreviewSession = undefined; throw error; });
  return cashPreviewSession;
}

function SimulatedCashCut({ locationName }: { locationName?: string }) {
  const [session, setSession] = useState<CashPreviewSession | null>(null);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    let active = true;
    void getCashPreviewSession().then(value => { if (active) setSession(value); })
      .catch(caught => { if (active) setFailure(toApiError(caught).message); });
    return () => { active = false; };
  }, []);
  if (failure) return <p role="alert">{failure}</p>;
  if (!session) return <p role="status">Cargando corte de caja…</p>;
  return <CashCutProjection session={session} locationName={locationName} />;
}

function CashCutProjection({ session, locationName }: { session: CashPreviewSession; locationName?: string }) {
  const entries = useAgentStore(state => state.cards, session.store);
  const preview = { snapshot: session.snapshot, cards: Object.values(entries).map(entry => entry.card) };
  const totals = projectCashCut(preview.snapshot, preview.cards, locationName);
  const sedes = preview.snapshot.sedes.filter(sede => !locationName || sede.name === locationName);
  if (!sedes.length) return <p role="status">No hay un corte disponible para esta sede.</p>;
  const cashAmounts = locationName && locationName !== "Lince" ? [] : preview.cards.find(card => card.id === "p-caja")?.amounts?.filter(amount => amount.label !== "Contado por Caja (13:30)") ?? [];
  return <section className="cash-cut" aria-label="Corte simulado de caja">
    <p className="cash-cut-caption">Corte simulado · {formatInstant(preview.snapshot.cut_at)} · {locationName ?? `${sedes.length} sedes`}{sedes.some(sede => !sede.complete) ? " · parcial" : ""}</p>
    <p>El cobrado verificado se separa de lo registrado y pendiente. Yape y Plin se cotejan contra la cuenta receptora; la captura sola no basta.</p>
    <div className="cash-cut-figures" aria-live="polite">
      <div><strong data-cash-verified>{money(totals.verified)}</strong><span>Cobrado (verificado)</span></div>
      <div><strong data-cash-pending>{money(totals.pending)}</strong><span>Por verificar</span></div>
      {cashAmounts.map(amount => <div key={amount.label}><strong>{money(amount.amount_cents / 100)}</strong><span>{amount.label} · Lince</span></div>)}
    </div>
    <p className="cash-cut-caption">{sedes.filter(sede => !sede.complete).map(sede => `${sede.name}: ${sede.exception}. `).join("")}</p>
    <div className="cash-cut-decisions airi-catalog">{preview.cards.filter(card => !locationName || card.delta?.sede === locationName || (card.id === "p-caja" && locationName === "Lince")).map(card => {
      const decision = <Card card={card.id === "p-caja" && card.state === "approved" ? { ...card, state: "delegated" } : card}
        status={entries[card.id]?.status} error={entries[card.id]?.error}
        loadingReason={entries[card.id]?.loadingReason} onApprove={() => session.store.approve(card.id)} />;
      return card.id === "p-caja" ? <details key={card.id}><summary>Diferencia por explicar</summary>{decision}</details>
        : <section key={card.id}><h2>Por verificar</h2>{decision}</section>;
    })}</div>
  </section>;
}

function formatInstant(iso: string, timeZone = "America/Lima"): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone })} · ${date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone })}`;
}

function formatCalendarDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  return parsed.toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function methodTone(method: PaymentMethod): "green" | "blue" | "purple" | "amber" {
  if (method === "efectivo") return "green";
  if (method === "tarjeta" || method === "transferencia") return "blue";
  if (method === "link_pago") return "amber";
  return "purple";
}

function paymentState(payment: Payment): string {
  if (payment.verificationStatus === "verified") return "Verificado";
  if (isDigitalPaymentMethod(payment.method) && !payment.reference) return "Sin código de operación · registro anterior";
  return "Sin verificar";
}

function renderPaymentHistory(payments: Payment[], timeZone?: string) {
  if (!payments.length) return <p className="empty-state">Sin pagos registrados.</p>;
  return <ul className="payment-list">
    {payments.map((payment) => <li key={payment.id}>
      <span>
        <Badge tone={methodTone(payment.method)}>{PAYMENT_METHOD_LABEL[payment.method]}</Badge>
        <small>{formatInstant(payment.paidAt, timeZone)}</small>
        {payment.reference ? <small>Ref. {payment.reference}</small> : isDigitalPaymentMethod(payment.method) ? <small>Sin código de operación · registro anterior</small> : null}
      </span>
      <strong>{money(payment.amount)}</strong>
      <small className="payment-list__status">{paymentState(payment)}</small>
    </li>)}
  </ul>;
}

type MutationIntent = { signature: string; key: string };

function intentKey(ref: { current: MutationIntent | null }, signature: string): string {
  if (ref.current?.signature !== signature) {
    ref.current = { signature, key: newIdempotencyKey() };
  }
  return ref.current.key;
}

type CashFocus = { focusedPaymentId?: string; initialLocationId?: string };

export function CashPage(focus: CashFocus = {}) {
  return useMocks ? <CashPreviewPage /> : <CashManagement {...focus} />;
}

function CashPreviewPage() {
  const { role, locationId } = useShellContext();
  const [locations, setLocations] = useState<{ id: number; name: string }[]>([]);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let active = true;
    void loadCanonicalLocations().then(rows => { if (active) setLocations(rows); })
      .catch(caught => { if (active) setError(toApiError(caught).message); });
    return () => { active = false; };
  }, []);
  const locationName = locationId ? locations.find(row => String(row.id) === locationId)?.name : role === "admin" ? "Lince" : undefined;
  return <section className="page cash-preview">
    <div className="page-heading"><h1>Caja</h1><p>{locationName ?? (locationId ? "Cargando sede…" : "Todas las sedes")}</p></div>
    {error ? <p role="alert">{error}</p> : locationId && !locationName ? <p role="status">Cargando corte…</p> : <SimulatedCashCut locationName={locationName} />}
    <details onToggle={event => setExpanded(event.currentTarget.open)}><summary>Registros de caja</summary>{expanded ? <CashManagement /> : null}</details>
    <style>{`
      .cash-preview .cash-cut{margin-bottom:28px}.cash-preview .cash-cut>p{max-width:78ch;line-height:1.6;color:var(--ink-2);font-size:14px}
      .cash-preview .cash-cut-caption{font-size:13px;color:var(--muted)}
      .cash-preview .cash-cut-figures{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px;margin:24px 0 28px}
      .cash-preview .cash-cut-figures>div{display:grid;gap:6px;min-width:0}.cash-preview .cash-cut-figures strong{font:600 32px/1.2 var(--font-display);font-variant-numeric:tabular-nums}
      .cash-preview [data-cash-verified]{color:var(--green-ink)}.cash-preview .cash-cut-figures span{font-size:13px;color:var(--muted)}
      .cash-preview .cash-cut-decisions{max-width:720px}.cash-preview .cash-cut-decisions h2{font-size:18px;margin:28px 0 12px}
      .cash-preview summary{cursor:pointer;min-height:44px;padding-block:12px;color:var(--ink-2);font-size:14px}.cash-preview summary:focus-visible{outline:2px solid var(--focus);outline-offset:3px}
      @media(max-width:900px){.cash-preview .cash-cut-figures{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:520px){.cash-preview .cash-cut-figures{gap:20px 12px}.cash-preview .cash-cut-figures strong{font-size:26px}}
    `}</style>
  </section>;
}

function CashManagement({ focusedPaymentId, initialLocationId }: CashFocus = {}) {
  const { locationId, setLocationId } = useShellContext();
  const [tab, setTab] = useState<CashTab>(focusedPaymentId ? "reconciliation" : "charges");
  const [loadedCharges, setCharges] = useState<Charge[]>([]);
  const [uncharged, setUncharged] = useState<UnchargedExecution[]>([]);
  const [followUps, setFollowUps] = useState<ChargeFollowUp[]>([]);
  const [loadedReconciliation, setReconciliation] = useState<Payment[]>([]);
  const { charges, reconciliation } = useMemo(() => cashContextForLocation({
    charges: loadedCharges, reconciliation: loadedReconciliation,
  }, locationId), [loadedCharges, loadedReconciliation, locationId]);
  useEffect(() => {
    if (initialLocationId !== undefined) setLocationId(initialLocationId);
  }, [initialLocationId, setLocationId]);
  useEffect(() => { setVerifyTarget(null); setSelected(null); }, [locationId]);
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState<PaymentMethod | "Todos">("Todos");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Charge | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("full");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("efectivo");
  const [reference, setReference] = useState("");
  const [receiver, setReceiver] = useState("");
  const [reconciliationNote, setReconciliationNote] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [followUpAction, setFollowUpAction] = useState<FollowUpAction | null>(null);
  const [selectedFollowUp, setSelectedFollowUp] = useState<ChargeFollowUp | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const paymentIntent = useRef<MutationIntent | null>(null);
  const followUpIntent = useRef<MutationIntent | null>(null);
  const verificationIntent = useRef<MutationIntent | null>(null);
  const reviewIntents = useRef(new Map<string, { key: string; pending: boolean }>());
  const [preparingReviews, setPreparingReviews] = useState<string[]>([]);
  const [success, setSuccess] = useState("");
  const [payError, setPayError] = useState("");
  const [verifyTarget, setVerifyTarget] = useState<Payment | null>(null);
  const [verifyNote, setVerifyNote] = useState("");
  const cashLoaded = useRef(false);
  const cashRequest = useRef<ReturnType<typeof loadCashContext> | null>(null);

  const refreshCash = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const context = await (cashRequest.current ??= loadCashContext());
      cashLoaded.current = true;
      setCharges(context.charges);
      setReconciliation(context.reconciliation);
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      cashRequest.current = null;
      setLoading(false);
    }
  }, []);

  const refreshTab = useCallback(async (nextTab: CashTab) => {
    if (nextTab === "charges" || nextTab === "reconciliation") {
      await refreshCash();
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (nextTab === "uncharged") {
        setUncharged(await loadUnchargedExecutions());
      } else {
        setFollowUps(await loadFollowUps({ active: true }));
      }
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      setLoading(false);
    }
  }, [refreshCash]);

  useEffect(() => {
    if (tab === "charges" || tab === "reconciliation") {
      if (!cashLoaded.current) void refreshCash();
    } else void refreshTab(tab);
  }, [refreshCash, refreshTab, tab]);

  const visibleCharges = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return charges.filter((charge) => {
      const searchable = [
        charge.patientName,
        charge.serviceName,
        charge.locationName,
        charge.practitionerName,
        charge.id,
        String(charge.serviceExecutionId),
      ].join(" ").toLowerCase();
      const methods = charge.payments.map((payment) => payment.method);
      return (!normalized || searchable.includes(normalized)) && (method === "Todos" || methods.includes(method));
    });
  }, [charges, method, query]);

  const openCharge = (charge: Charge, nextMode: PaymentMode = "full") => {
    paymentIntent.current = null;
    setSelected(charge);
    setPaymentMode(nextMode);
    setAmount(nextMode === "full" ? String(charge.outstanding) : "");
    setPaymentMethod("efectivo");
    setReference("");
    setReceiver("");
    setReconciliationNote("");
    setPayError("");
    setSuccess("");
  };

  const submitPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current || !selected || paymentMode === "later") return;
    const payload = {
      amount: Number(amount),
      method: paymentMethod,
      ...(reference.trim() ? { reference: reference.trim() } : {}),
      ...(receiver.trim() ? { receiver: receiver.trim() } : {}),
      ...(reconciliationNote.trim() ? { reconciliation_note: reconciliationNote.trim() } : {}),
    };
    submitting.current = true;
    setBusy(true);
    setPayError("");
    try {
      await registerPayment(selected.id, payload, intentKey(paymentIntent, JSON.stringify([selected.id, payload])));
      setSuccess("Pago registrado. La confirmación bancaria sigue pendiente cuando corresponda.");
      const { charges: nextCharges, reconciliation: nextReconciliation } = await loadCashContext();
      setCharges(nextCharges);
      setReconciliation(nextReconciliation);
      const next = nextCharges.find((charge) => charge.id === selected.id);
      if (next) setSelected(next);
      setAmount(next && paymentMode === "full" ? String(next.outstanding) : "");
      // Retain the receipt if refreshing fails after the mutation succeeded.
      paymentIntent.current = null;
    } catch (caught) {
      setPayError(toApiError(caught).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const openFollowUpModal = (charge: Charge, action: FollowUpAction = "open", existing?: ChargeFollowUp) => {
    setSelected(charge);
    followUpIntent.current = null;
    setSelectedFollowUp(existing ?? null);
    setFollowUpAction(action);
    setFollowUpDate(existing?.nextFollowUpOn ?? clinicToday(charge.locationTimeZone));
    setFollowUpNote(existing?.note ?? "");
    setPayError("");
  };

  const submitFollowUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current || !selected || !followUpAction) return;
    if (followUpAction !== "open" && !selectedFollowUp) return;
    const payload = {
      ...(followUpAction !== "close" ? { next_follow_up_on: followUpDate } : {}),
      ...(followUpNote.trim() ? { note: followUpNote.trim() } : {}),
    };
    submitting.current = true;
    setBusy(true);
    setPayError("");
    try {
      const key = intentKey(followUpIntent, JSON.stringify([selected.id, followUpAction, selectedFollowUp?.id, payload]));
      if (followUpAction === "open") {
        await openFollowUpRecord(selected.id, {
          next_follow_up_on: followUpDate,
          ...(followUpNote.trim() ? { note: followUpNote.trim() } : {}),
        }, key);
      } else if (followUpAction === "reschedule" && selectedFollowUp) {
        await rescheduleFollowUpRecord(selectedFollowUp.id, {
          next_follow_up_on: followUpDate,
          ...(followUpNote.trim() ? { note: followUpNote.trim() } : {}),
        }, key);
      } else if (followUpAction === "close" && selectedFollowUp) {
        await closeFollowUpRecord(selectedFollowUp.id, { ...(followUpNote.trim() ? { note: followUpNote.trim() } : {}) }, key);
      }
      followUpIntent.current = null;
      setFollowUpAction(null);
      setSelectedFollowUp(null);
      const [context, nextFollowUps] = await Promise.all([loadCashContext(), loadFollowUps({ active: true })]);
      setCharges(context.charges);
      setReconciliation(context.reconciliation);
      setFollowUps(nextFollowUps);
      setSuccess(followUpAction === "close" ? "Seguimiento cerrado; el saldo permanece pendiente." : "Seguimiento guardado.");
    } catch (caught) {
      setPayError(toApiError(caught).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const submitVerification = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current || !verifyTarget?.reference) return;
    const payload = { ...(verifyNote.trim() ? { reconciliation_note: verifyNote.trim() } : {}) };
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const saved = await verifyPaymentRecord(verifyTarget.id, payload, intentKey(verificationIntent, JSON.stringify([verifyTarget.id, payload])));
      setReconciliation((current) => current.filter((payment) => payment.id !== saved.id));
      setCharges(current => current.map(charge => ({ ...charge,
        payments: charge.payments.map(payment => payment.id === saved.id ? saved : payment),
      })));
      verificationIntent.current = null;
      setVerifyTarget(null);
      setVerifyNote("");
      setSuccess("Pago marcado como verificado.");
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const prepareReview = async (payment: Payment) => {
    if (!payment.reference) return;
    const intent = reviewIntents.current.get(payment.id) ?? { key: newIdempotencyKey(), pending: false };
    if (intent.pending) return;
    intent.pending = true;
    reviewIntents.current.set(payment.id, intent);
    setPreparingReviews(current => [...current, payment.id]);
    setError("");
    try {
      const receipt = await preparePaymentVerificationReview(Number(payment.id), intent.key);
      window.location.assign(`/aprobaciones?proposal=agent_proposal:${receipt.proposal.id}&payment=${payment.id}&location=${locationId}`);
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      intent.pending = false;
      setPreparingReviews(current => current.filter(id => id !== payment.id));
    }
  };

  const collectionsRows = useMemo(() => followUps.map((followUp) => {
    const charge = charges.find((item) => item.id === String(followUp.chargeId));
    return { ...followUp, practitionerId: charge?.practitionerId, practitionerName: charge?.practitionerName };
  }), [charges, followUps]);

  const chargeColumns: Column<Charge>[] = [
    { key: "patient", header: "Paciente", width: "19%", render: (charge) => <span className="person-cell"><span><strong>{charge.patientName}</strong><small>{charge.serviceName} · Cargo #{charge.id}</small></span></span> },
    { key: "context", header: "Atención", render: (charge) => <span className="table-context"><strong>{charge.locationName}</strong><small>{charge.practitionerName}</small></span> },
    { key: "executed", header: "Atendida", render: (charge) => formatInstant(charge.executedAt, charge.locationTimeZone) },
    { key: "amount", header: "Monto", render: (charge) => money(charge.amount) },
    { key: "paid", header: "Pagado", render: (charge) => money(charge.paid) },
    { key: "outstanding", header: "Saldo", render: (charge) => <strong className="numeric-emphasis">{money(charge.outstanding)}</strong> },
    { key: "methods", header: "Medios", render: (charge) => charge.payments.length ? <span className="badge-stack">{[...new Set(charge.payments.map((payment) => payment.method))].map((item) => <Badge key={item} tone={methodTone(item)}>{PAYMENT_METHOD_LABEL[item]}</Badge>)}</span> : <span className="text-muted">—</span> },
    { key: "status", header: "Estado", render: (charge) => <span className="table-context"><Badge tone={statusTone(charge.status)}>{charge.status}</Badge>{charge.payments.some(payment => payment.method !== "efectivo" && !payment.reversed && payment.verificationStatus !== "verified" && !payment.reference?.trim()) && <small className="cash-missing-reference">Falta código de operación; pide corregir el registro para cotejar el pago.</small>}</span> },
    { key: "actions", header: "", render: (charge) => <span className="row-actions"><Button compact variant="primary" onClick={() => openCharge(charge)} disabled={charge.outstanding <= 0}>Cobrar</Button>{charge.outstanding > 0 && <Button compact onClick={() => openFollowUpModal(charge)}>Seguimiento</Button>}</span> },
  ];

  const unchargedColumns: Column<UnchargedExecution>[] = [
    { key: "patient", header: "Paciente", width: "22%", render: (execution) => <span className="person-cell"><span><strong>{execution.patientName}</strong><small>{execution.serviceName}</small></span></span> },
    { key: "location", header: "Sede", render: (execution) => execution.locationName ?? `Sede #${execution.locationId}` },
    { key: "date", header: "Atendida", render: (execution) => formatInstant(execution.executedAt) },
    { key: "price", header: "Precio ejecutado", render: (execution) => money(execution.executedPrice) },
    { key: "actions", header: "", render: () => <span className="text-muted"><FilePlus2 size={18} aria-hidden="true" /> Cargo pendiente de emitir</span> },
  ];

  const collectionColumns: Column<typeof collectionsRows[number]>[] = [
    { key: "patient", header: "Paciente", width: "18%", render: (row) => <span className="person-cell"><span><strong>{row.patientName}</strong><small>{row.serviceName}</small></span></span> },
    { key: "context", header: "Atención", render: (row) => <span className="table-context"><strong>{row.locationName}</strong><small>{row.practitionerName ?? "Odontólogo no proyectado"}</small></span> },
    { key: "amount", header: "Monto / saldo", render: (row) => <span className="table-context"><strong>{money(row.chargeAmount)}</strong><small>Saldo {money(row.chargeOutstanding)}</small></span> },
    { key: "promise", header: "Próximo contacto", render: (row) => <span className="table-context"><strong>{formatCalendarDate(row.nextFollowUpOn)}</strong><small>{row.note ?? "Sin nota"}</small></span> },
    { key: "history", header: "Historial", render: (row) => { const charge = charges.find((item) => item.id === String(row.chargeId)); return charge ? <span className="badge-stack">{charge.payments.map((payment) => <Badge key={payment.id} tone={methodTone(payment.method)}>{PAYMENT_METHOD_LABEL[payment.method]} · {money(payment.amount)}</Badge>)}</span> : <span className="text-muted">Sin pagos</span>; } },
    { key: "actions", header: "", render: (row) => { const charge = charges.find((item) => item.id === String(row.chargeId)); return <span className="row-actions">{charge && <Button compact variant="primary" onClick={() => openCharge(charge)}>Cobrar</Button>}<Button compact onClick={() => charge && openFollowUpModal(charge, "reschedule", row)}>Reprogramar</Button><Button compact variant="danger" onClick={() => charge && openFollowUpModal(charge, "close", row)}>Cerrar</Button></span>; } },
  ];

  const reconciliationColumns: Column<Payment>[] = [
    { key: "payment", header: "Pago", width: "20%", render: (payment) => <span className="person-cell" data-focused-payment={payment.id === focusedPaymentId ? "true" : undefined}><span><strong>{PAYMENT_METHOD_LABEL[payment.method]}</strong><small>{payment.reference ?? "Sin código de operación · registro anterior"}</small>{payment.id === focusedPaymentId && <small>Pago seleccionado</small>}</span></span> },
    { key: "charge", header: "Cargo", render: (payment) => { const charge = charges.find((item) => item.id === String(payment.chargeId)); return charge ? <span className="table-context"><strong>{charge.patientName}</strong><small>{charge.serviceName} · #{charge.id}</small></span> : `#${payment.chargeId ?? "—"}`; } },
    { key: "receiver", header: "Receptor", render: (payment) => payment.receiver ?? "—" },
    { key: "date", header: "Registrado", render: (payment) => formatInstant(payment.paidAt) },
    { key: "amount", header: "Monto", render: (payment) => money(payment.amount) },
    { key: "state", header: "Estado", render: (payment) => <Badge tone={payment.verificationStatus === "verified" ? "green" : "amber"}>{paymentState(payment)}</Badge> },
    { key: "actions", header: "", render: (payment) => payment.verificationStatus === "verified" ? <span>Verificación registrada</span> : payment.reference ? <span className="row-actions">
      <Button compact variant="primary" icon={ShieldCheck} disabled={preparingReviews.includes(payment.id)} onClick={() => { verificationIntent.current = null; setVerifyTarget(payment); setVerifyNote(""); }}>Verificar</Button>
      <Button compact disabled={busy || preparingReviews.includes(payment.id)} onClick={() => prepareReview(payment)}>{preparingReviews.includes(payment.id) ? "Preparando…" : "Preparar revisión"}</Button>
    </span> : <span className="text-muted">Falta código de operación; pide corregir el registro para cotejar el pago.</span> },
  ];

  const focusedPayment = focusedPaymentId ? charges.flatMap(charge => charge.payments).find(payment => payment.id === focusedPaymentId) : undefined;
  const reconciliationRows = focusedPayment
    ? [focusedPayment, ...reconciliation.filter(payment => payment.id !== focusedPayment.id)] : reconciliation;

  const paymentTotals = cashPaymentTotals(charges);

  const heading = tab === "charges" ? ["Caja", "Cargos por servicios y pagos registrados"] : tab === "uncharged" ? ["Por facturar", "Atenciones ejecutadas sin cargo asociado"] : tab === "collections" ? ["Cobranza", "Seguimientos activos ordenados por el servidor"] : ["Conciliación", "Pagos digitales pendientes de verificación"];

  return <section className="page cash-page">
    <div className="page-heading page-heading--with-actions"><div><h1>{heading[0]}</h1><p>{heading[1]}</p></div><span className="cash-authority-note"><WalletCards size={17} aria-hidden="true" /> Saldos y estados vienen del backend</span></div>
    <Tabs items={tabItems} value={tab} onChange={(value) => { setTab(value as CashTab); setError(""); setSuccess(""); }} ariaLabel="Espacios de caja" panelId="cash-panel" />

    {tab === "charges" && <div className="kpi-grid cash-kpis"><KpiCard icon={ArrowUpRight} value={loading ? "—" : money(paymentTotals.verified)} label="Cobrado (verificado) · cargos cargados" tone="green" /><KpiCard icon={ShieldCheck} value={loading ? "—" : money(paymentTotals.pending)} label="Por verificar · cargos cargados" tone="amber" /><KpiCard icon={Clock3} value={money(sumOutstanding(charges))} label="Saldo en filas cargadas" tone="amber" /><KpiCard icon={Receipt} value={charges.length} label="Cargos cargados" tone="cyan" /></div>}
    {success && <div className="success-banner" role="status"><Check size={18} aria-hidden="true" />{success}</div>}
    {error && <div className="form-error" role="alert">{error}<Button compact onClick={() => void refreshTab(tab)}>Reintentar</Button></div>}

    <section className="panel table-panel table-panel--flush" id="cash-panel" aria-live="polite">
      {tab === "charges" && <>
        <div className="table-toolbar cash-toolbar"><label className="search-control"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar paciente, servicio o sede" aria-label="Buscar cargo" /></label><label className="select-control"><select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod | "Todos")} aria-label="Filtrar por medio de pago"><option value="Todos">Todos los medios</option>{paymentMethods.map((item) => <option key={item} value={item}>{PAYMENT_METHOD_LABEL[item]}</option>)}</select><ChevronDown size={16} /></label><span className="result-count">{visibleCharges.length} cargos</span></div>
        {loading ? <div className="table-loading" role="status">Cargando cobros…</div> : <DataTable columns={chargeColumns} rows={visibleCharges} rowKey={(charge) => charge.id} emptyMessage="No hay cargos registrados" />}
      </>}
      {tab === "uncharged" && <>
        <div className="table-toolbar cash-toolbar"><span className="toolbar-leading"><FilePlus2 size={18} /> Solo ejecuciones con <strong>charged=false</strong></span><span className="toolbar-total">Σ precio ejecutado: <strong>{money(uncharged.reduce((total, execution) => total + execution.executedPrice, 0))}</strong></span><span className="result-count">{uncharged.length} atenciones</span></div>
        {loading ? <div className="table-loading" role="status">Cargando atenciones…</div> : <DataTable columns={unchargedColumns} rows={uncharged} rowKey={(execution) => execution.id} emptyMessage="No hay atenciones por facturar" />}
      </>}
      {tab === "collections" && <>
        <div className="table-toolbar cash-toolbar"><span className="toolbar-leading"><CalendarClock size={18} /> Casos abiertos con saldo pendiente</span><Button compact onClick={() => void refreshTab("collections")}>Actualizar</Button><span className="result-count">{collectionsRows.length} casos</span></div>
        {loading ? <div className="table-loading" role="status">Cargando cobranza…</div> : <DataTable columns={collectionColumns} rows={collectionsRows} rowKey={(row) => row.id} emptyMessage="No hay seguimientos activos" />}
      </>}
      {tab === "reconciliation" && <>
        <div className="table-toolbar cash-toolbar"><span className="toolbar-leading"><ShieldCheck size={18} /> Yape, Plin y transferencia por verificar</span><span className="result-count">{reconciliation.length} pagos pendientes</span></div>
        {!loading && focusedPaymentId && <p className="cash-focus-status" role="status">{focusedPayment ? `Pago seleccionado · ${focusedPayment.reference ?? focusedPayment.id} · ${paymentState(focusedPayment)}` : "El pago seleccionado no está disponible en esta sede o con tus permisos."}</p>}
        {loading ? <div className="table-loading" role="status">Cargando conciliación…</div> : <DataTable className="reconciliation-table" columns={reconciliationColumns} rows={reconciliationRows} rowKey={(payment) => payment.id} emptyMessage="No hay pagos digitales pendientes" />}
      </>}
      <div className="pagination"><span>{tab === "charges" ? `${visibleCharges.length} cargos registrados` : tab === "uncharged" ? `${uncharged.length} atenciones` : tab === "collections" ? `${collectionsRows.length} seguimientos activos` : `${reconciliation.length} pagos pendientes`}</span><div /><span className="text-muted">Vista completa</span></div>
    </section>

    <style>{`
      .cash-page { font-variant-numeric: tabular-nums; }
      .cash-missing-reference{max-width:28ch;white-space:normal;line-height:1.5}
      .cash-focus-status{padding:0 16px;color:var(--ink-2);font-size:14px}
      .reconciliation-table tr:has([data-focused-payment=true]){background:var(--blue-soft);outline:2px solid var(--focus);outline-offset:-2px}
      .cash-page .kpi-card{min-width:0;padding:16px;gap:10px}.cash-page .kpi-card__icon{flex:none;width:38px;height:38px}.cash-page .kpi-card__copy{min-width:0}.cash-page .kpi-card__copy strong{font-size:clamp(20px,1.8vw,28px);overflow-wrap:anywhere}.cash-page .kpi-card__copy small{overflow-wrap:anywhere}
      .cash-page .kpi-card__copy strong, .cash-page td, .cash-page .payment-list strong,
      .cash-page .numeric-emphasis, .cash-page .detail-list strong, .cash-page .charge-context strong {
        font-variant-numeric: tabular-nums;
      }
      .cash-page td:nth-child(4), .cash-page td:nth-child(5), .cash-page td:nth-child(6),
      .cash-page .payment-list strong, .cash-page .detail-list strong { font-family: var(--font-display); }
      .cash-page .cash-kpis { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .cash-cut { margin-bottom: 32px; }
      .cash-cut > p { max-width: 78ch; line-height: 1.6; }
      .cash-cut-caption { color: var(--text-muted); font-size: 13px; }
      .cash-cut-figures { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 28px 24px; margin: 24px 0 16px; }
      .cash-cut-figures > div { display: grid; gap: 6px; }
      .cash-cut-figures strong { font: 600 36px/1.15 var(--font-display); font-variant-numeric: tabular-nums; }
      .cash-cut-figures [data-cash-verified] { color: var(--green-ink); }
      .cash-cut-figures span { color: var(--text-muted); font-size: 14px; }
      .cash-cut-decisions { display: grid; gap: 24px; max-width: 720px; margin-top: 28px; }
      .cash-cut-decisions h2 { margin: 0 0 12px; font-size: 18px; }
      @media (max-width: 900px) { .cash-page .cash-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 520px) {
        .cash-page .reconciliation-table .data-table{display:block;min-width:0}
        .reconciliation-table thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
        .reconciliation-table tbody{display:block}
        .reconciliation-table tr{display:grid;grid-template-columns:minmax(0,1fr);padding:12px 0;border-top:1px solid var(--line)}
        .cash-page .reconciliation-table td{display:flex;align-items:start;gap:12px;min-width:0;height:auto;border:0;padding:6px 16px;white-space:normal;overflow-wrap:anywhere;font-family:var(--font-text)}
        .reconciliation-table td:before{flex:0 0 70px;color:var(--muted);font-size:12px}
        .reconciliation-table td:nth-child(1):before{content:"Pago"}.reconciliation-table td:nth-child(2):before{content:"Cargo"}.reconciliation-table td:nth-child(3):before{content:"Receptor"}.reconciliation-table td:nth-child(4):before{content:"Registrado"}.reconciliation-table td:nth-child(5):before{content:"Monto"}.reconciliation-table td:nth-child(6):before{content:"Estado"}
        .reconciliation-table .person-cell,.reconciliation-table .table-context{min-width:0}
        .reconciliation-table .row-actions{flex-wrap:wrap;width:100%}.reconciliation-table .button{min-height:44px}
        .cash-page .cash-kpis { grid-template-columns: 1fr; }
        .cash-cut-figures { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px 12px; }
        .cash-cut-figures strong { font-size: 26px; }
        .cash-page .cash-toolbar .search-control { min-width: 0; }
        .cash-cut-decisions .catalog-actions { flex-wrap: wrap; }
      }
    `}</style>
    <Modal title={selected ? `Cobrar cargo #${selected.id}` : "Cobro"} open={Boolean(selected) && !followUpAction} onClose={() => !busy && setSelected(null)} size="large">
      {selected && <div className="cash-modal">
        <div className="charge-context"><div><span>Paciente</span><strong>{selected.patientName}</strong><small>{selected.serviceName}</small></div><div><span>Sede · odontólogo</span><strong>{selected.locationName}</strong><small>{selected.practitionerName}</small></div><div><span>Saldo autoritativo</span><strong className="numeric-emphasis">{money(selected.outstanding)}</strong><small>{selected.status}</small></div></div>
        <h3 className="payments-title">Historial de pagos</h3>{renderPaymentHistory(selected.payments, selected.locationTimeZone)}
        {selected.outstanding > 0 ? <form className="form-grid payment-form" onSubmit={submitPayment}>
          <fieldset className="field field--wide choice-field"><legend>Intención de cobro</legend><div className="choice-grid"><label className={`choice-card ${paymentMode === "full" ? "choice-card--active" : ""}`}><input type="radio" name="payment-mode" checked={paymentMode === "full"} onChange={() => { setPaymentMode("full"); setAmount(String(selected.outstanding)); }} disabled={busy} /><span><strong>Pago completo</strong><small>{money(selected.outstanding)}</small></span></label><label className={`choice-card ${paymentMode === "partial" ? "choice-card--active" : ""}`}><input type="radio" name="payment-mode" checked={paymentMode === "partial"} onChange={() => { setPaymentMode("partial"); setAmount(""); }} disabled={busy} /><span><strong>Pago parcial</strong><small>Registrar un abono</small></span></label><label className={`choice-card ${paymentMode === "later" ? "choice-card--active" : ""}`}><input type="radio" name="payment-mode" checked={paymentMode === "later"} onChange={() => { setPaymentMode("later"); setAmount(""); }} disabled={busy} /><span><strong>Pagar después</strong><small>Abrir seguimiento</small></span></label></div></fieldset>
          {paymentMode !== "later" ? <><label className="field"><span>Monto (S/)</span><input name="amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required disabled={busy} autoFocus /></label><label className="field"><span>Medio de pago</span><select name="method" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)} disabled={busy}>{paymentMethods.map((item) => <option key={item} value={item}>{PAYMENT_METHOD_LABEL[item]}</option>)}</select></label>{isDigitalPaymentMethod(paymentMethod) && <div className="digital-fields field--wide"><p className="field-note"><ShieldCheck size={16} /> Este pago queda sin verificar hasta una conciliación con referencia reproducible.</p><label className="field"><span>Referencia de operación <em>requerida</em></span><input value={reference} onChange={(event) => setReference(event.target.value)} required placeholder="Código de operación" disabled={busy} /></label><label className="field"><span>Receptor (opcional)</span><input value={receiver} onChange={(event) => setReceiver(event.target.value)} placeholder="Nombre o cuenta receptora" disabled={busy} /></label><label className="field field--wide"><span>Nota de conciliación (opcional)</span><textarea value={reconciliationNote} onChange={(event) => setReconciliationNote(event.target.value)} rows={2} disabled={busy} /></label></div>}</> : <div className="pay-later-note field--wide"><CalendarClock size={19} /><span>Se abrirá un seguimiento con la fecha y nota que indiques.</span></div>}
          {payError && <div className="form-error field--wide" role="alert">{payError}</div>}
          <div className="form-actions field--wide"><Button type="button" onClick={() => setSelected(null)} disabled={busy}>Cancelar</Button>{paymentMode === "later" ? <Button type="button" variant="primary" onClick={() => openFollowUpModal(selected)}>Abrir seguimiento</Button> : <Button type="submit" variant="primary" disabled={busy || !amount}>{busy ? "Registrando…" : "Registrar pago"}</Button>}</div>
        </form> : <div className="settled-callout"><Check size={20} /><span>Este cargo está completamente pagado. No se pueden registrar abonos adicionales.</span></div>}
      </div>}
    </Modal>

    <Modal title={followUpAction === "open" ? "Abrir seguimiento" : followUpAction === "reschedule" ? "Reprogramar seguimiento" : "Cerrar seguimiento"} open={Boolean(followUpAction)} onClose={() => !busy && setFollowUpAction(null)}>
      {selected && followUpAction && <form className="form-grid" onSubmit={submitFollowUp}><div className="charge-context charge-context--compact field--wide"><div><span>Paciente</span><strong>{selected.patientName}</strong></div><div><span>Saldo pendiente</span><strong>{money(selected.outstanding)}</strong></div></div>{followUpAction !== "close" && <label className="field field--wide"><span>Próximo contacto</span><input type="date" value={followUpDate} min={clinicToday(selected.locationTimeZone)} onChange={(event) => setFollowUpDate(event.target.value)} required disabled={busy} /></label>}<label className="field field--wide"><span>Nota {followUpAction === "close" ? "de cierre (opcional)" : "(opcional)"}</span><textarea value={followUpNote} onChange={(event) => setFollowUpNote(event.target.value)} rows={3} disabled={busy} placeholder="Compromiso o contexto operativo" /></label>{followUpAction === "close" && <p className="field-note field--wide"><Clock3 size={16} /> Cerrar el seguimiento no elimina ni condona el saldo pendiente.</p>}{payError && <div className="form-error field--wide" role="alert">{payError}</div>}<div className="form-actions field--wide"><Button type="button" onClick={() => setFollowUpAction(null)} disabled={busy}>Cancelar</Button><Button type="submit" variant={followUpAction === "close" ? "danger" : "primary"} disabled={busy}>{busy ? "Guardando…" : followUpAction === "close" ? "Cerrar seguimiento" : "Guardar seguimiento"}</Button></div></form>}
    </Modal>

    <Modal title="Verificar pago digital" open={Boolean(verifyTarget)} onClose={() => !busy && setVerifyTarget(null)} size="small">
      {verifyTarget && <form className="form-grid" onSubmit={submitVerification}><div className="detail-list field--wide"><div><span>Referencia</span><strong>{verifyTarget.reference}</strong></div><div><span>Monto</span><strong>{money(verifyTarget.amount)}</strong></div><div><span>Método</span><strong>{PAYMENT_METHOD_LABEL[verifyTarget.method]}</strong></div><div><span>Receptor</span><strong>{verifyTarget.receiver ?? "No consta"}</strong></div><div><span>Sede</span><strong>{charges.find(charge => charge.id === String(verifyTarget.chargeId))?.locationName ?? "No consta"}</strong></div><div><span>Estado</span><Badge tone="amber">Sin verificar</Badge></div></div><label className="field field--wide"><span>Nota de conciliación (opcional)</span><textarea rows={3} value={verifyNote} onChange={(event) => setVerifyNote(event.target.value)} disabled={busy} /></label><div className="form-actions field--wide"><Button type="button" onClick={() => setVerifyTarget(null)} disabled={busy}>Cancelar</Button><Button type="submit" variant="primary" icon={ShieldCheck} disabled={busy}>{busy ? "Verificando…" : "Marcar verificado"}</Button></div></form>}
    </Modal>
  </section>;
}
