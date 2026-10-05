"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, ClipboardCheck, Phone, Stethoscope, WalletCards } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  chargeTotals,
  confirmationQueue,
  DEMO_FINANCIAL_PERIODS,
  demoDateKey,
  demoMomentLabel,
  DEMO_NOW,
  DEMO_TIME_ZONE,
  financialSummary,
  noShows,
  toMoneyCents,
  useMocks,
  useOdontoRepository,
  type DemoAppointment,
} from "../api";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { DataTable, type Column } from "../components/DataTable";
import { AppointmentPulse, type AppointmentPulseDay } from "../components/AppointmentPulse";
import { ServiceMixPulse } from "../components/ServiceMixPulse";
import { PageHeader } from "../components/PageHeader";
import { useDemoRole } from "../roles";
import { DoctorHomeView } from "./WorkspacePage";
import styles from "./OwnerDashboard.module.css";
import adminStyles from "./AdminHome.module.css";

function money(value: number): string {
  return `S/ ${value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function demoDateLabel(): string {
  const label = new Intl.DateTimeFormat("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: DEMO_TIME_ZONE,
  }).format(new Date(DEMO_NOW));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function OwnerHome() {
  const { snapshot } = useOdontoRepository();
  const [locationFilter, setLocationFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [selectedMeasure, setSelectedMeasure] = useState<"charges" | "payments">("charges");
  const [selectedPoint, setSelectedPoint] = useState<{ day: string; measure: "charges" | "payments" } | null>(null);

  // Global API analytics are intentionally hidden until the backend provides
  // the aggregated read and a matching paginated drill-down contract.
  if (!useMocks) {
    return <section className={`page ${styles.page}`}>
      <PageHeader title="Inicio"><span className="workspace-scope"><span className="workspace-scope__dot" />Owner · todas las sedes</span></PageHeader>
      <section className={styles.unavailable} aria-labelledby="owner-analytics-unavailable">
        <span className={styles.unavailableMark} aria-hidden="true">—</span>
        <div><h2 id="owner-analytics-unavailable">Analítica global no disponible</h2><p>El servicio todavía no entrega agregados por periodo y sede. No mostramos listas parciales como si fueran totales.</p></div>
        <span className={styles.sourcePill}>API · sin agregado</span>
      </section>
    </section>;
  }
  if (snapshot.status === "loading") return <section className={`page ${styles.page}`}><PageHeader title="Inicio" /><div className={styles.statePanel} role="status"><span className={styles.stateMark} /><strong>Preparando la lectura del periodo…</strong><span>Conservamos los filtros y la estructura del tablero mientras cargan los datos.</span></div></section>;
  if (snapshot.status === "error") return <section className={`page ${styles.page}`}><PageHeader title="Inicio" /><div className={`${styles.statePanel} ${styles.stateError}`} role="alert"><span className={styles.stateMark} aria-hidden="true" /><strong>No se pudo cargar la analítica</strong><span>{snapshot.errorMessage ?? "Intenta actualizar la vista."}</span></div></section>;

  const period = DEMO_FINANCIAL_PERIODS[periodFilter as keyof typeof DEMO_FINANCIAL_PERIODS];
  const financial = financialSummary(snapshot, period, locationFilter === "all" ? undefined : locationFilter);
  const charges = financial.charges;
  const payments = financial.payments;
  const locationIds = new Set(snapshot.locations.filter((location) => locationFilter === "all" || location.id === locationFilter).map((location) => location.id));
  const chargeCents = financial.chargeCents;
  const paymentCents = financial.paymentCents;
  const currentBalanceCents = financial.outstandingCents;
  const locationMatrix = financial.byLocation.map((item) => ({ location: item.location, emitted: item.chargeCents, collected: item.paymentCents }));
  const toCents = toMoneyCents;
  const inRange = (instant: string) => {
    const day = demoDateKey(instant);
    return day >= period.from && day < period.to;
  };
  const formatCents = (cents: number) => new Intl.NumberFormat("es-PE", {
    style: "currency", currency: "PEN", minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(cents / 100).replace("PEN", "S/");
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${period.from}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  }).filter((day) => day < period.to);
  const chartData = dates.map((day) => {
    const label = new Intl.DateTimeFormat("es-PE", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
    return {
      day,
      label: label.charAt(0).toUpperCase() + label.slice(1),
      charges: charges.filter((charge) => demoDateKey(charge.createdAt) === day).reduce((sum, charge) => sum + toCents(charge.amount), 0),
      payments: payments.filter(({ payment }) => demoDateKey(payment.paidAt) === day).reduce((sum, item) => sum + toCents(item.payment.amount), 0),
    };
  });
  const serviceMix = snapshot.executions.reduce<Array<{ name: string; amount: number; serviceId: string }>>((rows, execution) => {
    const charge = charges.find((item) => item.executionId === execution.id);
    if (!charge) return rows;
    const current = rows.find((row) => row.serviceId === execution.serviceId);
    if (current) current.amount += toCents(charge.amount);
    else rows.push({ name: execution.serviceName, amount: toCents(charge.amount), serviceId: execution.serviceId });
    return rows;
  }, []).sort((a, b) => b.amount - a.amount);
  const totals = { outstanding: currentBalanceCents };

  const drilldownItems = selectedPoint?.measure === "charges"
    ? charges.filter((charge) => demoDateKey(charge.createdAt) === selectedPoint.day).map((charge) => ({ charge, value: toCents(charge.amount) }))
    : selectedPoint?.measure === "payments"
      ? payments.filter(({ payment }) => demoDateKey(payment.paidAt) === selectedPoint.day).map(({ payment }) => ({ charge: snapshot.charges.find((charge) => charge.id === payment.chargeId), value: toCents(payment.amount) })).filter((item): item is { charge: NonNullable<typeof item.charge>; value: number } => Boolean(item.charge))
      : [];
  const selectedDayLabel = selectedPoint ? new Intl.DateTimeFormat("es-PE", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${selectedPoint.day}T12:00:00Z`)) : "";
  const balanceRows = snapshot.charges.filter((charge) => locationIds.has(charge.locationId))
    .map((charge) => ({
      charge,
      paidCents: snapshot.payments
        .filter((payment) => payment.chargeId === charge.id)
        .reduce((sum, payment) => sum + toCents(payment.amount), 0),
    }))
    .map((item) => ({ ...item, balanceCents: Math.max(0, toCents(item.charge.amount) - item.paidCents) }))
    .filter((item) => item.balanceCents > 0);
  const overdueVisits = noShows(snapshot).filter((appointment) => locationIds.has(appointment.locationId) && inRange(appointment.startAt));
  const cancelled = snapshot.appointments.filter((appointment) => appointment.state === "cancelled" && locationIds.has(appointment.locationId) && inRange(appointment.startAt));
  type QueueItem = {
    id: string;
    title: string;
    detail: string;
    amount?: string;
    href: string;
  };
  const balanceQueue: QueueItem[] = balanceRows.map(({ charge, balanceCents }) => ({
      id: `charge-${charge.id}`,
      title: snapshot.patients.find((patient) => patient.id === charge.patientId)?.name ?? "Paciente",
      detail: `${snapshot.locations.find((location) => location.id === charge.locationId)?.name ?? "Sede"} · saldo abierto`,
      amount: formatCents(balanceCents),
      href: `/caja?charge=${charge.id}`,
  }));
  const noShowQueue: QueueItem[] = overdueVisits.map((appointment) => ({
      id: `noshow-${appointment.id}`,
      title: snapshot.patients.find((patient) => patient.id === appointment.patientId)?.name ?? "Paciente",
      detail: `${snapshot.locations.find((location) => location.id === appointment.locationId)?.name ?? "Sede"} · ${appointment.serviceName}`,
      href: `/agenda?appointment=${encodeURIComponent(appointment.id)}`,
  }));
  const cancellationQueue: QueueItem[] = cancelled.map((appointment) => ({
      id: `cancelled-${appointment.id}`,
      title: snapshot.patients.find((patient) => patient.id === appointment.patientId)?.name ?? "Paciente",
      detail: `${snapshot.locations.find((location) => location.id === appointment.locationId)?.name ?? "Sede"} · ${appointment.serviceName}`,
      href: `/agenda?appointment=${encodeURIComponent(appointment.id)}`,
  }));
  const selectedSeries = selectedMeasure === "charges" ? "Cargos creados" : "Cobros recibidos";
  const selectedSeriesKey = selectedMeasure;
  const selectedSeriesTotal = selectedMeasure === "charges" ? chargeCents : paymentCents;
  const peakDay = chartData.reduce<(typeof chartData)[number] | null>((peak, row) => row[selectedSeriesKey] > (peak?.[selectedSeriesKey] ?? 0) ? row : peak, null);

  return (
    <section className={`page workspace-page ${styles.page}`}>
      <PageHeader title="Inicio">
        <span className="workspace-scope"><span className="workspace-scope__dot" />Owner · demo local</span>
        <span className={styles.demoTag}>ESCENARIO DEMO · DATOS LOCALES</span>
      </PageHeader>
      <section className={styles.headerBand} aria-label="Filtros de analítica">
        <span className={styles.bandLabel}>Filtros</span>
        <div className={styles.filters}>
          <label><span>Periodo</span><select aria-label="Periodo" value={periodFilter} onChange={(event) => { setPeriodFilter(event.target.value); setSelectedPoint(null); }}><option value="all">10–16 ago</option><option value="early">10–12 ago</option><option value="late">13–16 ago</option></select></label>
          <label><span>Sede</span><select aria-label="Sede" value={locationFilter} onChange={(event) => { setLocationFilter(event.target.value); setSelectedPoint(null); }}><option value="all">Todas las sedes</option>{snapshot.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        </div>
      </section>
      <section className={styles.analysisGrid}>
        <div className={styles.chartPanel}>
          <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Movimiento financiero</span><h2>{selectedSeries}, por día</h2></div><span>S/ · {period.label}</span></div>
          <div className={styles.seriesSwitch} role="group" aria-label="Serie financiera">
            <button type="button" aria-pressed={selectedMeasure === "charges"} onClick={() => { setSelectedMeasure("charges"); setSelectedPoint(null); }}><span>Cargos creados</span><strong>{formatCents(chargeCents)}</strong><small>Fecha de creación</small></button>
            <button type="button" aria-pressed={selectedMeasure === "payments"} onClick={() => { setSelectedMeasure("payments"); setSelectedPoint(null); }}><span>Cobros recibidos</span><strong>{formatCents(paymentCents)}</strong><small>Fecha de pago</small></button>
          </div>
          {selectedSeriesTotal ? <div className={styles.chart} aria-label={`${selectedSeries} por día, ${period.label}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 14, right: 14, left: 4, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke="#E7EBEF" strokeDasharray="3 5" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#65706F", fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} width={72} tick={{ fill: "#65706F", fontSize: 12 }} tickFormatter={(value: number) => `S/ ${Math.round(value / 100)}`} domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.15)]} />
                <Tooltip cursor={{ fill: "#F3F7F6" }} formatter={(value) => [formatCents(Number(value ?? 0)), selectedSeries]} labelFormatter={(_, rows) => rows[0]?.payload?.day ?? ""} />
                <Bar dataKey={selectedMeasure} name={selectedSeries} fill={selectedMeasure === "charges" ? "#176A63" : "#A34F91"} radius={[4, 4, 0, 0]} maxBarSize={42} onClick={(point) => setSelectedPoint({ day: point.payload?.day ?? "", measure: selectedMeasure })} cursor="pointer" />
              </BarChart>
            </ResponsiveContainer>
          </div> : <div className={styles.chartEmpty}><strong>Sin {selectedSeries.toLowerCase()} en este filtro</strong><span>No hay movimientos de esta serie en {period.label} para esta sede.</span></div>}
          <div className={styles.insight} aria-live="polite"><span className={styles.eyebrow}>Lectura del filtro</span>{peakDay && peakDay[selectedSeriesKey] > 0 ? <p>Mayor importe diario de {selectedSeries.toLowerCase()}: <strong>{peakDay.label}</strong>, {formatCents(peakDay[selectedSeriesKey])}.</p> : <p>No hay valores para resumir en esta serie.</p>}<small>{selectedSeries} · {period.label} · {locationFilter === "all" ? "todas las sedes" : snapshot.locations.find((location) => location.id === locationFilter)?.name}</small></div>
          <details className={styles.accessibleTable}>
            <summary>Ver valores y detalle diario</summary>
            <table><caption className="sr-only">{selectedSeries} diarios en soles</caption><thead><tr><th scope="col">Día</th><th scope="col">{selectedSeries}</th><th scope="col">Detalle</th></tr></thead><tbody>{chartData.map((row) => <tr key={row.day}><th scope="row">{row.label}</th><td>{formatCents(row[selectedSeriesKey])}</td><td><button type="button" aria-label={`Abrir ${selectedSeries.toLowerCase()} del ${row.label}`} disabled={!row[selectedSeriesKey]} onClick={() => setSelectedPoint({ day: row.day, measure: selectedMeasure })}>Ver</button></td></tr>)}</tbody></table>
          </details>
        </div>
        <aside className={styles.locationPanel} aria-label="Comparación por sede">
          <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Comparación · mismo periodo</span><h2>Por sede</h2></div><Link href="/sedes" aria-label="Ver detalle de sedes">Ver sedes <ArrowUpRight size={14} /></Link></div>
          <div className={styles.matrixHead}><span>Sede</span><span>Cargos</span><span>Cobros</span></div>
          {locationMatrix.map(({ location, emitted, collected }) => <div className={styles.matrixRow} key={location.id}><span><i />{location.name}</span><strong>{formatCents(emitted)}</strong><strong>{formatCents(collected)}</strong></div>)}
          <div className={`${styles.matrixRow} ${styles.matrixTotal}`}><span>Total</span><strong>{formatCents(locationMatrix.reduce((sum, row) => sum + row.emitted, 0))}</strong><strong>{formatCents(locationMatrix.reduce((sum, row) => sum + row.collected, 0))}</strong></div>
          <p className={styles.panelFootnote}>Cargos por creación · cobros por pago · {period.label}.</p>
        </aside>
      </section>
      <section className={`${styles.metrics} ${styles.metricsBalance}`} aria-label="Saldo vigente">
        <div className={`${styles.metric} ${styles.metricBalance}`}><span>Saldo vigente al corte</span><strong>{formatCents(totals.outstanding)}</strong><small>Libro completo · independiente del periodo</small></div>
      </section>
      {selectedPoint && <section className={styles.drilldown} aria-live="polite">
        <div className={styles.drillHeading}><div><span className={styles.eyebrow}>Detalle · {selectedSeries}</span><h2>{selectedDayLabel}</h2></div><button type="button" onClick={() => setSelectedPoint(null)} aria-label="Cerrar detalle">Cerrar</button></div>
        {drilldownItems.length ? <div className={styles.drillRows}>{drilldownItems.map(({ charge, value }, index) => { const patient = snapshot.patients.find((item) => item.id === charge.patientId); const location = snapshot.locations.find((item) => item.id === charge.locationId); return <Link href={`/caja?charge=${encodeURIComponent(charge.id)}`} key={`${charge.id}-${selectedPoint.measure}-${index}`}><span><strong>{patient?.name ?? "Cargo"}</strong><small>{location?.name ?? "Sede"} · {selectedPoint.measure === "charges" ? "cargo creado" : "pago recibido"}</small></span><strong>{formatCents(value)} <ArrowUpRight size={14} /></strong></Link>; })}</div> : <p>Sin movimientos de esta clase en ese día.</p>}
      </section>}
      <section className={styles.lowerGrid}>
        <div className={styles.servicePanel}>
          <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Actividad clínica</span><h2>Cargos por servicio</h2></div><span>Importe · {period.label}</span></div>
        {serviceMix.length ? <div className={styles.serviceList}>{serviceMix.map((item) => <div className={styles.serviceRow} key={item.serviceId}><span>{item.name}</span><div><i style={{ width: `${item.amount / Math.max(...serviceMix.map((service) => service.amount)) * 100}%` }} /></div><strong>{formatCents(item.amount)}</strong></div>)}</div> : <div className={styles.emptyState}><strong>Sin servicios en este periodo</strong><span>Cuando haya cargos asociados a ejecuciones clínicas, aparecerán aquí con su origen.</span></div>}
          <p className={styles.panelFootnote}>Se muestran cargos de ejecuciones clínicas; no representa todo el trabajo realizado.</p>
        </div>
      </section>
      <section className={styles.queueGrid} aria-label="Colas de seguimiento">
        {[
          { title: "Saldos pendientes", count: balanceQueue.length, note: "Vigentes al corte · cualquier fecha", items: balanceQueue, tone: "balance" },
          { title: "No-show", count: noShowQueue.length, note: `Citas del ${period.label}`, items: noShowQueue, tone: "noshow" },
          { title: "Citas canceladas", count: cancellationQueue.length, note: `Citas del ${period.label}`, items: cancellationQueue, tone: "cancelled" },
        ].map((queue) => <section className={styles.queuePanel} key={queue.title}>
          <div className={styles.queueHeading}><div><span className={`${styles.queueMark} ${styles[`queueMark${queue.tone}`]}`} /><h2>{queue.title}</h2></div><strong>{queue.count}</strong></div>
          <p className={styles.queueNote}>{queue.note}</p>
          {queue.items.length ? <div className={styles.queueRows}>{queue.items.map((item) => <Link href={item.href} key={item.id}><span><strong>{item.title}</strong><small>{item.detail}</small></span><span>{item.amount && <b>{item.amount}</b>}<ArrowUpRight size={14} /></span></Link>)}</div> : <p className={styles.queueEmpty}>Sin casos en esta cola.</p>}
        </section>)}
      </section>
    </section>
  );
}

function AdminHome() {
  const { snapshot, dispatch } = useOdontoRepository();
  const [notice, setNotice] = useState("");
  if (!useMocks) return <section className={`page workspace-page ${adminStyles.adminPage}`}><PageHeader title="Inicio" /><div className={adminStyles.statePanel} role="status"><strong>La jornada de sede requiere una sesión identificada</strong><span>La API aún no entrega el actor autorizado y la lectura consolidada de citas y caja para esta vista.</span></div></section>;
  if (snapshot.status === "loading") return <section className={`page workspace-page ${adminStyles.adminPage}`}><PageHeader title="Inicio" /><div className={adminStyles.statePanel} role="status"><span className={adminStyles.stateMark} /><strong>Preparando la jornada…</strong><span>La cola y sus siguientes acciones aparecerán cuando termine la carga.</span></div></section>;
  if (snapshot.status === "error") return <section className={`page workspace-page ${adminStyles.adminPage}`}><PageHeader title="Inicio" /><div className={`${adminStyles.statePanel} ${adminStyles.stateError}`} role="alert"><span className={adminStyles.stateMark} aria-hidden="true" /><strong>No se pudo cargar la jornada</strong><span>{snapshot.errorMessage ?? "Intenta actualizar la vista."}</span></div></section>;
  const locationId = snapshot.actor.locationId;
  const appointments = snapshot.appointments
    .filter((appointment) => appointment.locationId === locationId && demoDateKey(appointment.startAt) >= "2026-08-10" && demoDateKey(appointment.startAt) <= "2026-08-16")
    .sort((left, right) => left.startAt.localeCompare(right.startAt));
  const confirmations = confirmationQueue(snapshot, locationId).filter((appointment) => {
    const date = demoDateKey(appointment.startAt);
    return date === "2026-08-14" || date === "2026-08-15";
  });
  const visits = snapshot.visits.filter((visit) => visit.locationId === locationId);
  const todayAppointments = appointments.filter((appointment) => demoDateKey(appointment.startAt) === "2026-08-14");
  const scheduledToday = todayAppointments.filter((appointment) => appointment.state === "confirmed");
  const todayVisits = visits.filter((visit) => demoDateKey(visit.startedAt) === "2026-08-14");
  const pulseDays: AppointmentPulseDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date("2026-08-10T12:00:00Z");
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  }).map((day) => {
    const dayAppointments = appointments.filter((appointment) => demoDateKey(appointment.startAt) === day);
    const label = new Intl.DateTimeFormat("es-PE", { weekday: "short", day: "numeric", timeZone: DEMO_TIME_ZONE }).format(new Date(`${day}T12:00:00Z`));
    return {
      day,
      label: label.charAt(0).toUpperCase() + label.slice(1),
      attended: dayAppointments.filter((appointment) => visits.some((visit) => visit.appointmentId === appointment.id)).length,
      upcoming: dayAppointments.filter((appointment) => appointment.state === "confirmed" && !visits.some((visit) => visit.appointmentId === appointment.id) && new Date(appointment.endAt).getTime() >= new Date(DEMO_NOW).getTime()).length,
      missed: dayAppointments.filter((appointment) => appointment.state === "confirmed" && !visits.some((visit) => visit.appointmentId === appointment.id) && new Date(appointment.endAt).getTime() < new Date(DEMO_NOW).getTime()).length,
      cancelled: dayAppointments.filter((appointment) => appointment.state === "cancelled").length,
    };
  });
  const practitionerLoad = appointments.filter((appointment) => appointment.state === "confirmed").reduce<Array<{ id: string; name: string; minutes: number }>>((rows, appointment) => {
    const current = rows.find((row) => row.id === appointment.practitionerId);
    const minutes = Math.max(0, (new Date(appointment.endAt).getTime() - new Date(appointment.startAt).getTime()) / 60_000);
    if (current) current.minutes += minutes;
    else rows.push({ id: appointment.practitionerId, name: snapshot.practitioners.find((item) => item.id === appointment.practitionerId)?.name ?? "Profesional", minutes });
    return rows;
  }, []).sort((left, right) => right.minutes - left.minutes);
  const outstanding = chargeTotals(snapshot, locationId).outstanding;
  const arrive = async (appointment: DemoAppointment) => {
    if (!appointment.patientId) return;
    const result = await dispatch({ type: "registerVisit", appointmentId: appointment.id, patientId: appointment.patientId });
    setNotice(result.message);
  };
  const columns: Column<DemoAppointment>[] = [
    { key: "time", header: "Hora", width: "22%", render: (appointment) => <strong>{demoMomentLabel(appointment.startAt)}</strong> },
    { key: "patient", header: "Paciente", width: "36%", render: (appointment) => <span className="person-cell"><span><strong>{snapshot.patients.find((patient) => patient.id === appointment.patientId)?.name ?? "Lead sin paciente"}</strong><small>{appointment.serviceName} · {snapshot.practitioners.find((doctor) => doctor.id === appointment.practitionerId)?.name ?? "Profesional"}</small></span></span> },
    { key: "state", header: "Estado", width: "20%", render: (appointment) => { const visit = visits.find((item) => item.appointmentId === appointment.id); const noShow = appointment.state === "confirmed" && new Date(appointment.endAt).getTime() < new Date(DEMO_NOW).getTime() && !visit; const label = appointment.state === "cancelled" ? "Cancelada" : noShow ? "No-show" : visit ? "Llegó" : "Confirmada"; return <Badge tone={label === "No-show" ? "red" : label === "Llegó" || label === "Confirmada" ? "green" : "slate"}>{label}</Badge>; } },
    { key: "next", header: "Acción", width: "30%", render: (appointment) => { const visit = visits.find((item) => item.appointmentId === appointment.id); const execution = visit && snapshot.executions.find((item) => item.visitId === visit.id); const charge = execution ? snapshot.charges.find((item) => item.id === execution.chargeId) : undefined; const patient = snapshot.patients.find((item) => item.id === appointment.patientId); const futureConfirmation = !visit && confirmations.some((item) => item.id === appointment.id); const pastWithoutVisit = appointment.state === "confirmed" && new Date(appointment.endAt).getTime() < new Date(DEMO_NOW).getTime(); if (appointment.state === "cancelled") return <Link className="workspace-link" href={`/agenda?appointment=${appointment.id}`}>Ver agenda <ArrowUpRight size={15} /></Link>; if (execution && charge) return <Link className="workspace-link" href={`/caja?charge=${charge.id}`}>Abrir Caja <ArrowUpRight size={15} /></Link>; if (visit) return <Link className="workspace-link" href={`/atencion/${visit.id}`}>Abrir atención <ArrowUpRight size={15} /></Link>; if (pastWithoutVisit) return <Link className="workspace-link" href={`/agenda?appointment=${appointment.id}`}>Revisar cita <ArrowUpRight size={15} /></Link>; if (futureConfirmation && patient?.phone) return <a className="workspace-link" href={`tel:${patient.phone}`} aria-label={`Llamar a ${patient.name}`}><Phone size={15} />Llamar a {patient.name.split(" ")[0]}</a>; if (!appointment.patientId) return <Link className="workspace-link" href="/pacientes">Completar paciente <ArrowUpRight size={15} /></Link>; return new Date(appointment.startAt).getTime() <= new Date(DEMO_NOW).getTime() ? <Button compact icon={Stethoscope} onClick={() => void arrive(appointment)}>Registrar llegada</Button> : <Link className="workspace-link" href={`/agenda?appointment=${appointment.id}`}>Ver cita <ArrowUpRight size={15} /></Link>; } },
  ];

  return (
    <section className={`page workspace-page ${adminStyles.adminPage}`}>
      <PageHeader title={demoDateLabel()}>
        <span className="workspace-scope"><span className="workspace-scope__dot" />Lince · demo</span>
      </PageHeader>
      <section className={adminStyles.daySummary} aria-label="Resumen de hoy">
        <h2>{scheduledToday.length ? <><strong>{scheduledToday.length}</strong> {scheduledToday.length === 1 ? "cita programada" : "citas programadas"} hoy</> : "Agenda vacía"}</h2>
        <div className={adminStyles.dayFacts}>
          <div><span>Sin llegada · próximas 48 h</span><strong>{confirmations.length}</strong></div>
          <div><span>Visitas hoy</span><strong>{todayVisits.length}</strong></div>
          <div><span>Saldo de la sede</span><strong>{money(outstanding)}</strong></div>
        </div>
      </section>
      <section className={adminStyles.analyticsGrid} aria-label="Lectura semanal de agenda">
        <AppointmentPulse title="Ritmo de atención" detail="10–16 ago · Lince · escenario demo" days={pulseDays} size="large" />
        <ServiceMixPulse appointments={appointments} title="Servicios agendados" detail="10–16 ago · Lince · escenario demo" size="large" />
        <section className={adminStyles.loadPanel} aria-label="Minutos agendados por profesional">
          <header><div><h2>Carga agendada</h2><p>Minutos reservados · 10–16 ago</p></div><span>Escenario demo</span></header>
          {practitionerLoad.length ? <div className={adminStyles.loadChart} role="img" aria-label={`Minutos de citas confirmadas por profesional: ${practitionerLoad.map((item) => `${item.name}, ${item.minutes} minutos`).join("; ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={practitionerLoad} layout="vertical" margin={{ top: 5, right: 12, bottom: 0, left: 0 }} barCategoryGap="38%">
                <CartesianGrid horizontal={false} stroke="#E7EBEF" strokeDasharray="3 5" />
                <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: "#65706F", fontSize: 10 }} unit=" min" />
                <YAxis type="category" dataKey="name" width={126} tickLine={false} axisLine={false} tick={{ fill: "#46514F", fontSize: 10 }} />
                <Tooltip cursor={{ fill: "#F3F7F6" }} formatter={(value) => [`${Number(value ?? 0)} min`, "Tiempo agendado"]} />
                <Bar dataKey="minutes" name="Minutos agendados" fill="#176A63" radius={[0, 4, 4, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div> : <div className={adminStyles.loadEmpty}>Sin citas confirmadas en esta ventana</div>}
          <details className={adminStyles.loadData}><summary>Ver datos</summary><ul>{practitionerLoad.map((item) => <li key={item.id}>{item.name}<strong>{item.minutes} min</strong></li>)}</ul></details>
        </section>
      </section>
      {notice && <div className="workspace-notice" role="status"><Check size={16} />{notice}</div>}
      <section className={`${adminStyles.queue} workspace-table`}>
        <div className={adminStyles.queueHeading}><h2>Jornada</h2><Link href="/agenda">Agenda <ArrowUpRight size={14} /></Link></div>
        {todayAppointments.length > 0 && <>
          <h3 className={adminStyles.queueSubheading}>Hoy · {demoDateLabel()}</h3>
          <DataTable<DemoAppointment> className="workspace-table--compact" columns={columns} rows={todayAppointments} rowKey={(appointment) => appointment.id} emptyMessage="Sin actividad hoy" />
        </>}
        <h3 className={adminStyles.queueSubheading}>Próximas citas</h3>
        <DataTable<DemoAppointment> className="workspace-table--compact" columns={columns} rows={appointments.filter((appointment) => demoDateKey(appointment.startAt) > "2026-08-14")} rowKey={(appointment) => appointment.id} emptyMessage="No hay citas próximas en esta ventana" />
      </section>
    </section>
  );
}

function NewHomePage() {
  const [role, , ready] = useDemoRole();
  if (!ready) return <section className="shell-hydrating" aria-live="polite"><span className="shell-hydrating__mark" />Preparando tu espacio de trabajo…</section>;
  if (role === "owner") return <OwnerHome />;
  if (role === "admin") return <AdminHome />;
  return <DoctorHomeView />;
}

export function HomePage() {
  return <NewHomePage />;
}
