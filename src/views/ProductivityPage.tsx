"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Bot, CalendarCheck2, RotateCcw, WalletCards } from "lucide-react";
import {
  describeObservabilityError,
  hasPermissions,
  loadClinicLocations,
  loadProductivity,
  PRODUCTIVITY_MAX_SPAN_DAYS,
  PRODUCTIVITY_PRESETS,
  productivityPreset,
  productivityRangeError,
  type ObservabilityError,
  type ProductivityPreset,
} from "../api";
import { Button } from "../components/Button";
import { DataTable, type Column } from "../components/DataTable";
import { usePersona } from "../components/PersonaContext";
import { Tabs } from "../components/Tabs";
import type { ClinicLocation, ProductivityAgentRow, ProductivityView } from "../types";

/**
 * Productividad (administrador): for a date range, how the clinic did in
 * appointments, money and agent proposals. Every figure is the backend's
 * (`GET /metrics/productivity`); this page only formats it.
 */
export function ProductivityPage() {
  const { identity, loading } = usePersona();
  const allowed = hasPermissions(identity, ["audit.read"]);
  return <section className="page productivity-page">
    <div className="page-heading">
      <div><h1>Productividad</h1><p>Citas, dinero y propuestas de los agentes en el periodo que elijas.</p></div>
    </div>
    {loading ? <p className="table-loading" role="status">Cargando…</p>
      : identity?.principalType !== "human" ? <p className="approvals-notice" role="note">Para ver la productividad, elige quién eres en el menú de perfil, abajo a la izquierda.</p>
      : !allowed ? <p className="approvals-notice" role="note">Solo el administrador puede ver la productividad.</p>
      : <ProductivityReportView />}
  </section>;
}

type RangeChoice = ProductivityPreset | "custom";

const formatDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function ProductivityReportView() {
  const [choice, setChoice] = useState<RangeChoice>("last30");
  const [range, setRange] = useState(() => productivityPreset("last30"));
  const [draft, setDraft] = useState(range);
  const [locationId, setLocationId] = useState("");
  const [locations, setLocations] = useState<ClinicLocation[]>([]);
  const [report, setReport] = useState<ProductivityView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ObservabilityError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    loadClinicLocations().then((map) => { if (active) setLocations([...map.values()]); }, () => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    loadProductivity({ ...range, locationId: locationId ? Number(locationId) : null }).then(
      (view) => { if (active) setReport(view); },
      (caught) => { if (active) { setReport(null); setError(describeObservabilityError(caught, "productividad")); } },
    ).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range, locationId, attempt]);

  const choosePreset = (value: string) => {
    setChoice(value as RangeChoice);
    if (value === "custom") return;
    const next = productivityPreset(value as ProductivityPreset);
    setRange(next);
    setDraft(next);
  };

  const draftError = choice === "custom" ? productivityRangeError(draft.from, draft.to) : null;
  const applyCustom = (event: FormEvent) => {
    event.preventDefault();
    if (!draftError) setRange(draft);
  };

  const sede = locations.find((location) => String(location.id) === locationId)?.name ?? "Todas las sedes";

  return <>
    <div className="productivity-controls">
      <Tabs ariaLabel="Periodo" value={choice} onChange={choosePreset} items={[...PRODUCTIVITY_PRESETS, { id: "custom", label: "Elegir fechas" }]} />
      <label className="field activity-filter"><span>Sede</span>
        <select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
          <option value="">Todas las sedes</option>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select>
      </label>
    </div>
    {choice === "custom" && <form className="productivity-custom" onSubmit={applyCustom} noValidate>
      <label className="field activity-filter"><span>Desde</span><input type="date" value={draft.from} max={draft.to} onChange={(event) => setDraft((value) => ({ ...value, from: event.target.value }))} aria-describedby="productivity-range-note" /></label>
      <label className="field activity-filter"><span>Hasta</span><input type="date" value={draft.to} min={draft.from} onChange={(event) => setDraft((value) => ({ ...value, to: event.target.value }))} aria-describedby="productivity-range-note" /></label>
      <Button type="submit" variant="primary" compact disabled={Boolean(draftError)}>Ver periodo</Button>
      <p id="productivity-range-note" className={draftError ? "form-error productivity-custom__note" : "field-note productivity-custom__note"} role={draftError ? "alert" : undefined}>
        {draftError ?? `Fechas de la clínica, ambas incluidas. Máximo ${PRODUCTIVITY_MAX_SPAN_DAYS} días.`}
      </p>
    </form>}

    <p className="productivity-scope" aria-live="polite">{formatDate(range.from) === formatDate(range.to) ? formatDate(range.from) : `Del ${formatDate(range.from)} al ${formatDate(range.to)}`} · {sede}</p>

    {error && <div className="form-error approvals-error" role="alert"><span>{error.message}</span><Button compact icon={RotateCcw} onClick={() => setAttempt((value) => value + 1)}>Reintentar</Button></div>}
    {loading && !report ? <p className="table-loading" role="status">Calculando…</p>
      : report && <div className={`productivity-report ${loading ? "productivity-report--stale" : ""}`} aria-busy={loading}>
        <section className="productivity-block" aria-labelledby="prod-appointments">
          <h2 id="prod-appointments"><CalendarCheck2 size={19} aria-hidden="true" /> Citas</h2>
          <dl className="stat-row">
            <Stat label="Atendidas" value={report.appointments.completed} />
            <Stat label="No asistieron" value={report.appointments.noShow} />
            <Stat label="Canceladas" value={report.appointments.cancelled} />
          </dl>
        </section>
        <section className="productivity-block" aria-labelledby="prod-money">
          <h2 id="prod-money"><WalletCards size={19} aria-hidden="true" /> Dinero</h2>
          <dl className="stat-row">
            <Stat label="Cargado" value={report.money.charged} note="Cargos creados en el periodo." />
            <Stat label="Cobrado" value={report.money.collected} note="Pagos recibidos en el periodo, también de cargos anteriores. Sin pagos anulados." />
            <Stat label="Pendiente" value={report.money.outstanding} note="Lo que aún se debe de los cargos del periodo." />
          </dl>
        </section>
        <section className="productivity-block productivity-block--wide" aria-labelledby="prod-agents">
          <h2 id="prod-agents"><Bot size={19} aria-hidden="true" /> Propuestas de los agentes</h2>
          <DataTable className="productivity-table" columns={AGENT_COLUMNS} rows={report.proposals} rowKey={(row) => row.agent} emptyMessage="Ningún agente propuso nada en este periodo." />
          <p className="productivity-reminders"><strong>{report.remindersApproved}</strong> {report.remindersApproved === 1 ? "recordatorio de cobranza aprobado" : "recordatorios de cobranza aprobados"}</p>
        </section>
      </div>}
  </>;
}

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return <div className="stat">
    <dt>{label}</dt>
    <dd>{value}</dd>
    {note && <dd className="stat__note">{note}</dd>}
  </div>;
}

const numeric = (value: number) => <span className="numeric">{value}</span>;
const AGENT_COLUMNS: Column<ProductivityAgentRow>[] = [
  { key: "agent", header: "Agente", render: (row) => <strong>{row.agentLabel}</strong> },
  { key: "created", header: "Creadas", render: (row) => numeric(row.created) },
  { key: "approved", header: "Aprobadas", render: (row) => numeric(row.approved) },
  { key: "declined", header: "Declinadas", render: (row) => numeric(row.declined) },
  { key: "expired", header: "Vencidas", render: (row) => numeric(row.expired) },
];
