"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
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
  closeFollowUpRecord,
  loadCharges,
  loadFollowUps,
  loadReconciliationPayments,
  loadUnchargedExecutions,
  newIdempotencyKey,
  openFollowUpRecord,
  registerPayment,
  rescheduleFollowUpRecord,
  sumOutstanding,
  sumPaid,
  toApiError,
  verifyPaymentRecord,
} from "../api";
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

export function CashPage() {
  const [tab, setTab] = useState<CashTab>("charges");
  const [charges, setCharges] = useState<Charge[]>([]);
  const [uncharged, setUncharged] = useState<UnchargedExecution[]>([]);
  const [followUps, setFollowUps] = useState<ChargeFollowUp[]>([]);
  const [reconciliation, setReconciliation] = useState<Payment[]>([]);
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
  const [success, setSuccess] = useState("");
  const [payError, setPayError] = useState("");
  const [verifyTarget, setVerifyTarget] = useState<Payment | null>(null);
  const [verifyNote, setVerifyNote] = useState("");

  const refreshCharges = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCharges(await loadCharges());
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshTab = useCallback(async (nextTab: CashTab) => {
    setLoading(true);
    setError("");
    try {
      if (nextTab === "charges") {
        setCharges(await loadCharges());
      } else if (nextTab === "uncharged") {
        setUncharged(await loadUnchargedExecutions());
      } else if (nextTab === "collections") {
        const [rows, canonicalCharges] = await Promise.all([loadFollowUps({ active: true }), loadCharges()]);
        setFollowUps(rows);
        setCharges(canonicalCharges);
      } else {
        const [pendingPayments, canonicalCharges] = await Promise.all([loadReconciliationPayments(), loadCharges()]);
        setReconciliation(pendingPayments);
        setCharges(canonicalCharges);
      }
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refreshCharges(); }, [refreshCharges]);
  useEffect(() => { if (tab !== "charges") void refreshTab(tab); }, [refreshTab, tab]);

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
    if (!selected || paymentMode === "later") return;
    const paymentAmount = Number(amount);
    setBusy(true);
    setPayError("");
    try {
      await registerPayment(selected.id, {
        amount: paymentAmount,
        method: paymentMethod,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(receiver.trim() ? { receiver: receiver.trim() } : {}),
        ...(reconciliationNote.trim() ? { reconciliation_note: reconciliationNote.trim() } : {}),
      }, newIdempotencyKey());
      setSuccess("Pago registrado. La confirmación bancaria sigue pendiente cuando corresponda.");
      const [nextCharges, nextReconciliation] = await Promise.all([loadCharges(), loadReconciliationPayments()]);
      setCharges(nextCharges);
      setReconciliation(nextReconciliation);
      const next = nextCharges.find((charge) => charge.id === selected.id);
      if (next) setSelected(next);
      setAmount(next && paymentMode === "full" ? String(next.outstanding) : "");
    } catch (caught) {
      setPayError(toApiError(caught).message);
    } finally {
      setBusy(false);
    }
  };

  const openFollowUpModal = (charge: Charge, action: FollowUpAction = "open", existing?: ChargeFollowUp) => {
    setSelected(charge);
    setSelectedFollowUp(existing ?? null);
    setFollowUpAction(action);
    setFollowUpDate(existing?.nextFollowUpOn ?? clinicToday(charge.locationTimeZone));
    setFollowUpNote(existing?.note ?? "");
    setPayError("");
  };

  const submitFollowUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !followUpAction) return;
    setBusy(true);
    setPayError("");
    try {
      if (followUpAction === "open") {
        await openFollowUpRecord(selected.id, {
          next_follow_up_on: followUpDate,
          ...(followUpNote.trim() ? { note: followUpNote.trim() } : {}),
        }, newIdempotencyKey());
      } else if (followUpAction === "reschedule" && selectedFollowUp) {
        await rescheduleFollowUpRecord(selectedFollowUp.id, {
          next_follow_up_on: followUpDate,
          ...(followUpNote.trim() ? { note: followUpNote.trim() } : {}),
        }, newIdempotencyKey());
      } else if (followUpAction === "close" && selectedFollowUp) {
        await closeFollowUpRecord(selectedFollowUp.id, { ...(followUpNote.trim() ? { note: followUpNote.trim() } : {}) }, newIdempotencyKey());
      }
      setFollowUpAction(null);
      setSelectedFollowUp(null);
      const [nextCharges, nextFollowUps] = await Promise.all([loadCharges(), loadFollowUps({ active: true })]);
      setCharges(nextCharges);
      setFollowUps(nextFollowUps);
      setSuccess(followUpAction === "close" ? "Seguimiento cerrado; el saldo permanece pendiente." : "Seguimiento guardado.");
    } catch (caught) {
      setPayError(toApiError(caught).message);
    } finally {
      setBusy(false);
    }
  };

  const submitVerification = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!verifyTarget?.reference) return;
    setBusy(true);
    setError("");
    try {
      const saved = await verifyPaymentRecord(verifyTarget.id, { ...(verifyNote.trim() ? { reconciliation_note: verifyNote.trim() } : {}) }, newIdempotencyKey());
      setReconciliation((current) => current.filter((payment) => payment.id !== saved.id));
      setVerifyTarget(null);
      setVerifyNote("");
      setSuccess("Pago marcado como verificado.");
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      setBusy(false);
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
    { key: "status", header: "Estado", render: (charge) => <Badge tone={statusTone(charge.status)}>{charge.status}</Badge> },
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
    { key: "payment", header: "Pago", width: "20%", render: (payment) => <span className="person-cell"><span><strong>{PAYMENT_METHOD_LABEL[payment.method]}</strong><small>{payment.reference ?? "Sin código de operación · registro anterior"}</small></span></span> },
    { key: "charge", header: "Cargo", render: (payment) => { const charge = charges.find((item) => item.id === String(payment.chargeId)); return charge ? <span className="table-context"><strong>{charge.patientName}</strong><small>{charge.serviceName} · #{charge.id}</small></span> : `#${payment.chargeId ?? "—"}`; } },
    { key: "receiver", header: "Receptor", render: (payment) => payment.receiver ?? "—" },
    { key: "date", header: "Registrado", render: (payment) => formatInstant(payment.paidAt) },
    { key: "amount", header: "Monto", render: (payment) => money(payment.amount) },
    { key: "state", header: "Estado", render: () => <Badge tone="amber">Sin verificar</Badge> },
    { key: "actions", header: "", render: (payment) => payment.reference ? <Button compact variant="primary" icon={ShieldCheck} onClick={() => { setVerifyTarget(payment); setVerifyNote(""); }}>Verificar</Button> : <span className="text-muted">Histórico · no verificable</span> },
  ];

  const heading = tab === "charges" ? ["Cobros", "Cargos por servicios y pagos registrados"] : tab === "uncharged" ? ["Por facturar", "Atenciones ejecutadas sin cargo asociado"] : tab === "collections" ? ["Cobranza", "Seguimientos activos ordenados por el servidor"] : ["Conciliación", "Pagos digitales pendientes de verificación"];

  return <section className="page cash-page">
    <div className="page-heading page-heading--with-actions"><div><h1>{heading[0]}</h1><p>{heading[1]}</p></div><span className="cash-authority-note"><WalletCards size={17} aria-hidden="true" /> Saldos y estados vienen del backend</span></div>
    <Tabs items={tabItems} value={tab} onChange={(value) => { setTab(value as CashTab); setError(""); setSuccess(""); }} ariaLabel="Espacios de caja" panelId="cash-panel" />

    {tab === "charges" && <div className="kpi-grid cash-kpis"><KpiCard icon={ArrowUpRight} value={money(sumPaid(charges))} label="Pagado en filas cargadas" tone="green" /><KpiCard icon={Clock3} value={money(sumOutstanding(charges))} label="Saldo en filas cargadas" tone="amber" /><KpiCard icon={Receipt} value={charges.length} label="Cargos cargados" tone="cyan" /></div>}
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
        <div className="table-toolbar cash-toolbar"><span className="toolbar-leading"><ShieldCheck size={18} /> Solo yape, plin y transferencia sin verificar</span><span className="result-count">{reconciliation.length} pagos</span></div>
        {loading ? <div className="table-loading" role="status">Cargando conciliación…</div> : <DataTable columns={reconciliationColumns} rows={reconciliation} rowKey={(payment) => payment.id} emptyMessage="No hay pagos digitales pendientes" />}
      </>}
      <div className="pagination"><span>{tab === "charges" ? `${visibleCharges.length} cargos registrados` : tab === "uncharged" ? `${uncharged.length} atenciones` : tab === "collections" ? `${collectionsRows.length} seguimientos activos` : `${reconciliation.length} pagos pendientes`}</span><div /><span className="text-muted">Vista completa</span></div>
    </section>

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
      {verifyTarget && <form className="form-grid" onSubmit={submitVerification}><div className="detail-list field--wide"><div><span>Referencia</span><strong>{verifyTarget.reference}</strong></div><div><span>Monto</span><strong>{money(verifyTarget.amount)}</strong></div><div><span>Estado</span><Badge tone="amber">Sin verificar</Badge></div></div><label className="field field--wide"><span>Nota de conciliación (opcional)</span><textarea rows={3} value={verifyNote} onChange={(event) => setVerifyNote(event.target.value)} disabled={busy} /></label><div className="form-actions field--wide"><Button type="button" onClick={() => setVerifyTarget(null)} disabled={busy}>Cancelar</Button><Button type="submit" variant="primary" icon={ShieldCheck} disabled={busy}>{busy ? "Verificando…" : "Marcar verificado"}</Button></div></form>}
    </Modal>
  </section>;
}
