"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowUpRight, ChevronDown, Clock3, Plus, Receipt, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import styles from "./CashPage.module.css";
import { DEMO_NOW, DEMO_TIME_ZONE, loadCharges, newIdempotencyKey, registerPayment, toApiError, useMocks, useOdontoRepository, type OdontoSnapshot } from "../api";
import { hasCapability } from "../roles";
import { Badge, statusTone } from "../components/Badge";
import { Button } from "../components/Button";
import { type Column, DataTable } from "../components/DataTable";
import { KpiCard } from "../components/KpiCard";
import { Modal } from "../components/Modal";
import type { Charge, Tone } from "../types";

/** Client hint vocabulary only — the backend stores method as a free string. */
const methods = ["Efectivo", "Tarjeta", "Yape", "Plin", "Transferencia", "Link de pago"];
type CashPeriod = "all" | "month" | "today";
type CashCharge = Omit<Charge, "serviceExecutionId"> & { serviceExecutionId?: number };

const money = (value: number) => `S/ ${value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function formatInstant(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: DEMO_TIME_ZONE })} · ${date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: DEMO_TIME_ZONE })}`;
}

function dayKey(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: DEMO_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function cashPeriodRange(period: CashPeriod, now = new Date()): { start: string | null; end: string; label: string } {
  const today = dayKey(now.toISOString());
  if (period === "today") return { start: today, end: today, label: `Hoy, ${today}` };
  if (period === "month") return { start: `${today.slice(0, 7)}-01`, end: today, label: `Este mes hasta hoy (${today.slice(0, 7)})` };
  return { start: null, end: today, label: `Todo el historial hasta ${today}` };
}

function methodTone(method: string): Tone {
  if (method === "Yape" || method === "Plin") return "purple";
  if (method === "Efectivo") return "green";
  if (method === "Tarjeta" || method === "Transferencia") return "blue";
  if (method === "Link de pago") return "amber";
  return "cyan";
}

function demoCashRows(snapshot: OdontoSnapshot): CashCharge[] {
  const scopedCharges = snapshot.actor.role === "owner" ? snapshot.charges : snapshot.charges.filter((charge) => charge.locationId === snapshot.actor.locationId);
  return scopedCharges.map((charge) => {
    const payments = snapshot.payments.filter((payment) => payment.chargeId === charge.id).map((payment) => ({ id: payment.id, amount: payment.amount, method: payment.method, paidAt: payment.paidAt }));
    const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const execution = snapshot.executions.find((item) => item.chargeId === charge.id);
    const visit = execution ? snapshot.visits.find((item) => item.id === execution.visitId) : undefined;
    const patient = snapshot.patients.find((item) => item.id === charge.patientId);
    const practitioner = visit ? snapshot.practitioners.find((item) => item.id === visit.practitionerId) : undefined;
    return {
      id: charge.id,
      amount: charge.amount,
      paid,
      outstanding: Math.max(0, charge.amount - paid),
      createdAt: charge.createdAt,
      payments,
      status: paid >= charge.amount ? "Pagado" : paid > 0 ? "Parcial" : "Pendiente",
      branch: snapshot.locations.find((item) => item.id === charge.locationId)?.name ?? "Sede",
      party: patient?.name ?? "Paciente",
      concept: execution?.serviceName ?? "Servicio clínico",
      owner: practitioner?.name ?? "Profesional",
    };
  });
}

export function CashPage() {
  const searchParams = useSearchParams();
  const chargeQuery = searchParams.get("charge");
  const { snapshot, dispatch, repository } = useOdontoRepository();
  const [charges, setCharges] = useState<CashCharge[]>([]);
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState("Todos");
  const [period, setPeriod] = useState<CashPeriod>("all");
  const [selected, setSelected] = useState<CashCharge | null>(null);
  const [amount, setAmount] = useState("");
  const [paymentKey, setPaymentKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const canPay = useMocks && hasCapability(snapshot.actor.role, "payments.create");
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCharges(useMocks ? demoCashRows(repository.getSnapshot()) : await loadCharges());
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      setLoading(false);
    }
  }, [repository]);

  useEffect(() => { void refresh(); }, [refresh]);

  const periodRange = useMemo(() => cashPeriodRange(period, new Date(useMocks ? DEMO_NOW : Date.now())), [period]);
  const matching = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return charges.filter((charge) => {
      const methods = charge.payments.map((payment) => payment.method);
      const searchable = useMocks ? `${charge.party} ${charge.concept}` : `#${charge.id} ${charge.serviceExecutionId}`;
      return (!normalized || searchable.toLowerCase().includes(normalized)) &&
        (method === "Todos" || methods.includes(method));
    });
  }, [charges, query, method]);
  const visible = useMemo(() => matching.filter((charge) => {
    const createdDay = dayKey(charge.createdAt);
    return (!periodRange.start || createdDay >= periodRange.start) && createdDay <= periodRange.end;
  }), [matching, periodRange]);

  const totals = useMemo(() => {
    const paid = matching.reduce((sum, charge) => sum + charge.payments.reduce((chargeSum, payment) => {
      const paidDay = dayKey(payment.paidAt);
      return paidDay <= periodRange.end && (!periodRange.start || paidDay >= periodRange.start) && (method === "Todos" || payment.method === method) ? chargeSum + payment.amount : chargeSum;
    }, 0), 0);
    const outstanding = charges.reduce((sum, charge) => sum + charge.outstanding, 0);
    return { paid, outstanding };
  }, [charges, matching, periodRange, method]);

  const openCharge = (charge: CashCharge) => {
    setSelected(charge);
    setAmount("");
    setPaymentKey(null);
    setPayError("");
  };

  useEffect(() => {
    if (!chargeQuery || !charges.length) return;
    const linkedCharge = charges.find((charge) => charge.id === chargeQuery);
    if (linkedCharge && selected?.id !== linkedCharge.id) openCharge(linkedCharge);
  }, [chargeQuery, charges, selected?.id]);

  const submitPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    setPayError("");
    setPaying(true);
    try {
      const payment = { amount: Number(form.get("amount")), method: String(form.get("method")) };
      const idempotencyKey = paymentKey ?? newIdempotencyKey();
      if (!paymentKey) setPaymentKey(idempotencyKey);
      if (useMocks) await dispatch({ type: "registerPayment", chargeId: selected.id, ...payment, idempotencyKey });
      else await registerPayment(selected.id, payment, idempotencyKey);
      setSelected(null);
      setPaymentKey(null);
      await refresh();
    } catch (caught) {
      setPayError(toApiError(caught).message);
    } finally {
      setPaying(false);
    }
  };

  const renderMethods = (charge: CashCharge) => {
    const unique = [...new Set(charge.payments.map((payment) => payment.method))];
    return unique.length
      ? unique.map((item) => <Badge key={item} tone={methodTone(item)}>{item}</Badge>)
      : <span className="text-muted">—</span>;
  };
  const paymentAction = (charge: CashCharge) => charge.outstanding > 0 && canPay
    ? <Button compact variant="primary" icon={Plus} onClick={() => openCharge(charge)}>Cobrar</Button>
    : <Button compact icon={Receipt} onClick={() => openCharge(charge)}>Ver pagos</Button>;

  // Mock-only columns: the backend projects no location/party/owner on
  // charges, so real mode (NEXT_PUBLIC_USE_MOCKS=false) never renders them.
  const mockColumns: Column<CashCharge>[] = useMocks ? [
    { key: "party", header: "Paciente", width: "18%", render: (charge) => <span className="person-cell"><span><strong>{charge.party}</strong><small>{charge.branch}</small></span></span> },
    { key: "concept", header: "Concepto", width: "15%", render: (charge) => charge.concept },
  ] : [];

  const columns: Column<CashCharge>[] = [
    ...mockColumns,
    { key: "created", header: "Fecha", width: useMocks ? "14%" : "22%", render: (charge) => <span className="person-cell"><span><strong>{formatInstant(charge.createdAt)}</strong>{!useMocks && <small>Ejecución {charge.serviceExecutionId ?? "no disponible"}</small>}</span></span> },
    { key: "amount", header: "Monto · pagado", width: useMocks ? "13%" : "18%", render: (charge) => <span className="person-cell"><span><strong>{money(charge.amount)}</strong><small>Pagado {money(charge.paid)}</small></span></span> },
    { key: "outstanding", header: "Pendiente", width: useMocks ? "12%" : "18%", render: (charge) => <strong>{money(charge.outstanding)}</strong> },
    { key: "status", header: "Estado · medio", width: useMocks ? "16%" : "20%", render: (charge) => <span className={styles.statusMethods}><Badge tone={statusTone(charge.status)}>{charge.status}</Badge>{renderMethods(charge)}</span> },
    { key: "actions", header: "", width: useMocks ? "12%" : "22%", render: paymentAction },
  ];

  return (
    <section className={`page ${styles.page}`}>
      <div className="page-heading"><span className="page-kicker">Control financiero</span><h1>Cobros</h1></div>
      <div className="kpi-grid">
        <KpiCard icon={ArrowUpRight} value={money(totals.paid)} label="Cobrado en el periodo" tone="green" />
        <KpiCard icon={Clock3} value={money(totals.outstanding)} label="Saldo vigente" tone="amber" />
        <KpiCard icon={Receipt} value={visible.length} label="Cargos" tone="cyan" />
      </div>
      <p className={styles.scopeNote}>
        {periodRange.label} · cobros por fecha de pago · saldo vigente del libro visible.
      </p>
      <section className="panel table-panel table-panel--flush">
        <div className="table-toolbar cash-toolbar">
          <label className="search-control"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={useMocks ? "Buscar paciente o concepto" : "Buscar por cargo o ejecución"} aria-label="Buscar cargo" /></label>
          <label className="select-control"><select value={method} onChange={(event) => setMethod(event.target.value)} aria-label="Filtrar por medio de pago"><option>Todos</option>{methods.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={16} /></label>
          <label className="select-control"><select value={period} onChange={(event) => setPeriod(event.target.value as CashPeriod)} aria-label="Periodo del resumen"><option value="today">Hoy</option><option value="month">Este mes</option><option value="all">Todo el historial</option></select><ChevronDown size={16} /></label>
          <span className="result-count">{visible.length} cobros</span>
        </div>
        {error && <div className="form-error" role="alert">{error}<Button compact onClick={() => void refresh()}>Reintentar</Button></div>}
        {loading && <div className="table-loading" role="status">Cargando cobros…</div>}
        {!loading && <>
          <DataTable className="cash-desktop-table" columns={columns} rows={visible} rowKey={(charge) => charge.id} helpLabel={useMocks ? (charge) => `${charge.party} · ${charge.concept}` : undefined} helpHref={useMocks ? (charge) => `/caja?charge=${encodeURIComponent(charge.id)}` : undefined} emptyMessage="No hay cargos registrados" />
          {visible.length > 0 && <div className={styles.mobileCharges} aria-label="Cargos">
            {visible.map((charge) => <article className={styles.mobileCharge} key={charge.id} data-help-id={useMocks ? charge.id : undefined} data-help-href={useMocks ? `/caja?charge=${encodeURIComponent(charge.id)}` : undefined} data-help-label={useMocks ? `${charge.party} · ${charge.concept}` : undefined}>
              <header><div><strong>{useMocks ? charge.party : "Cargo"}</strong><span>{useMocks ? `${charge.concept} · ${charge.branch}` : `Ejecución ${charge.serviceExecutionId ?? "no disponible"}`}</span></div><Badge tone={statusTone(charge.status)}>{charge.status}</Badge></header>
              <time>{formatInstant(charge.createdAt)}</time>
              <div className={styles.mobileChargeAmounts}><span>Total<strong>{money(charge.amount)}</strong></span><span>Pagado<strong>{money(charge.paid)}</strong></span><span>Pendiente<strong>{money(charge.outstanding)}</strong></span></div>
              <div className={styles.mobileChargeFooter}><span className={styles.mobileMethods}>{renderMethods(charge)}</span>{paymentAction(charge)}</div>
            </article>)}
          </div>}
        </>}
        <div className="pagination"><span>{visible.length} cobros registrados</span><div /><select aria-label="Filas por página"><option>20 por página</option></select></div>
      </section>

      <Modal title={selected ? `${selected.party} · ${selected.concept} · saldo ${money(selected.outstanding)}` : "Cobro"} open={Boolean(selected)} onClose={() => setSelected(null)}>
        {selected && <div>
          <div className="detail-list">
            <div><span>Monto total</span><strong>{money(selected.amount)}</strong></div>
            <div><span>Pagado</span><strong>{money(selected.paid)}</strong></div>
            <div><span>Por cobrar</span><strong>{money(selected.outstanding)}</strong></div>
          </div>
          <h3 className="payments-title">Historial de pagos</h3>
          {selected.payments.length ? <ul className="payment-list">{selected.payments.map((payment) => (
            <li key={payment.id}><span><Badge tone={methodTone(payment.method)}>{payment.method}</Badge><small>{formatInstant(payment.paidAt)}</small></span><strong>{money(payment.amount)}</strong></li>
          ))}</ul> : <p className="empty-state">Sin pagos registrados.</p>}
          {payError && <div className="form-error" role="alert">{payError}</div>}
          {canPay && selected.outstanding > 0 ? <form className="form-grid" onSubmit={submitPayment}>
            <label className="field"><span>Monto (S/)</span><input name="amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => { setAmount(event.target.value); setPaymentKey(null); }} required disabled={paying} autoFocus /></label>
            <label className="field"><span>Medio de pago</span><select name="method" defaultValue="Efectivo" onChange={() => setPaymentKey(null)} disabled={paying}>{methods.map((item) => <option key={item}>{item}</option>)}</select></label>
            <div className="form-actions field--wide">
              <Button compact type="button" onClick={() => setAmount(String(selected.outstanding))} disabled={paying || selected.outstanding <= 0}>Pagar todo</Button>
              <div style={{ flex: 1 }} />
              <Button type="button" onClick={() => setSelected(null)} disabled={paying}>Cancelar</Button>
              <Button type="submit" variant="primary" disabled={paying}>{paying ? "Registrando…" : "Registrar pago"}</Button>
            </div>
          </form> : <p className="modal-intro">Solo lectura</p>}
        </div>}
      </Modal>
    </section>
  );
}
