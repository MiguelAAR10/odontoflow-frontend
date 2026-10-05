"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Beaker, Building2, CalendarDays, Check, ChevronRight, ClipboardCheck, FlaskConical, Landmark, ListChecks, MapPin, ShieldCheck, Stethoscope } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOdontoRepository, chargeTotals, confirmationQueue, DEMO_FINANCIAL_PERIODS, DEMO_NOW, DEMO_TIME_ZONE, demoDateKey, detailForVisit, financialSummary, noShows, useMocks, type DemoAppointment, type DemoFinancialPeriodKey, type DemoLead, type DemoRequest, type OdontoCommand } from "../api";
import { canAccessClinicalVisit, hasCapability } from "../roles";
import { toMoneyCents } from "../api/transport";
import { Badge, statusTone } from "../components/Badge";
import { Button } from "../components/Button";
import { DataTable, type Column } from "../components/DataTable";
import { InsightBar } from "../components/InsightBar";
import { PageHeader } from "../components/PageHeader";
import { AppointmentPulse, type AppointmentPulseDay } from "../components/AppointmentPulse";
import { ServiceMixPulse } from "../components/ServiceMixPulse";
import doctorHome from "./DoctorHome.module.css";

export type WorkspaceView = "sedes" | "comercial" | "produccion" | "finanzas" | "administracion" | "mi-dia" | "mis-pacientes" | "solicitudes";

const money = (value: number) => `S/ ${value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (value: string) => new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" }).format(new Date(value));
const clinicDate = (value: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-PE", { ...options, timeZone: "America/Lima" }).format(new Date(value));

function ScopeLabel({ children }: { children: React.ReactNode }) {
  return <span className="workspace-scope"><span className="workspace-scope__dot" />{children}</span>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="workspace-empty"><span className="workspace-empty__mark" /><strong>{title}</strong><p>{body}</p></div>;
}

function ActionNotice({ message }: { message: string }) {
  return message ? <div className="workspace-notice" role="status"><Check size={16} />{message}</div> : null;
}

function ApiUnavailable({ title, body }: { title: string; body: string }) {
  return <section className="page workspace-page"><PageHeader title={title}><ScopeLabel>API · sin contrato suficiente</ScopeLabel></PageHeader><div className="workspace-future"><ShieldCheck size={22} /><div><h2>Esta vista no está disponible con datos reales</h2><p>{body}</p></div></div></section>;
}

function useWorkspaceScope() {
  const { snapshot } = useOdontoRepository();
  const { actor } = snapshot;
  const appointments = useMemo(() => snapshot.appointments.filter((item) => actor.role === "collaborator" ? item.practitionerId === actor.practitionerId : actor.role === "owner" ? true : item.locationId === actor.locationId), [actor, snapshot.appointments]);
  const patients = useMemo(() => snapshot.patients.filter((item) => actor.role === "collaborator" ? item.practitionerId === actor.practitionerId : actor.role === "owner" ? true : item.locationId === actor.locationId), [actor, snapshot.patients]);
  return { appointments, patients };
}

function SedesView() {
  const { snapshot } = useOdontoRepository();
  const [periodKey, setPeriodKey] = useState<DemoFinancialPeriodKey>("all");
  const period = DEMO_FINANCIAL_PERIODS[periodKey];
  const summary = financialSummary(snapshot, period);
  const chartData = summary.byLocation.map(({ location, chargeCents, paymentCents }) => ({
    sede: location.name,
    cargos: chargeCents / 100,
    cobros: paymentCents / 100,
  }));
  return <>
    <PageHeader title="Sedes" description="Comparación operativa y financiera por ubicación"><ScopeLabel>Escenario demo · {period.label}</ScopeLabel></PageHeader>
    <div className="workspace-toolbar"><label className="field"><span>Periodo</span><select aria-label="Periodo" value={periodKey} onChange={(event) => setPeriodKey(event.target.value as DemoFinancialPeriodKey)}>{Object.entries(DEMO_FINANCIAL_PERIODS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label></div>
    <InsightBar eyebrow="Red de clínicas" title="Mismo corte, tres sedes" body="Compara cargos creados y cobros recibidos en el periodo. El saldo abierto es vigente al corte y no representa ventas del periodo." source={`Cargos por fecha de creación · pagos por fecha de pago · ${period.label} · demo`} facts={[{ label: "Cargos", value: money(summary.chargeCents / 100) }, { label: "Cobros", value: money(summary.paymentCents / 100) }, { label: "Saldo vigente", value: money(summary.outstandingCents / 100) }]} />
    <section className="panel workspace-visual-panel" aria-label="Comparación de cargos y cobros por sede">
      <header className="workspace-visual-panel__header"><div><span>COMPARACIÓN DE SEDES</span><h2>Cargos y cobros</h2></div><div className="workspace-chart-legend"><span><i data-tone="charge" />Cargos creados</span><span><i data-tone="payment" />Cobros recibidos</span></div></header>
      <div className="workspace-branch-chart" role="img" aria-label={`Cargos y cobros por sede para ${period.label}: ${chartData.map((item) => `${item.sede}, cargos ${money(item.cargos)}, cobros ${money(item.cobros)}`).join("; ")}`}>
        <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 12, right: 16, left: 8, bottom: 2 }} barCategoryGap="35%">
          <CartesianGrid vertical={false} stroke="#E7EBEF" strokeDasharray="3 5" />
          <XAxis dataKey="sede" tickLine={false} axisLine={false} tick={{ fill: "#65706F", fontSize: 12 }} />
          <YAxis tickLine={false} axisLine={false} width={58} tick={{ fill: "#65706F", fontSize: 11 }} tickFormatter={(value) => `S/ ${Number(value).toLocaleString("es-PE")}`} />
          <Tooltip formatter={(value) => [money(Number(value ?? 0)), ""]} />
          <Bar dataKey="cargos" name="Cargos creados" fill="#176A63" radius={[4, 4, 0, 0]} maxBarSize={42} />
          <Bar dataKey="cobros" name="Cobros recibidos" fill="#91B7AF" radius={[4, 4, 0, 0]} maxBarSize={42} />
        </BarChart></ResponsiveContainer>
      </div>
      <div className="workspace-branch-rows">{summary.byLocation.map(({ location, chargeCents, paymentCents, outstandingCents }) => <div className="workspace-branch-row" key={location.id}><span><Building2 size={15} /><strong>{location.name}</strong></span><span><small>Cargos · {period.label}</small><strong>{money(chargeCents / 100)}</strong></span><span><small>Cobros · {period.label}</small><strong>{money(paymentCents / 100)}</strong></span><span><small>Saldo vigente</small><strong>{money(outstandingCents / 100)}</strong></span><Link className="workspace-link" href={`/agenda?location=${encodeURIComponent(location.name)}`}>Agenda <ArrowUpRight size={15} /></Link></div>)}</div>
    </section>
  </>;
}

function ComercialView() {
  const { snapshot } = useOdontoRepository();
  const [filter, setFilter] = useState<DemoLead["status"] | "all">("all");
  const leads = snapshot.leads.filter((lead) => filter === "all" || lead.status === filter);
  const sourceMix = Array.from(snapshot.leads.reduce((counts, lead) => counts.set(lead.source, (counts.get(lead.source) ?? 0) + 1), new Map<string, number>()), ([source, count]) => ({ source, count }));
  const statusLabels: Record<DemoLead["status"], string> = { new: "Nuevo", contacted: "Contactado", scheduled: "Con cita", patient: "Paciente" };
  const statusMix = (["new", "contacted", "scheduled", "patient"] as const).map((status) => ({ status: statusLabels[status], count: snapshot.leads.filter((lead) => lead.status === status).length })).filter((item) => item.count > 0);
  const columns: Column<DemoLead>[] = [
    { key: "lead", header: "Lead", render: (lead) => <span className="person-cell"><span><strong>{lead.name}</strong><small>{lead.phone}</small></span></span> },
    { key: "source", header: "Origen", render: (lead) => lead.source },
    { key: "location", header: "Sede", render: (lead) => snapshot.locations.find((location) => location.id === lead.locationId)?.name ?? <Badge tone="amber">Sin asignar</Badge> },
    { key: "last", header: "Último contacto", render: (lead) => lead.lastContactAt ? date(lead.lastContactAt) : <span className="text-muted">Sin contacto</span> },
    { key: "status", header: "Estado", render: (lead) => { const label = ({ new: "Nuevo", contacted: "Contactado", scheduled: "Con cita", patient: "Paciente" } as const)[lead.status]; return <Badge tone={statusTone(label)}>{label}</Badge>; } },
    { key: "actions", header: "", render: () => <Link className="workspace-link" href="/pacientes?tab=leads">Abrir Leads <ArrowUpRight size={15} /></Link> },
  ];
  return <>
    <PageHeader title="Comercial" description="Leads, seguimiento y citas"><ScopeLabel>Escenario demo</ScopeLabel></PageHeader>
    <InsightBar eyebrow="Comercial" title="Leads" body="Origen y etapa actual del escenario. No representa conversión." source="Registros actuales · escenario demo" facts={[{ label: "Leads", value: String(snapshot.leads.length) }, { label: "Sin contacto", value: String(snapshot.leads.filter((lead) => !lead.lastContactAt).length) }, { label: "Con cita", value: String(snapshot.leads.filter((lead) => lead.status === "scheduled").length) }, { label: "Sin sede", value: String(snapshot.leads.filter((lead) => !lead.locationId).length) }]} />
    <section className="workspace-lead-analytics" aria-label="Origen y estado actual de leads">
      <article className="workspace-visual-panel"><header className="workspace-visual-panel__header"><div><span>CAPTACIÓN · DEMO</span><h2>Origen de los leads</h2></div><small>{snapshot.leads.length} registros</small></header><div className="workspace-lead-chart" role="img" aria-label={`Leads actuales por origen: ${sourceMix.map((item) => `${item.source}, ${item.count}`).join("; ")}`}><ResponsiveContainer width="100%" height="100%"><BarChart data={sourceMix} layout="vertical" margin={{ top: 6, right: 16, left: 8, bottom: 0 }} barCategoryGap="38%"><CartesianGrid horizontal={false} stroke="#E7EBEF" strokeDasharray="3 5" /><XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#65706F", fontSize: 11 }} /><YAxis type="category" dataKey="source" width={88} tickLine={false} axisLine={false} tick={{ fill: "#46514F", fontSize: 11 }} /><Tooltip formatter={(value) => [Number(value ?? 0), "Leads"]} /><Bar dataKey="count" name="Leads" fill="#176A63" radius={[0, 4, 4, 0]} maxBarSize={26} /></BarChart></ResponsiveContainer></div></article>
      <article className="workspace-visual-panel"><header className="workspace-visual-panel__header"><div><span>ESTADO ACTUAL · DEMO</span><h2>Etapa registrada</h2></div><small>Sin historial de conversión</small></header><div className="workspace-lead-chart" role="img" aria-label={`Leads por etapa actual: ${statusMix.map((item) => `${item.status}, ${item.count}`).join("; ")}`}><ResponsiveContainer width="100%" height="100%"><BarChart data={statusMix} layout="vertical" margin={{ top: 6, right: 16, left: 8, bottom: 0 }} barCategoryGap="38%"><CartesianGrid horizontal={false} stroke="#E7EBEF" strokeDasharray="3 5" /><XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#65706F", fontSize: 11 }} /><YAxis type="category" dataKey="status" width={88} tickLine={false} axisLine={false} tick={{ fill: "#46514F", fontSize: 11 }} /><Tooltip formatter={(value) => [Number(value ?? 0), "Leads"]} /><Bar dataKey="count" name="Leads" fill="#91B7AF" radius={[0, 4, 4, 0]} maxBarSize={26} /></BarChart></ResponsiveContainer></div></article>
    </section>
    <div className="workspace-toolbar"><div className="segmented-control">{([["all", "Todos"], ["new", "Nuevos"], ["contacted", "Contactados"], ["scheduled", "Con cita"]] as const).map(([value, label]) => <button className={filter === value ? "is-active" : ""} key={value} type="button" onClick={() => setFilter(value)}>{label}</button>)}</div></div>
    <section className="panel table-panel workspace-table"><DataTable columns={columns} rows={leads} rowKey={(lead) => lead.id} helpLabel={(lead) => lead.name} helpHref={() => "/pacientes?tab=leads"} emptyMessage="No hay leads con este filtro" /></section>
  </>;
}

function ProduccionView() {
  const { snapshot } = useOdontoRepository();
  const executions = snapshot.executions.map((execution) => ({ ...execution, patient: snapshot.patients.find((patient) => patient.id === snapshot.visits.find((visit) => visit.id === execution.visitId)?.patientId)?.name ?? "Paciente" })).sort((a, b) => b.executedAt.localeCompare(a.executedAt));
  const serviceMix = Array.from(executions.reduce((map, execution) => map.set(execution.serviceName, (map.get(execution.serviceName) ?? 0) + 1), new Map<string, number>()), ([service, count]) => ({ service, count }));
  const executionByDay = executions.reduce((totals, item) => {
    const day = demoDateKey(item.executedAt);
    totals.set(day, (totals.get(day) ?? 0) + toMoneyCents(item.price));
    return totals;
  }, new Map<string, number>());
  const executionDays: Array<{ day: string; value: number }> = [];
  const executionDates = [...executionByDay.keys()].sort();
  if (executionDates.length) {
    const cursor = new Date(`${executionDates[0]}T12:00:00Z`);
    const finalDay = executionDates.at(-1) ?? executionDates[0];
    while (cursor.toISOString().slice(0, 10) <= finalDay) {
      const key = cursor.toISOString().slice(0, 10);
      executionDays.push({ day: clinicDate(`${key}T12:00:00Z`, { weekday: "short", day: "numeric" }), value: (executionByDay.get(key) ?? 0) / 100 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  return <>
    <PageHeader title="Producción" description="Servicios que llegaron a ejecución clínica"><ScopeLabel>{executions.length} ejecuciones · demo</ScopeLabel></PageHeader>
    <InsightBar eyebrow="Ejecuciones clínicas" title="Trabajo realizado, no dinero cobrado" body="El valor suma el precio de servicios ejecutados en el escenario. Los cobros se consultan en Caja; el periodo visible es el rango real del conjunto." source={`${executions.length ? `${clinicDate(executions.reduce((min, item) => item.executedAt < min ? item.executedAt : min, executions[0].executedAt), { day: "numeric", month: "short" })}–${clinicDate(executions.reduce((max, item) => item.executedAt > max ? item.executedAt : max, executions[0].executedAt), { day: "numeric", month: "short", year: "numeric" })}` : "sin ejecuciones"} · ServiceExecution · demo`} facts={[{ label: "Servicios ejecutados", value: String(executions.length) }, { label: "Valor ejecutado", value: money(executions.reduce((sum, item) => sum + item.price, 0)) }, { label: "Con cargo", value: String(executions.filter((item) => item.chargeId).length) }, { label: "Fuente", value: "Demo" }]} />
    <section className="workspace-production-grid" aria-label="Análisis de producción">
      <article className="workspace-visual-panel"><header className="workspace-visual-panel__header"><div><span>COMPOSICIÓN DEL TRABAJO</span><h2>Ejecuciones por servicio</h2></div><small>{executions.length} servicios</small></header><div className="workspace-production-chart" role="img" aria-label={`Ejecuciones por servicio: ${serviceMix.map((item) => `${item.service}, ${item.count}`).join("; ")}`}><ResponsiveContainer width="100%" height="100%"><BarChart data={serviceMix} layout="vertical" margin={{ top: 8, right: 18, left: 14, bottom: 4 }} barCategoryGap="30%"><CartesianGrid horizontal={false} stroke="#E7EBEF" strokeDasharray="3 5" /><XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#65706F", fontSize: 11 }} /><YAxis type="category" dataKey="service" width={105} tickLine={false} axisLine={false} tick={{ fill: "#46514F", fontSize: 11 }} /><Tooltip formatter={(value) => [Number(value ?? 0), "Ejecuciones"]} /><Bar dataKey="count" name="Ejecuciones" fill="#176A63" radius={[0, 4, 4, 0]} maxBarSize={28} /></BarChart></ResponsiveContainer></div></article>
      <article className="workspace-visual-panel"><header className="workspace-visual-panel__header"><div><span>VALOR EJECUTADO</span><h2>Por fecha de servicio</h2></div><small>Importes diarios · demo</small></header><div className="workspace-production-chart" role="img" aria-label={`Valor de servicios ejecutados por día: ${executionDays.map((item) => `${item.day}, ${money(item.value)}`).join("; ")}`}><ResponsiveContainer width="100%" height="100%"><BarChart data={executionDays} margin={{ top: 10, right: 14, left: 6, bottom: 0 }}><CartesianGrid vertical={false} stroke="#E7EBEF" strokeDasharray="3 5" /><XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: "#65706F", fontSize: 11 }} /><YAxis width={60} tickLine={false} axisLine={false} tick={{ fill: "#65706F", fontSize: 10 }} tickFormatter={(value) => `S/ ${Number(value).toLocaleString("es-PE")}`} /><Tooltip formatter={(value) => [money(Number(value ?? 0)), "Valor ejecutado"]} /><Bar dataKey="value" name="Valor ejecutado" fill="#176A63" radius={[4, 4, 0, 0]} maxBarSize={36} /></BarChart></ResponsiveContainer></div></article>
    </section>
    <section className="panel table-panel workspace-table"><DataTable columns={[
      { key: "service", header: "Servicio", render: (item) => <span className="person-cell"><span><strong>{item.serviceName}</strong><small>{item.patient}</small></span></span> },
      { key: "date", header: "Ejecutado", render: (item) => date(item.executedAt) },
      { key: "price", header: "Valor", render: (item) => money(item.price) },
      { key: "visit", header: "Visita", render: (item) => <Link className="workspace-link" href={`/visitas/${item.visitId}`}>Abrir <ArrowUpRight size={15} /></Link> },
      { key: "charge", header: "Cargo", render: (item) => item.chargeId ? <Link className="workspace-link" href={`/caja?charge=${encodeURIComponent(item.chargeId)}`}>Abrir Caja <ArrowUpRight size={15} /></Link> : <Badge tone="amber">Pendiente</Badge> },
    ]} rows={executions} rowKey={(item) => item.id} helpLabel={(item) => `${item.serviceName} · ${item.patient}`} helpHref={(item) => item.chargeId ? `/caja?charge=${encodeURIComponent(item.chargeId)}` : "/produccion"} emptyMessage="Todavía no hay servicios ejecutados" /></section>
  </>;
}

function FinanzasView() {
  const { snapshot } = useOdontoRepository();
  const [periodKey, setPeriodKey] = useState<DemoFinancialPeriodKey>("all");
  const period = DEMO_FINANCIAL_PERIODS[periodKey];
  const summary = financialSummary(snapshot, period);
  const dayCount = Math.max(1, Math.round((new Date(`${period.to}T00:00:00Z`).getTime() - new Date(`${period.from}T00:00:00Z`).getTime()) / 86_400_000));
  const days = Array.from({ length: dayCount }, (_, index) => {
    const instant = new Date(`${period.from}T12:00:00Z`);
    instant.setUTCDate(instant.getUTCDate() + index);
    const key = instant.toISOString().slice(0, 10);
    const centsFor = (amounts: number[]) => amounts.reduce((sum, amount) => sum + toMoneyCents(amount), 0) / 100;
    return {
      key,
      day: new Intl.DateTimeFormat("es-PE", { weekday: "short", day: "numeric", timeZone: DEMO_TIME_ZONE }).format(instant),
      cargos: centsFor(summary.charges.filter((charge) => demoDateKey(charge.createdAt) === key).map((charge) => charge.amount)),
      cobros: centsFor(summary.payments.filter(({ payment }) => demoDateKey(payment.paidAt) === key).map(({ payment }) => payment.amount)),
    };
  });
  const formatCents = (cents: number) => new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100).replace("PEN", "S/");
  return <>
    <PageHeader title="Finanzas" description="Cargos y pagos por fecha; saldo vigente independiente del periodo"><ScopeLabel>{period.label} · datos demo</ScopeLabel></PageHeader>
    <div className="workspace-toolbar"><label className="field"><span>Periodo</span><select aria-label="Periodo" value={periodKey} onChange={(event) => setPeriodKey(event.target.value as DemoFinancialPeriodKey)}>{Object.entries(DEMO_FINANCIAL_PERIODS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label></div>
    <section className="workspace-visual-panel workspace-finance-trend" aria-label="Movimiento financiero por día"><header className="workspace-visual-panel__header"><div><span>LECTURA TEMPORAL</span><h2>Movimiento financiero</h2></div><div className="workspace-finance-summary"><strong>{formatCents(summary.outstandingCents)}</strong><small>Saldo vigente</small></div><div className="workspace-chart-legend"><span><i data-tone="charge" />Cargos por creación</span><span><i data-tone="payment" />Cobros por pago</span></div></header><div className="workspace-finance-chart" role="img" aria-label={`Cargos creados y cobros recibidos por fecha, ${period.label}: ${days.map((item) => `${item.day}: cargos ${formatCents(toMoneyCents(item.cargos))}, cobros ${formatCents(toMoneyCents(item.cobros))}`).join("; ")}`}><ResponsiveContainer width="100%" height="100%"><BarChart data={days} margin={{ top: 10, right: 18, left: 8, bottom: 0 }} barGap={3}><CartesianGrid vertical={false} stroke="#E7EBEF" strokeDasharray="3 5" /><XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: "#65706F", fontSize: 11 }} /><YAxis width={68} tickLine={false} axisLine={false} tick={{ fill: "#65706F", fontSize: 10 }} tickFormatter={(value) => `S/ ${Number(value).toLocaleString("es-PE")}`} /><Tooltip formatter={(value, name) => [formatCents(toMoneyCents(Number(value ?? 0))), String(name)]} /><Bar dataKey="cargos" name="Cargos creados" fill="#176A63" radius={[3, 3, 0, 0]} maxBarSize={24} /><Bar dataKey="cobros" name="Cobros recibidos" fill="#91B7AF" radius={[3, 3, 0, 0]} maxBarSize={24} /></BarChart></ResponsiveContainer></div></section>
    <section className="panel table-panel workspace-table workspace-finance-branches"><header className="workspace-visual-panel__header"><div><span>COMPARACIÓN POR UBICACIÓN</span><h2>Resumen por sede</h2></div><small>Saldo vigente al corte</small></header><DataTable columns={[
      { key: "location", header: "Sede", render: (branch) => <span className="request-type"><Landmark size={15} /><strong>{branch.location.name}</strong></span> },
      { key: "charges", header: `Cargos · ${period.label}`, render: (branch) => formatCents(branch.chargeCents) },
      { key: "payments", header: `Cobros · ${period.label}`, render: (branch) => formatCents(branch.paymentCents) },
      { key: "outstanding", header: "Saldo vigente", render: (branch) => formatCents(branch.outstandingCents) },
      { key: "action", header: "", render: (branch) => <Link className="workspace-link" href={`/caja?location=${encodeURIComponent(branch.location.id)}`}>Abrir Caja <ArrowUpRight size={15} /></Link> },
    ]} rows={summary.byLocation} rowKey={(branch) => branch.location.id} emptyMessage="No hay movimiento en este periodo" /></section>
  </>;
}

function AdministracionView() {
  const { snapshot } = useOdontoRepository();
  return <>
    <PageHeader title="Administración" description="Superficie preparada para autenticación y usuarios reales"><ScopeLabel>Futuro explícito</ScopeLabel></PageHeader>
    <section className="workspace-future"><ShieldCheck size={22} /><div><h2>Esta superficie no simula permisos</h2><p>La autorización real todavía pertenece al backend. El frontend deja el espacio y la lectura de auditoría listos, pero no inventa usuarios administrables.</p></div></section>
    <div className="workspace-grid workspace-grid--two"><article className="workspace-card"><div className="workspace-card__eyebrow"><ShieldCheck size={15} />Principio de seguridad</div><h2>Permisos, no nombres de rol</h2><p>El actor demo solo organiza navegación. La API será la autoridad cuando exista autenticación.</p></article><article className="workspace-card"><div className="workspace-card__eyebrow"><ListChecks size={15} />Auditoría demo</div><h2>{snapshot.auditEvents.length} eventos observables</h2><p>Los comandos locales dejan trazabilidad para probar los flujos antes de conectar usuarios reales.</p></article></div>
  </>;
}

function MiDiaView() {
  const { snapshot, dispatch } = useOdontoRepository();
  const [notice, setNotice] = useState("");
  const practitionerId = snapshot.actor.practitionerId;
  const appointments = snapshot.appointments.filter((item) => item.practitionerId === practitionerId && item.state === "confirmed").sort((a, b) => {
    const aUpcoming = new Date(a.startAt).getTime() >= new Date(DEMO_NOW).getTime();
    const bUpcoming = new Date(b.startAt).getTime() >= new Date(DEMO_NOW).getTime();
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
    return aUpcoming ? a.startAt.localeCompare(b.startAt) : b.startAt.localeCompare(a.startAt);
  });
  const activeAppointments = appointments.filter((appointment) => snapshot.visits.some((visit) => visit.appointmentId === appointment.id && visit.practitionerId === practitionerId && !visit.closedAt));
  const nextAppointment = appointments.find((appointment) => appointment.startAt >= DEMO_NOW && !snapshot.visits.some((visit) => visit.appointmentId === appointment.id));
  const focusAppointment = activeAppointments[0] ?? nextAppointment;
  const additionalActiveAppointments = activeAppointments.filter((appointment) => appointment.id !== focusAppointment?.id);
  const pendingRequests = snapshot.requests.filter((request) => request.createdBy === practitionerId && request.status !== "done");
  const priorAppointments = appointments.filter((appointment) => appointment.id !== focusAppointment?.id && (snapshot.visits.some((visit) => visit.appointmentId === appointment.id && visit.practitionerId === practitionerId && visit.closedAt) || new Date(appointment.endAt).getTime() < new Date(DEMO_NOW).getTime())).sort((a, b) => b.startAt.localeCompare(a.startAt));
  const laterAppointments = appointments.filter((appointment) => appointment.id !== focusAppointment?.id && !snapshot.visits.some((visit) => visit.appointmentId === appointment.id && visit.practitionerId === practitionerId) && new Date(appointment.endAt).getTime() >= new Date(DEMO_NOW).getTime()).sort((a, b) => a.startAt.localeCompare(b.startAt));
  const scopedVisits = snapshot.visits.filter((visit) => visit.practitionerId === practitionerId && appointments.some((appointment) => appointment.id === visit.appointmentId));
  const closedVisits = scopedVisits.filter((visit) => Boolean(visit.closedAt)).length;
  const missedAppointments = appointments.filter((appointment) => new Date(appointment.endAt).getTime() < new Date(DEMO_NOW).getTime() && !snapshot.visits.some((visit) => visit.appointmentId === appointment.id && visit.practitionerId === practitionerId)).length;
  const pulseDays: AppointmentPulseDay[] = Array.from(new Set(appointments.map((appointment) => demoDateKey(appointment.startAt)))).sort().map((day) => {
    const dayAppointments = appointments.filter((appointment) => demoDateKey(appointment.startAt) === day);
    const label = new Intl.DateTimeFormat("es-PE", { weekday: "short", day: "numeric", timeZone: DEMO_TIME_ZONE }).format(new Date(`${day}T12:00:00Z`));
    return {
      day,
      label: label.charAt(0).toUpperCase() + label.slice(1),
      attended: dayAppointments.filter((appointment) => snapshot.visits.some((visit) => visit.appointmentId === appointment.id && visit.practitionerId === practitionerId)).length,
      upcoming: dayAppointments.filter((appointment) => !snapshot.visits.some((visit) => visit.appointmentId === appointment.id && visit.practitionerId === practitionerId) && new Date(appointment.endAt).getTime() >= new Date(DEMO_NOW).getTime()).length,
      missed: dayAppointments.filter((appointment) => !snapshot.visits.some((visit) => visit.appointmentId === appointment.id && visit.practitionerId === practitionerId) && new Date(appointment.endAt).getTime() < new Date(DEMO_NOW).getTime()).length,
      cancelled: 0,
    };
  });
  const registerArrival = async (appointment: DemoAppointment) => { if (!appointment.patientId) return; const result = await dispatch({ type: "registerVisit", appointmentId: appointment.id, patientId: appointment.patientId }); setNotice(result.message); };
  const pulseRange = pulseDays.length ? `${pulseDays[0].label}–${pulseDays[pulseDays.length - 1].label}` : "sin citas";
  const renderAppointment = (appointment: DemoAppointment, featured = false) => {
    const visit = snapshot.visits.find((item) => item.appointmentId === appointment.id && item.practitionerId === practitionerId);
    const patient = snapshot.patients.find((item) => item.id === appointment.patientId);
    const location = snapshot.locations.find((item) => item.id === appointment.locationId);
    const pastWithoutVisit = new Date(appointment.endAt).getTime() < new Date(DEMO_NOW).getTime() && !visit;
    const canRegister = new Date(appointment.startAt).getTime() <= new Date(DEMO_NOW).getTime() && new Date(appointment.endAt).getTime() >= new Date(DEMO_NOW).getTime();
    const status = visit ? visit.closedAt ? "Atención cerrada" : featured ? "Atención en curso" : "Atención abierta" : pastWithoutVisit ? "No-show" : featured ? "Siguiente atención" : "Confirmada";
    return <article className={`${doctorHome.appointment} ${featured ? doctorHome.appointmentFeatured : ""}`} data-help-id={appointment.id} data-help-label={`${patient?.name ?? "Paciente pendiente"} · ${appointment.serviceName}`} key={appointment.id}>
      <div className={doctorHome.appointmentTime}><time>{clinicDate(appointment.startAt, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}</time><small>{clinicDate(appointment.startAt, { weekday: "short", day: "numeric", month: "short" })}</small></div>
      <div className={doctorHome.appointmentPatient}><strong>{patient?.name ?? "Paciente pendiente"}</strong><span>{appointment.serviceName}</span><small><MapPin size={13} />{location?.name ?? "Sede"}</small></div>
      <div className={doctorHome.appointmentAction}>
        <span className={`${doctorHome.status} ${pastWithoutVisit ? doctorHome.statusMissed : visit ? doctorHome.statusVisited : ""}`}>{status}</span>
        {visit ? <Link className="workspace-link" href={`/visitas/${visit.id}`}>{visit.closedAt ? "Ver registro" : "Abrir registro"}<ChevronRight size={15} /></Link> : pastWithoutVisit ? <span className={`${doctorHome.status} ${doctorHome.statusMissed}`}>Revisar con recepción</span> : canRegister ? <Button compact icon={Stethoscope} onClick={() => void registerArrival(appointment)}>Registrar llegada</Button> : null}
      </div>
    </article>;
  };
  return <>
    <PageHeader title="Mi día"><ScopeLabel>{snapshot.practitioners.find((item) => item.id === practitionerId)?.name ?? "Profesional"}</ScopeLabel></PageHeader>
    <ActionNotice message={notice} />
    <section className={doctorHome.dashboard}>
      <section className={doctorHome.agendaPanel} id="agenda-clinica" aria-label="Agenda clínica">
        <header className={doctorHome.panelHeader}><div><h2>Agenda clínica</h2><p>{pulseRange} · datos demo</p></div><span>{appointments.length} {appointments.length === 1 ? "cita" : "citas"}</span></header>
        {focusAppointment && renderAppointment(focusAppointment, true)}
        {!focusAppointment && <div className={doctorHome.emptyNext}>No tienes próximas citas</div>}
        {additionalActiveAppointments.length > 0 && <><h3 className={doctorHome.listHeading}>Atenciones abiertas</h3>{additionalActiveAppointments.map((appointment) => renderAppointment(appointment))}</>}
        {laterAppointments.length > 0 && <><h3 className={doctorHome.listHeading}>Siguientes</h3>{laterAppointments.map((appointment) => renderAppointment(appointment))}</>}
        {priorAppointments.length > 0 && <details className={doctorHome.historyDetails}><summary><span>Citas anteriores</span><strong>{priorAppointments.length}</strong></summary><div className={doctorHome.appointmentList}>{priorAppointments.map((appointment) => renderAppointment(appointment))}</div></details>}
        {!appointments.length && <div className={doctorHome.emptyNext}>No hay citas en tu agenda</div>}
      </section>
      <aside className={doctorHome.insights} aria-label="Resumen de jornada">
        <section className={doctorHome.metrics} aria-label="Resumen de actividad">
          <div><strong>{appointments.length}</strong><span>Citas</span></div>
          <div><strong>{closedVisits}</strong><span>Atención cerrada</span></div>
          <div><strong>{missedAppointments}</strong><span>No-show</span></div>
          <div><strong>{pendingRequests.length}</strong><span>Pendientes clínicos</span></div>
        </section>
        <section className={doctorHome.pendingPanel}>
          <header><h2>Pendientes clínicos</h2><Link href="/solicitudes">Ver todos<ArrowUpRight size={14} /></Link></header>
          {pendingRequests.length ? <div className={doctorHome.pendingList}>{pendingRequests.map((request) => <Link href="/solicitudes" className={doctorHome.pendingRow} key={request.id}>
            <span className={doctorHome.pendingIcon}>{request.type === "laboratory" ? <FlaskConical size={17} /> : <ClipboardCheck size={17} />}</span>
            <span><strong>{request.title}</strong><small>{snapshot.patients.find((patient) => patient.id === request.patientId)?.name ?? "Paciente"} · {request.status === "open" ? "Abierta" : "En progreso"}</small></span><ChevronRight size={16} />
          </Link>)}</div> : <div className={doctorHome.pendingEmpty}>Sin pendientes clínicos</div>}
        </section>
        <a className={doctorHome.dayLink} href="#agenda-clinica"><span className={doctorHome.dayIcon}><CalendarDays size={20} /></span><span><strong>Día en curso</strong><small>{clinicDate(DEMO_NOW, { weekday: "long", day: "numeric", month: "long" })}</small></span><span>Ver jornada <ChevronRight size={15} /></span></a>
      </aside>
    </section>
    <section className={doctorHome.analyticsGrid} aria-label="Lectura clínica de la semana">
      <AppointmentPulse title="Ritmo de la semana" detail={`${pulseRange} · citas, visitas y no-show · demo`} days={pulseDays} visibleSeries={["attended", "upcoming", "missed"]} size="large" />
      <ServiceMixPulse appointments={appointments} title="Agenda por servicio" detail="Citas confirmadas · misma semana" size="large" />
    </section>
  </>;
}

export function DoctorHomeView() {
  if (!useMocks) return <ApiUnavailable title="Mi día" body="La sesión no identifica al profesional ni devuelve su alcance autorizado." />;
  return <MiDiaView />;
}

function MisPacientesView() {
  const { snapshot } = useOdontoRepository();
  const practitionerId = snapshot.actor.practitionerId;
  const patients = snapshot.patients.filter((patient) => patient.practitionerId === practitionerId);
  return <>
    <PageHeader title="Mis pacientes" description="Tratamientos activos, próximos hitos y documentación clínica"><ScopeLabel>{patients.length} pacientes asignados</ScopeLabel></PageHeader>
    {patients.length ? <section className="workspace-grid workspace-grid--two">{patients.map((patient) => { const visits = snapshot.visits.filter((visit) => visit.patientId === patient.id && visit.practitionerId === practitionerId); const next = snapshot.appointments.find((appointment) => appointment.patientId === patient.id && appointment.practitionerId === practitionerId && appointment.state === "confirmed" && new Date(appointment.startAt).getTime() >= new Date(DEMO_NOW_LOCAL).getTime()); return <article className="workspace-card workspace-card--patient" data-help-id={patient.id} data-help-label={patient.name} key={patient.id}><div className="workspace-card__eyebrow"><Stethoscope size={15} />{patient.treatment}</div><h2>{patient.name}</h2><p>{patient.phone}</p><div className="workspace-stat-row"><span>Visitas</span><strong>{visits.length}</strong></div><div className="workspace-stat-row"><span>Próximo hito</span><strong>{next?.serviceName ?? "Sin cita"}</strong></div><Link className="workspace-link" href={visits[0] ? `/visitas/${visits[0].id}` : "/mi-dia"}>Abrir historia <ArrowUpRight size={15} /></Link></article>; })}</section> : <EmptyState title="Aún no tienes pacientes asignados" body="Los pacientes vinculados a tu perfil aparecerán aquí cuando su asignación esté disponible." />}
  </>;
}

const DEMO_NOW_LOCAL = DEMO_NOW;

function SolicitudesView() {
  const { snapshot, dispatch } = useOdontoRepository();
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<"all" | DemoRequest["type"]>("all");
  const canUpdateRequests = hasCapability(snapshot.actor.role, "requests.update");
  const canCreateLabs = hasCapability(snapshot.actor.role, "labs.create");
  const visible = snapshot.requests.filter((request) => snapshot.actor.role === "collaborator" ? request.createdBy === snapshot.actor.practitionerId : snapshot.actor.role === "owner" ? true : snapshot.patients.find((patient) => patient.id === request.patientId)?.locationId === snapshot.actor.locationId);
  const rows = visible.filter((request) => filter === "all" || request.type === filter).sort((left, right) => {
    if ((left.status === "done") !== (right.status === "done")) return left.status === "done" ? 1 : -1;
    return left.createdAt.localeCompare(right.createdAt);
  });
  const openCount = visible.filter((request) => request.status === "open").length;
  const progressCount = visible.filter((request) => request.status === "in_progress").length;
  const doneCount = visible.filter((request) => request.status === "done").length;
  const requestTrend = Array.from({ length: 7 }, (_, index) => {
    const day = new Date("2026-08-10T12:00:00Z");
    day.setUTCDate(day.getUTCDate() + index);
    const key = day.toISOString().slice(0, 10);
    return {
      day: clinicDate(`${key}T12:00:00.000Z`, { weekday: "short", day: "numeric" }),
      count: visible.filter((request) => demoDateKey(request.createdAt) === key).length,
    };
  });
  const pendingAge = [
    { label: "< 24 h", count: visible.filter((request) => { const age = new Date(DEMO_NOW).getTime() - new Date(request.createdAt).getTime(); return request.status !== "done" && age >= 0 && age < 86_400_000; }).length },
    { label: "1–3 días", count: visible.filter((request) => { const age = new Date(DEMO_NOW).getTime() - new Date(request.createdAt).getTime(); return request.status !== "done" && age >= 86_400_000 && age < 259_200_000; }).length },
    { label: "> 3 días", count: visible.filter((request) => request.status !== "done" && new Date(DEMO_NOW).getTime() - new Date(request.createdAt).getTime() >= 259_200_000).length },
  ];
  const update = async (request: DemoRequest) => { const result = await dispatch({ type: "updateRequest", requestId: request.id, status: request.status === "open" ? "in_progress" : "done" }); setNotice(result.message); };
  const createLab = async (request: DemoRequest) => { const result = await dispatch({ type: "createLabOrder", requestId: request.id, patientId: request.patientId, dueAt: "2026-08-18T17:00:00.000Z" }); setNotice(result.message); };
  const columns: Column<DemoRequest>[] = [
    { key: "type", header: "Tipo", width: "13%", render: (request) => <span className="request-type">{request.type === "laboratory" ? <FlaskConical size={15} /> : <ClipboardCheck size={15} />}{request.type === "laboratory" ? "Laboratorio" : request.type === "clinical" ? "Clínica" : "Administrativa"}</span> },
    { key: "request", header: "Solicitud", width: "32%", render: (request) => <strong>{request.title}</strong> },
    { key: "patient", header: "Paciente", width: "18%", render: (request) => snapshot.patients.find((patient) => patient.id === request.patientId)?.name ?? "Paciente" },
    { key: "date", header: "Fecha", width: "16%", render: (request) => date(request.createdAt) },
    { key: "status", header: "Estado", width: "11%", render: (request) => <Badge tone={statusTone(request.status === "open" ? "Abierta" : request.status === "in_progress" ? "En curso" : "Completada")}>{request.status === "open" ? "Abierta" : request.status === "in_progress" ? "En curso" : "Completada"}</Badge> },
    { key: "action", header: "", width: "10%", render: (request) => { const lab = snapshot.labOrders.find((item) => item.requestId === request.id); return <div className="request-actions">{canUpdateRequests && request.status !== "done" && <Button compact variant="primary" icon={Check} onClick={() => void update(request)}>{request.status === "open" ? "Avanzar" : "Resolver"}</Button>}{canCreateLabs && request.type === "laboratory" && !lab && <Button compact icon={Beaker} onClick={() => void createLab(request)}>Crear orden</Button>}{lab && <span className="text-muted">{lab.status === "requested" ? "Orden enviada" : lab.status === "received" ? "Recibida" : "Lista"}</span>}</div>; } },
  ];
  return <>
    <PageHeader title="Solicitudes"><ScopeLabel>{visible.length} · escenario demo</ScopeLabel></PageHeader>
    <section className="request-flow" aria-label="Estado de solicitudes">
      <div className="request-flow__header"><strong>Estado actual</strong><span>{visible.length} solicitudes · clínica y laboratorio</span></div>
      <div className="request-flow__track" aria-hidden="true">{([["open", openCount], ["progress", progressCount], ["done", doneCount]] as const).filter(([, count]) => count > 0).map(([key, count]) => <i key={key} data-tone={key} style={{ flex: count }} />)}</div>
      <div className="request-flow__legend"><span><i data-tone="open" />Abiertas <strong>{openCount}</strong></span><span><i data-tone="progress" />En curso <strong>{progressCount}</strong></span><span><i data-tone="done" />Completadas <strong>{doneCount}</strong></span></div>
    </section>
    <section className="request-analytics" aria-label="Lectura de la cola">
      <article className="request-chart">
        <header><div><span>ENTRADAS</span><h2>Solicitudes recibidas</h2></div><small>10–16 ago · demo</small></header>
        <div className="request-chart__plot" role="img" aria-label={`Solicitudes recibidas por día: ${requestTrend.map((item) => `${item.day}, ${item.count}`).join("; ")}`}>
          <ResponsiveContainer width="100%" height="100%"><BarChart data={requestTrend} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#E7EBEF" strokeDasharray="3 5" />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: "#65706F", fontSize: 11 }} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} tick={{ fill: "#65706F", fontSize: 10 }} />
            <Tooltip cursor={{ fill: "#F3F7F6" }} formatter={(value) => [Number(value ?? 0), "Recibidas"]} />
            <Bar dataKey="count" name="Recibidas" fill="#176A63" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart></ResponsiveContainer>
        </div>
      </article>
      <article className="request-chart">
        <header><div><span>COLA ABIERTA · {openCount + progressCount}</span><h2>Antigüedad</h2></div><small>Desde creación</small></header>
        <div className="request-age" role="img" aria-label={`Antigüedad de solicitudes abiertas: ${pendingAge.map((item) => `${item.label}: ${item.count}`).join(", ")}`}>
          {pendingAge.map((item) => <div className="request-age__row" key={item.label}><span>{item.label}</span><div><i style={{ width: `${(item.count / Math.max(1, openCount + progressCount)) * 100}%` }} /></div><strong>{item.count}</strong></div>)}
        </div>
      </article>
    </section>
    <ActionNotice message={notice} />
    <div className="workspace-toolbar"><div className="segmented-control">{(["all", "clinical", "laboratory", "administrative"] as const).map((value) => { const count = value === "all" ? visible.length : visible.filter((request) => request.type === value).length; if (value !== "all" && count === 0) return null; const label = value === "all" ? "Todas" : value === "clinical" ? "Clínicas" : value === "laboratory" ? "Laboratorio" : "Administrativas"; return <button className={filter === value ? "is-active" : ""} key={value} type="button" onClick={() => setFilter(value)}>{label} <span>{count}</span></button>; })}</div></div>
    {rows.length ? <section className="panel table-panel workspace-table"><DataTable columns={columns} rows={rows} rowKey={(request) => request.id} helpLabel={(request) => request.title} emptyMessage="No hay solicitudes con este filtro" /></section> : <EmptyState title="No hay solicitudes en tu alcance" body="La cola se actualizará cuando haya una solicitud asignada." />}
  </>;
}

export function WorkspacePage({ view }: { view: WorkspaceView }) {
  if (!useMocks) {
    const unavailable: Record<WorkspaceView, string> = {
      sedes: "La API todavía no entrega el agregado global por sede y el detalle filtrado que esta vista necesita.",
      comercial: "La API no proyecta historial comercial, asignación de sede ni fecha de alta del lead.",
      produccion: "La API no ofrece el agregado de ejecuciones clínicas por periodo y profesional.",
      finanzas: "Esta lectura consolidada requiere el contrato agregado financiero acordado para Owner.",
      administracion: "Una sesión humana con permisos del backend todavía no está conectada.",
      "mi-dia": "La sesión no identifica al profesional ni devuelve su alcance autorizado.",
      "mis-pacientes": "La API no devuelve el vínculo de pacientes con profesional y sede para esta vista.",
      solicitudes: "La API aún no dispone de contratos para solicitudes y órdenes de laboratorio.",
    };
    const titles: Record<WorkspaceView, string> = { sedes: "Sedes", comercial: "Comercial", produccion: "Producción", finanzas: "Finanzas", administracion: "Administración", "mi-dia": "Mi día", "mis-pacientes": "Mis pacientes", solicitudes: "Solicitudes" };
    return <ApiUnavailable title={titles[view]} body={unavailable[view]} />;
  }
  const content = (() => { switch (view) {
    case "sedes": return <SedesView />;
    case "comercial": return <ComercialView />;
    case "produccion": return <ProduccionView />;
    case "finanzas": return <FinanzasView />;
    case "administracion": return <AdministracionView />;
    case "mi-dia": return <MiDiaView />;
    case "mis-pacientes": return <MisPacientesView />;
    case "solicitudes": return <SolicitudesView />;
  } })();
  return <section className={`page workspace-page${view === "solicitudes" ? " workspace-page--requests" : ""}`}>{content}</section>;
}

export function AttentionPage({ visitId }: { visitId: string }) {
  const { snapshot } = useOdontoRepository();
  if (!useMocks) return <ApiUnavailable title="Atención" body="La API y la sesión actual no aportan el actor ni el vínculo paciente-visita necesarios para mostrar información clínica." />;
  const detail = detailForVisit(snapshot, visitId);
  if (!detail) return <section className="page workspace-page"><EmptyState title="Visita no encontrada" body="Atención solo se abre desde una fila con visita registrada." /></section>;
  const execution = detail.executions[0];
  const charge = execution?.chargeId ? snapshot.charges.find((item) => item.id === execution.chargeId) : undefined;
  const paid = charge ? snapshot.payments.filter((payment) => payment.chargeId === charge.id).reduce((sum, payment) => sum + payment.amount, 0) : 0;
  return <section className="page workspace-page">
    <PageHeader title="Atención" description="Contexto operativo de una visita, sin cobrar desde aquí"><Link className="workspace-back" href={snapshot.actor.role === "collaborator" ? "/mi-dia" : "/agenda"}>Volver</Link></PageHeader>
    <InsightBar eyebrow="Encuentro clínico" title={`${detail.patient.name}: ${execution ? "cargo creado" : "servicio pendiente"}`} body="El Administrativo acompaña el flujo. La ejecución del servicio la completa el Doctor y el pago ocurre únicamente en Caja." source="Visit + ServiceExecution + Charge · demo" facts={[{ label: "Paciente", value: detail.patient.name }, { label: "Visita", value: detail.visit.id }, { label: "Cargo", value: charge ? money(charge.amount) : "Aún no existe" }, { label: "Pagado", value: charge ? money(paid) : "-" }]} />
    <section className="workspace-stepper"><div className="workspace-stepper__node is-done">Cita</div><div className="workspace-stepper__node is-done">Visita</div><div className={`workspace-stepper__node ${execution ? "is-done" : ""}`}>Servicio</div><div className={`workspace-stepper__node ${charge ? "is-done" : ""}`}>Cargo</div></section>
    <div className="workspace-grid workspace-grid--two"><article className="workspace-card"><div className="workspace-card__eyebrow"><ClipboardCheck size={15} />Estado operativo</div><h2>{execution ? "Servicio completado" : "Esperando cierre clínico"}</h2><p>{execution ? "El cargo está disponible en Caja. Atención no registra pagos." : "El Doctor debe completar la ejecución desde Registro clínico."}</p>{charge && <Link className="workspace-link" href={snapshot.actor.role === "owner" ? "/finanzas" : "/caja"}>Ver cargo <ArrowUpRight size={15} /></Link>}</article><article className="workspace-card"><div className="workspace-card__eyebrow"><UserRoundIcon />Paciente</div><h2>{detail.patient.name}</h2><p>{detail.appointment?.serviceName ?? detail.patient.treatment} · {snapshot.locations.find((item) => item.id === detail.visit.locationId)?.name}</p>{snapshot.actor.role === "collaborator" && <Link className="workspace-link" href={`/visitas/${detail.visit.id}`}>Abrir registro clínico <ArrowUpRight size={15} /></Link>}</article></div>
  </section>;
}

function UserRoundIcon() { return <Stethoscope size={15} />; }

export function VisitRecordPage({ visitId }: { visitId: string }) {
  const router = useRouter();
  const { snapshot, dispatch } = useOdontoRepository();
  const isAdmin = snapshot.actor.role === "admin";
  const mayReadRecord = snapshot.actor.role === "collaborator";
  const detail = mayReadRecord ? detailForVisit(snapshot, visitId) : null;
  const visitInScope = detail && mayReadRecord && canAccessClinicalVisit(snapshot.actor.role, snapshot.actor.practitionerId, detail.visit.practitionerId);
  const [note, setNote] = useState(visitInScope ? detail.record?.note ?? "" : "");
  const [consentRecorded, setConsentRecorded] = useState(Boolean(visitInScope && detail.record?.consent === "recorded"));
  const [notice, setNotice] = useState("");
  useEffect(() => {
    setNote(visitInScope ? detail?.record?.note ?? "" : "");
    setConsentRecorded(Boolean(visitInScope && detail?.record?.consent === "recorded"));
  }, [visitId, detail?.record?.note, detail?.record?.consent, visitInScope]);
  useEffect(() => { setNotice(""); }, [visitId]);
  if (!useMocks) return <ApiUnavailable title="Registro clínico" body="El backend todavía no ofrece un contrato de historia clínica autorizado. No se almacenan notas clínicas en el navegador." />;
  if (isAdmin) return <section className="page workspace-page"><PageHeader title="Registro clínico" description="Acceso reservado al Doctor"><Button compact onClick={() => router.push("/agenda")}>Volver a Agenda</Button></PageHeader><EmptyState title="El registro clínico es confidencial" body="Desde Agenda puedes continuar con la gestión de la cita. Las notas clínicas están disponibles únicamente para el profesional tratante." /></section>;
  if (!detail) return <section className="page workspace-page"><EmptyState title="Registro no encontrado" body="El registro clínico se abre desde Mi día o Mis pacientes." /></section>;
  if (!visitInScope) return <section className="page workspace-page"><EmptyState title="Registro fuera de tu alcance" body="Solo puedes consultar visitas asignadas a tu perfil clínico." /></section>;
  const appointment = detail.appointment;
  const execution = detail.executions[0];
  const save = async () => { const result = await dispatch({ type: "updateClinicalRecord", visitId, patientId: detail.patient.id, note, consent: consentRecorded ? "recorded" : "missing" }); setNotice(result.message); };
  const complete = async () => {
    if (!appointment || !Number.isFinite(appointment.amount) || appointment.amount <= 0) {
      setNotice("No hay un precio acordado para completar este servicio.");
      return;
    }
    const result = await dispatch({ type: "completeService", visitId, serviceId: appointment.serviceId, serviceName: appointment.serviceName, price: appointment.amount });
    setNotice(result.message);
  };
  const request = async () => { const result = await dispatch({ type: "createRequest", patientId: detail.patient.id, requestType: "clinical", title: "Revisar evolución clínica" }); setNotice(result.message); };
  return <section className="page workspace-page">
    <PageHeader title={detail.patient.name} description={`Registro clínico · ${appointment?.serviceName ?? detail.patient.treatment} · ${snapshot.locations.find((item) => item.id === detail.visit.locationId)?.name ?? "Sede no disponible"}`}><Button compact onClick={() => router.back()}>Volver</Button></PageHeader>
    <ActionNotice message={notice} />
    <div className="workspace-grid workspace-grid--two"><section className="workspace-card workspace-card--dark"><div className="workspace-card__eyebrow"><Stethoscope size={15} />Cierre clínico</div><h2>{execution ? "Servicio completado" : "Evolución pendiente"}</h2><p>{appointment?.serviceName ?? detail.patient.treatment} · {snapshot.locations.find((item) => item.id === detail.visit.locationId)?.name}</p><div className="workspace-actions">{!execution && <Button variant="primary" icon={Check} disabled={!appointment || appointment.amount <= 0} onClick={() => void complete()}>Completar servicio</Button>}<Button compact icon={ClipboardCheck} onClick={() => void request()}>Crear solicitud</Button></div>{!execution && (!appointment || appointment.amount <= 0) && <p role="note">No hay precio acordado; no se generará un cargo.</p>}</section><section className="workspace-card"><div className="workspace-card__eyebrow"><ClipboardCheck size={15} />Evolución</div><label className="field"><span>Nota clínica</span><textarea className="workspace-textarea" rows={8} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Escribe la evolución de la atención…" /></label><label className="workspace-consent"><input type="checkbox" checked={consentRecorded} onChange={(event) => setConsentRecorded(event.target.checked)} />Consentimiento documentado</label><div className="workspace-actions"><Button variant="primary" onClick={() => void save()}>Guardar evolución</Button></div></section></div>
  </section>;
}
