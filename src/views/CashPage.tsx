"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowUpRight, ChevronDown, Clock3, Plus, Receipt, Search } from "lucide-react";
import { loadCharges, newIdempotencyKey, registerPayment, sumOutstanding, sumPaid, toApiError, useMocks } from "../api";
import { Badge, statusTone } from "../components/Badge";
import { Button } from "../components/Button";
import { type Column, DataTable } from "../components/DataTable";
import { KpiCard } from "../components/KpiCard";
import { Modal } from "../components/Modal";
import type { Charge, Tone } from "../types";

/** Client hint vocabulary only — the backend stores method as a free string. */
const methods = ["Efectivo", "Tarjeta", "Yape", "Plin", "Transferencia", "Link de pago"];

const money = (value: number) => `S/ ${value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function formatInstant(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString("es-PE", { day: "numeric", month: "short" })} · ${date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: true })}`;
}

function methodTone(method: string): Tone {
  if (method === "Yape" || method === "Plin") return "purple";
  if (method === "Efectivo") return "green";
  if (method === "Tarjeta" || method === "Transferencia") return "blue";
  if (method === "Link de pago") return "amber";
  return "cyan";
}

export function CashPage() {
  const [charges, setCharges] = useState<Charge[]>([]);
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState("Todos");
  const [selected, setSelected] = useState<Charge | null>(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");

  const refresh = useCallback(async () => {
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

  useEffect(() => { void refresh(); }, [refresh]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return charges.filter((charge) => {
      const methods = charge.payments.map((payment) => payment.method);
      const searchable = useMocks ? `${charge.party} ${charge.concept}` : `#${charge.id} ${charge.serviceExecutionId}`;
      return (!normalized || searchable.toLowerCase().includes(normalized)) &&
        (method === "Todos" || methods.includes(method));
    });
  }, [charges, query, method]);

  const openCharge = (charge: Charge) => {
    setSelected(charge);
    setAmount("");
    setPayError("");
  };

  const submitPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    setPayError("");
    setPaying(true);
    try {
      await registerPayment(
        selected.id,
        { amount: Number(form.get("amount")), method: String(form.get("method")) },
        newIdempotencyKey(),
      );
      setSelected(null);
      await refresh();
    } catch (caught) {
      setPayError(toApiError(caught).message);
    } finally {
      setPaying(false);
    }
  };

  const renderMethods = (charge: Charge) => {
    const unique = [...new Set(charge.payments.map((payment) => payment.method))];
    return unique.length
      ? unique.map((item) => <Badge key={item} tone={methodTone(item)}>{item}</Badge>)
      : <span className="text-muted">—</span>;
  };

  // Mock-only columns: the backend projects no location/party/owner on
  // charges, so real mode (NEXT_PUBLIC_USE_MOCKS=false) never renders them.
  const mockColumns: Column<Charge>[] = useMocks ? [
    { key: "branch", header: "Sede", render: (charge) => charge.branch },
    { key: "party", header: "Paciente", width: "15%", render: (charge) => charge.party },
    { key: "concept", header: "Concepto", width: "16%", render: (charge) => charge.concept },
  ] : [];

  const columns: Column<Charge>[] = [
    { key: "id", header: "Cargo", render: (charge) => <span className="person-cell"><span><strong>#{charge.id}</strong><small>Ejecución #{charge.serviceExecutionId}</small></span></span> },
    ...mockColumns,
    { key: "created", header: "Fecha", render: (charge) => formatInstant(charge.createdAt) },
    { key: "amount", header: "Monto", render: (charge) => money(charge.amount) },
    { key: "paid", header: "Pagado", render: (charge) => money(charge.paid) },
    { key: "outstanding", header: "Por cobrar", render: (charge) => <strong>{money(charge.outstanding)}</strong> },
    { key: "methods", header: "Medio de pago", render: renderMethods },
    { key: "status", header: "Estado", render: (charge) => <Badge tone={statusTone(charge.status)}>{charge.status}</Badge> },
    { key: "actions", header: "", render: (charge) => <Button compact variant="primary" icon={Plus} onClick={() => openCharge(charge)}>Cobrar</Button> },
  ];

  return (
    <section className="page">
      <div className="page-heading"><h1>Cobros</h1><p>Cargos por servicios y pagos registrados</p></div>
      <div className="kpi-grid">
        <KpiCard icon={ArrowUpRight} value={money(sumPaid(charges))} label="Cobrado" tone="green" />
        <KpiCard icon={Clock3} value={money(sumOutstanding(charges))} label="Por cobrar" tone="amber" />
        <KpiCard icon={Receipt} value={charges.length} label="Cargos" tone="cyan" />
      </div>
      <section className="panel table-panel table-panel--flush">
        <div className="table-toolbar cash-toolbar">
          <label className="search-control"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={useMocks ? "Buscar paciente o concepto" : "Buscar por cargo o ejecución"} aria-label="Buscar cargo" /></label>
          <label className="select-control"><select value={method} onChange={(event) => setMethod(event.target.value)} aria-label="Filtrar por medio de pago"><option>Todos</option>{methods.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={16} /></label>
          <span className="result-count">{visible.length} cobros</span>
        </div>
        {error && <div className="form-error" role="alert">{error}<Button compact onClick={() => void refresh()}>Reintentar</Button></div>}
        {loading && <div className="table-loading" role="status">Cargando cobros…</div>}
        {!loading && <DataTable columns={columns} rows={visible} rowKey={(charge) => charge.id} emptyMessage="No hay cargos registrados" />}
        <div className="pagination"><span>{visible.length} cobros registrados</span><div /><select aria-label="Filas por página"><option>20 por página</option></select></div>
      </section>

      <Modal title={selected ? `Cobrar cargo #${selected.id}` : "Cobro"} open={Boolean(selected)} onClose={() => setSelected(null)}>
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
          <form className="form-grid" onSubmit={submitPayment}>
            <label className="field"><span>Monto (S/)</span><input name="amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required disabled={paying} autoFocus /></label>
            <label className="field"><span>Medio de pago</span><select name="method" defaultValue="Efectivo" disabled={paying}>{methods.map((item) => <option key={item}>{item}</option>)}</select></label>
            <div className="form-actions field--wide">
              <Button compact type="button" onClick={() => setAmount(String(selected.outstanding))} disabled={paying || selected.outstanding <= 0}>Pagar todo</Button>
              <div style={{ flex: 1 }} />
              <Button type="button" onClick={() => setSelected(null)} disabled={paying}>Cancelar</Button>
              <Button type="submit" variant="primary" disabled={paying}>{paying ? "Registrando…" : "Registrar pago"}</Button>
            </div>
          </form>
        </div>}
      </Modal>
    </section>
  );
}
