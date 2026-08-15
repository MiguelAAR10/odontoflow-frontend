import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowDownRight, ArrowUpRight, CalendarDays, ChevronDown, Clock3, Plus, Search, WalletCards } from "lucide-react";
import { createCashMovement, getCashMovements } from "../api";
import { Badge, statusTone } from "../components/Badge";
import { Button } from "../components/Button";
import { type Column, DataTable } from "../components/DataTable";
import { KpiCard } from "../components/KpiCard";
import { Modal } from "../components/Modal";
import type { CashMovement } from "../types";

const tabs = ["Movimientos", "Comisiones", "Links de pago", "Cierres de caja"];

export function CashPage() {
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [tab, setTab] = useState("Movimientos");
  const [branch, setBranch] = useState("Todas las sedes");
  const [method, setMethod] = useState("Todos");
  const [query, setQuery] = useState("");
  const [entryType, setEntryType] = useState<"income" | "expense" | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => { void getCashMovements().then(setMovements); }, []);
  const visible = useMemo(() => movements.filter((item) =>
    (branch === "Todas las sedes" || item.branch === branch) &&
    (method === "Todos" || item.method === method) &&
    (!query.trim() || `${item.party} ${item.concept}`.toLowerCase().includes(query.toLowerCase()))
  ), [movements, branch, method, query]);

  const submitMovement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!entryType) return;
    const form = new FormData(event.currentTarget);
    const saved = await createCashMovement({
      branch: String(form.get("branch")), party: String(form.get("party")), concept: String(form.get("concept")), method: String(form.get("method")), amount: Number(form.get("amount")), type: entryType,
    });
    setMovements((current) => [saved, ...current]);
    setEntryType(null);
  };

  const columns: Column<CashMovement>[] = [
    { key: "time", header: "Hora", render: (item) => item.time },
    { key: "branch", header: "Sede", render: (item) => item.branch },
    { key: "party", header: "Paciente / proveedor", width: "18%", render: (item) => item.party },
    { key: "concept", header: "Concepto", width: "19%", render: (item) => item.concept },
    { key: "method", header: "Medio de pago", render: (item) => <Badge tone={item.method === "Yape" || item.method === "Plin" ? "purple" : item.method === "Link de pago" ? "amber" : "blue"}>{item.method}</Badge> },
    { key: "amount", header: "Monto", render: (item) => <strong className={`amount amount--${item.type}`}>{item.type === "expense" ? "−" : item.type === "income" ? "+" : ""} S/ {item.amount.toFixed(2)}</strong> },
    { key: "owner", header: "Responsable", render: (item) => item.owner },
    { key: "status", header: "Estado", render: (item) => <Badge tone={statusTone(item.status)}>{item.status}</Badge> },
    { key: "more", header: "", render: () => <button className="row-menu" aria-label="Más acciones">⋮</button> },
  ];

  return (
    <section className="page">
      <div className="page-heading"><h1>Control de caja</h1><p>Ingresos, egresos y pagos de todas las sedes</p></div>
      <div className="section-tabs">{tabs.map((label) => <button key={label} className={tab === label ? "section-tab--active" : ""} onClick={() => setTab(label)}>{label}</button>)}</div>
      <div className="kpi-grid">
        <KpiCard icon={ArrowUpRight} value="S/ 3,850" label="Ingresos del día" tone="green" />
        <KpiCard icon={ArrowDownRight} value="S/ 420" label="Egresos del día" tone="red" />
        <KpiCard icon={WalletCards} value="S/ 3,430" label="Saldo neto" tone="cyan" />
        <KpiCard icon={Clock3} value="S/ 1,250" label="Por cobrar" tone="amber" />
      </div>
      <div className={`cash-status ${closed ? "cash-status--closed" : ""}`}><span><i />{closed ? "Caja cerrada" : "Caja abierta"} <b>·</b> Inicio 08:00 a. m.</span><button onClick={() => setCloseOpen(true)}>{closed ? "Ver cierre" : "Ver arqueo"}</button></div>

      {tab === "Movimientos" ? <section className="panel table-panel table-panel--flush">
        <div className="table-toolbar cash-toolbar">
          <Button compact icon={CalendarDays}>Hoy</Button><strong>14 agosto 2026</strong>
          <label className="select-control"><select value={branch} onChange={(event) => setBranch(event.target.value)} aria-label="Sede"><option>Todas las sedes</option><option>Lince</option><option>Jesús María</option><option>Magdalena</option></select><ChevronDown size={16} /></label>
          <label className="select-control"><select value={method} onChange={(event) => setMethod(event.target.value)} aria-label="Medio de pago"><option>Todos</option><option>Efectivo</option><option>Tarjeta</option><option>Yape</option><option>Plin</option><option>Transferencia</option><option>Link de pago</option></select><ChevronDown size={16} /></label>
          <label className="search-control"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar paciente o concepto" aria-label="Buscar movimiento" /></label>
          <Button compact variant="primary" icon={Plus} onClick={() => setEntryType("income")} disabled={closed}>Nuevo ingreso</Button>
          <Button compact variant="danger" onClick={() => setEntryType("expense")} disabled={closed}>Registrar egreso</Button>
          <Button compact onClick={() => setCloseOpen(true)} disabled={closed}>Cerrar caja</Button>
        </div>
        <DataTable columns={columns} rows={visible} rowKey={(item) => item.id} />
        <div className="pagination"><span>{visible.length} movimientos registrados</span><div><button disabled>‹</button><button className="page-active">1</button><button>2</button><button>3</button><button>›</button></div><select aria-label="Filas por página"><option>20 por página</option></select></div>
      </section> : <section className="panel contextual-empty"><WalletCards /><h2>{tab}</h2><p>Selecciona los filtros para revisar la información consolidada de este módulo.</p><Button>Actualizar vista</Button></section>}

      <Modal title={entryType === "expense" ? "Registrar egreso" : "Nuevo ingreso"} open={Boolean(entryType)} onClose={() => setEntryType(null)}>
        <form className="form-grid" onSubmit={submitMovement}>
          <label className="field field--wide"><span>{entryType === "expense" ? "Proveedor" : "Paciente"}</span><input name="party" required autoFocus /></label>
          <label className="field field--wide"><span>Concepto</span><input name="concept" required /></label>
          <label className="field"><span>Sede</span><select name="branch"><option>Lince</option><option>Jesús María</option><option>Magdalena</option></select></label>
          <label className="field"><span>Medio de pago</span><select name="method"><option>Efectivo</option><option>Yape</option><option>Plin</option><option>Tarjeta</option><option>Transferencia</option></select></label>
          <label className="field field--wide"><span>Monto (S/)</span><input name="amount" type="number" min="0.01" step="0.01" required /></label>
          <div className="form-actions field--wide"><Button type="button" onClick={() => setEntryType(null)}>Cancelar</Button><Button type="submit" variant={entryType === "expense" ? "danger" : "primary"}>Guardar movimiento</Button></div>
        </form>
      </Modal>
      <Modal title="Cerrar caja" open={closeOpen} onClose={() => setCloseOpen(false)} size="small">
        <div className="confirmation-message"><WalletCards /><h3>Saldo esperado: S/ 3,430.00</h3><p>Al cerrar la caja ya no se podrán registrar movimientos para el 14 de agosto.</p><div className="form-actions"><Button onClick={() => setCloseOpen(false)}>Cancelar</Button><Button variant="danger" onClick={() => { setClosed(true); setCloseOpen(false); }}>Confirmar cierre</Button></div></div>
      </Modal>
    </section>
  );
}
