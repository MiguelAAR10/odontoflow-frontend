"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  MapPin,
  SlidersHorizontal,
  UserRound,
  XCircle,
} from "lucide-react";
import {
  cancelReal,
  currentWeekWindow,
  getAgendaDetail,
  getLocations,
  getSlots,
  loadAgenda,
  newIdempotencyKey,
  rescheduleReal,
  toApiError,
  toUiStatus,
  useMocks,
} from "../api";
import type { AppointmentListItem, LocationRead, SlotResult } from "../api";
import { demoMomentLabel, demoWeekWindow, DEMO_NOW, DEMO_TIME_ZONE, useOdontoRepository } from "../api";
import { Badge, statusTone } from "../components/Badge";
import { Button } from "../components/Button";
import { Drawer } from "../components/Drawer";
import { Modal } from "../components/Modal";
import type { Appointment } from "../types";
import styles from "./AgendaPage.module.css";

const HOURS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00"];
const WEEKDAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

type ViewMode = "week" | "day";

function formatDateKey(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)?.value ?? "00").join("-");
}

function formatSlotDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatSlotTime(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(instant));
}

function formatAppointmentDate(start: string | undefined, timeZone: string): string {
  if (!start) return "No disponible";
  return formatSlotDate(formatDateKey(start, timeZone));
}

function formatAppointmentTime(start: string | undefined, end: string | undefined, timeZone: string): string {
  if (!start) return "No disponible";
  const startTime = formatSlotTime(start, timeZone);
  const endTime = end ? formatSlotTime(end, timeZone) : "";
  return endTime ? `${startTime} – ${endTime}` : startTime;
}

function durationMinutes(start: string | undefined, end: string | undefined): number | null {
  if (!start || !end) return null;
  const duration = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
  return duration > 0 ? duration : null;
}

function localDayIndex(): number {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", weekday: "short" }).format(new Date());
  const index = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  return index >= 0 ? index : 0;
}

function formatWeekDay(instant: string, offset: number): string {
  const date = new Date(new Date(instant).getTime() + offset * 86_400_000);
  const label = new Intl.DateTimeFormat("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatWeekRange(instant: string): string {
  const start = new Date(instant);
  const end = new Date(start.getTime() + 5 * 86_400_000);
  const formatter = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function appointmentCardStyle(appointment: Appointment): { top: string; height: string } {
  const [hour, minute] = appointment.time.split(":").map(Number);
  const offsetMinutes = Math.max(0, (hour - 9) * 60 + minute);
  const duration = durationMinutes(appointment.startUtc, appointment.endUtc) ?? 60;
  return {
    top: `${4 + (offsetMinutes / 60) * 100}px`,
    height: `${Math.max(52, (duration / 60) * 100 - 8)}px`,
  };
}

function StatusIcon({ status }: { status: string }) {
  if (status === "Confirmada") return <CheckCircle2 size={17} aria-hidden="true" />;
  if (status === "Cancelada") return <XCircle size={17} aria-hidden="true" />;
  return <Clock3 size={17} aria-hidden="true" />;
}

function groupSlots(slots: SlotResult[], timeZone: string): Array<[string, SlotResult[]]> {
  const grouped = new Map<string, SlotResult[]>();
  for (const slot of slots) {
    const date = formatDateKey(slot.start, timeZone);
    const daySlots = grouped.get(date) ?? [];
    daySlots.push(slot);
    grouped.set(date, daySlots);
  }
  return Array.from(grouped.entries());
}

function demoDayIndex(instant: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: DEMO_TIME_ZONE, weekday: "short" }).format(new Date(instant));
  return Math.max(0, ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday));
}

function demoAgendaRows(snapshot: ReturnType<typeof useOdontoRepository>["snapshot"]): Appointment[] {
  return snapshot.appointments.map((item) => ({
    id: item.id,
    day: demoDayIndex(item.startAt),
    time: formatSlotTime(item.startAt, DEMO_TIME_ZONE),
    patient: snapshot.patients.find((patient) => patient.id === item.patientId)?.name ?? snapshot.leads.find((lead) => lead.id === item.leadId)?.name ?? "Lead sin paciente",
    treatment: item.serviceName,
    doctor: snapshot.practitioners.find((practitioner) => practitioner.id === item.practitionerId)?.name ?? "Profesional",
    branch: snapshot.locations.find((location) => location.id === item.locationId)?.name ?? "Sede",
    status: item.state === "cancelled"
      ? "Cancelada"
      : snapshot.visits.some((visit) => visit.appointmentId === item.id)
        ? snapshot.visits.find((visit) => visit.appointmentId === item.id)?.closedAt ? "Atendida" : "En atención"
        : "Confirmada",
    startUtc: item.startAt,
    endUtc: item.endAt,
    timeZone: DEMO_TIME_ZONE,
  }));
}

export function AgendaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const appointmentQuery = searchParams.get("appointment");
  const requestedLocation = searchParams.get("location");
  const { snapshot, dispatch } = useOdontoRepository();
  const dismissedAppointmentQuery = useRef<string | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [detail, setDetail] = useState<AppointmentListItem | null>(null);
  const actorLocationName = snapshot.locations.find((location) => location.id === snapshot.actor.locationId)?.name ?? "all";
  const [locationFilter, setLocationFilter] = useState(useMocks && snapshot.actor.role === "admin" ? actorLocationName : requestedLocation ?? "all");
  const [practitionerFilter, setPractitionerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [activeDay, setActiveDay] = useState(useMocks ? demoDayIndex("2026-08-14T18:00:00.000Z") : localDayIndex);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleSlots, setRescheduleSlots] = useState<SlotResult[]>([]);
  const [rescheduleSlot, setRescheduleSlot] = useState("");
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const weekWindow = useMemo(() => useMocks ? demoWeekWindow() : currentWeekWindow(), []);
  const weekDays = useMemo(() => WEEKDAY_LABELS.map((_, index) => formatWeekDay(weekWindow.from, index)), [weekWindow.from]);
  const visibleDayIndexes = viewMode === "day" ? [activeDay] : [0, 1, 2, 3, 4, 5];
  const todayIndex = useMemo(() => useMocks ? demoDayIndex("2026-08-14T18:00:00.000Z") : localDayIndex(), []);
  const demoRows = useMemo(() => demoAgendaRows(snapshot), [snapshot]);

  const refresh = useCallback(async (): Promise<Appointment[]> => {
    setLoading(true);
    setError("");
    try {
      const rows = useMocks
        ? demoRows
        : await loadAgenda(locationFilter === "all" ? undefined : { locationId: Number(locationFilter) });
      setAppointments(rows);
      return rows;
    } catch (caught) {
      setError(toApiError(caught).message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [demoRows, locationFilter]);

  useEffect(() => {
    void refresh();
    const reload = () => void refresh();
    window.addEventListener("appointment-created", reload);
    return () => window.removeEventListener("appointment-created", reload);
  }, [refresh]);

  const [locations, setLocations] = useState<LocationRead[]>([]);
  useEffect(() => {
    if (useMocks) return;
    void getLocations()
      .then(setLocations)
      .catch((caught) => setError(toApiError(caught).message));
  }, []);

  useEffect(() => {
    if (!useMocks) return;
    setLocationFilter(snapshot.actor.role === "admin" ? actorLocationName : "all");
  }, [actorLocationName, snapshot.actor.role]);

  const locationChoices = useMemo(() => {
    if (!useMocks) return locations.map((location) => ({ value: String(location.id), label: location.name }));
    return Array.from(new Set(appointments.map((appointment) => appointment.branch).filter(Boolean))).map((name) => ({ value: name, label: name }));
  }, [appointments, locations]);

  const practitionerChoices = useMemo(() => {
    const choices = new Map<string, string>();
    for (const appointment of appointments) {
      if (!appointment.doctor) continue;
      choices.set(appointment.practitionerId != null ? String(appointment.practitionerId) : `name:${appointment.doctor}`, appointment.doctor);
    }
    return Array.from(choices, ([value, label]) => ({ value, label }));
  }, [appointments]);

  const statusChoices = useMemo(() => Array.from(new Set(appointments.map((appointment) => appointment.status).filter(Boolean))), [appointments]);

  const visible = useMemo(() => appointments.filter((appointment) => {
    const appointmentPractitioner = appointment.practitionerId != null ? String(appointment.practitionerId) : `name:${appointment.doctor}`;
    const appointmentLocation = useMocks ? appointment.branch : String(appointment.locationId ?? "");
    return (
      (locationFilter === "all" || appointmentLocation === locationFilter) &&
      (practitionerFilter === "all" || appointmentPractitioner === practitionerFilter) &&
      (statusFilter === "all" || appointment.status === statusFilter)
    );
  }), [appointments, locationFilter, practitionerFilter, statusFilter]);
  const dayAppointments = useMemo(() => visible.filter((appointment) => appointment.day === activeDay), [activeDay, visible]);
  const chronologicalDayAppointments = useMemo(
    () => [...dayAppointments].sort((left, right) => (left.startUtc ?? "").localeCompare(right.startUtc ?? "")),
    [dayAppointments],
  );

  const inCell = (day: number, hour: string) => visible.filter((appointment) => appointment.day === day && Number(appointment.time.slice(0, 2)) === Number(hour.slice(0, 2)));

  const openDetail = (appointment: Appointment) => {
    setSelected(appointment);
    setDetail(null);
    setError("");
    if (useMocks) return;
    setDetailLoading(true);
    void getAgendaDetail(Number(appointment.id))
      .then(setDetail)
      .catch((caught) => setError(toApiError(caught).message))
      .finally(() => setDetailLoading(false));
  };

  useEffect(() => {
    if (!appointmentQuery) dismissedAppointmentQuery.current = null;
  }, [appointmentQuery]);

  useEffect(() => {
    if (!appointmentQuery || dismissedAppointmentQuery.current === appointmentQuery || loading || !appointments.length) return;
    const linkedAppointment = appointments.find((appointment) => appointment.id === appointmentQuery);
    if (linkedAppointment && selected?.id !== linkedAppointment.id) openDetail(linkedAppointment);
  }, [appointmentQuery, appointments, loading, selected?.id]);

  useEffect(() => {
    if (!useMocks || snapshot.actor.role === "admin" || !requestedLocation) return;
    setLocationFilter(requestedLocation);
  }, [requestedLocation, snapshot.actor.role]);

  const closeDetail = () => {
    if (busy) return;
    if (appointmentQuery) {
      dismissedAppointmentQuery.current = appointmentQuery;
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete("appointment");
      const query = nextParams.toString();
      router.replace(query ? `/agenda?${query}` : "/agenda", { scroll: false });
    }
    setSelected(null);
    setDetail(null);
    setRescheduleOpen(false);
    setCancelOpen(false);
    setRescheduleSlots([]);
    setRescheduleSlot("");
  };

  const startReschedule = async () => {
    if (!selected) return;
    const serviceId = selected.serviceId;
    const locationId = selected.locationId;
    const practitionerId = selected.practitionerId;
    if (!useMocks && (serviceId === undefined || locationId === undefined || practitionerId === undefined)) return;
    setRescheduleOpen(true);
    setRescheduleLoading(true);
    setRescheduleSlots([]);
    setRescheduleSlot("");
    setError("");
    try {
      if (useMocks) {
        const first = new Date(Date.UTC(2026, 7, 15, 16, 0, 0)).toISOString();
        const second = new Date(Date.UTC(2026, 7, 15, 20, 0, 0)).toISOString();
        setRescheduleSlots([
          { practitioner_id: 0, start: first, end: new Date(new Date(first).getTime() + 60 * 60_000).toISOString() },
          { practitioner_id: 0, start: second, end: new Date(new Date(second).getTime() + 60 * 60_000).toISOString() },
        ]);
        return;
      }
      const window = currentWeekWindow(selected.timeZone ?? "America/Lima");
      const slots = await getSlots({
        service_id: serviceId as number,
        location_id: locationId as number,
        window_start: window.from,
        window_end: window.to,
      });
      // The SlotQuery contract returns eligible practitioners. A reschedule
      // keeps the appointment's practitioner because the mutation accepts only
      // a new start, so only that practitioner's canonical slots are valid here.
      setRescheduleSlots(slots.filter((slot) => slot.practitioner_id === practitionerId));
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      setRescheduleLoading(false);
    }
  };

  const updateDetailAfterMutation = async (appointmentId: string, rows: Appointment[]) => {
    const next = rows.find((appointment) => appointment.id === appointmentId);
    if (next) setSelected(next);
    if (useMocks) {
      setDetail(null);
      return;
    }
    try {
      setDetail(await getAgendaDetail(Number(appointmentId)));
    } catch (caught) {
      setError(toApiError(caught).message);
    }
  };

  const submitReschedule = async () => {
    if (!selected || !rescheduleSlot) return;
    setBusy(true);
    setError("");
    try {
      if (useMocks) {
        const end = new Date(new Date(rescheduleSlot).getTime() + 60 * 60_000).toISOString();
        await dispatch({ type: "rescheduleAppointment", appointmentId: selected.id, startAt: rescheduleSlot, endAt: end });
      } else {
        await rescheduleReal(Number(selected.id), rescheduleSlot, newIdempotencyKey());
      }
      const rows = await refresh();
      await updateDetailAfterMutation(selected.id, rows);
      setRescheduleOpen(false);
      setRescheduleSlot("");
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      setBusy(false);
    }
  };

  const submitCancel = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      if (useMocks) await dispatch({ type: "cancelAppointment", appointmentId: selected.id });
      else await cancelReal(Number(selected.id), newIdempotencyKey());
      const rows = await refresh();
      await updateDetailAfterMutation(selected.id, rows);
      setCancelOpen(false);
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      setBusy(false);
    }
  };

  const detailState = detail ? toUiStatus(detail.state) : selected?.status ?? "";
  const detailStart = detail?.start_utc ?? selected?.startUtc;
  const detailEnd = detail?.end_utc ?? selected?.endUtc;
  const detailTimeZone = selected?.timeZone ?? "America/Lima";
  const detailSlots = groupSlots(rescheduleSlots, detailTimeZone);
  const hasVisit = (appointment: Appointment) => snapshot.visits.some((visit) => visit.appointmentId === appointment.id);
  const isPending = (appointment: Appointment) => appointment.status !== "Cancelada" && new Date(appointment.startUtc ?? "").getTime() >= new Date(DEMO_NOW).getTime() && !hasVisit(appointment);
  const briefScope = viewMode === "day" ? dayAppointments : visible;
  const briefOpen = briefScope.filter((appointment) => appointment.status !== "Cancelada");
  const briefWithoutVisit = useMocks ? briefOpen.filter((appointment) => !hasVisit(appointment)) : [];
  const briefArrived = useMocks ? briefOpen.filter(hasVisit) : [];
  const nextAppointment = [...visible.filter(isPending)].sort((left, right) => (left.startUtc ?? "").localeCompare(right.startUtc ?? ""))[0];
  const visitsToday = useMocks ? dayAppointments.filter(hasVisit).length : null;
  const withoutVisitToday = useMocks ? dayAppointments.filter((appointment) => appointment.status !== "Cancelada" && !hasVisit(appointment)).length : null;

  return (
    <div className="agenda-layout">
      <section className="page agenda-page">
        <div className="page-heading page-heading--with-actions">
          <div>
            <span className="page-kicker">Operación del día</span>
            <h1>Agenda de citas</h1>
            <p>{viewMode === "day" ? weekDays[activeDay] : formatWeekRange(weekWindow.from)}</p>
          </div>
          <div className="filter-row filter-row--heading">
            <Button icon={CalendarDays} onClick={() => setActiveDay(todayIndex)}>Hoy</Button>
            <label className="select-control"><span className="sr-only">Periodo</span><select value={viewMode} onChange={(event) => setViewMode(event.target.value as ViewMode)}><option value="week">Semana</option><option value="day">Día</option></select><ChevronDown size={16} aria-hidden="true" /></label>
            {viewMode === "day" && <label className="select-control"><span className="sr-only">Día de la semana</span><select value={String(activeDay)} onChange={(event) => setActiveDay(Number(event.target.value))}>{weekDays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select><ChevronDown size={16} aria-hidden="true" /></label>}
            <label className="select-control"><MapPin size={18} aria-hidden="true" /><span className="sr-only">Sede</span><select value={locationFilter} onChange={(event) => { setLocationFilter(event.target.value); setPractitionerFilter("all"); }}>{(!useMocks || snapshot.actor.role === "owner") && <option value="all">Todas las sedes</option>}{locationChoices.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={16} aria-hidden="true" /></label>
            {practitionerChoices.length > 0 && <label className="select-control"><UserRound size={18} aria-hidden="true" /><span className="sr-only">Odontólogo</span><select value={practitionerFilter} onChange={(event) => setPractitionerFilter(event.target.value)}><option value="all">Todos los odontólogos</option>{practitionerChoices.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={16} aria-hidden="true" /></label>}
            <label className="select-control"><SlidersHorizontal size={18} aria-hidden="true" /><span className="sr-only">Estado</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Todos los estados</option>{statusChoices.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={16} aria-hidden="true" /></label>
          </div>
        </div>

        {error && <div className="form-error agenda-error" role="alert">{error}<Button compact onClick={() => void refresh()}>Reintentar</Button></div>}

        {!loading && <section className="agenda-brief" aria-label="Lectura rápida de la agenda">
          <div className="agenda-brief__focus">
            <span>{nextAppointment ? "PRÓXIMA CITA" : "SIN CITAS PENDIENTES"}</span>
            <div>
              <strong>{nextAppointment?.patient ?? "Sin citas pendientes"}</strong>
              {nextAppointment?.startUtc && <time>{demoMomentLabel(nextAppointment.startUtc)}</time>}
            </div>
            <p>{nextAppointment ? `${nextAppointment.treatment} · ${nextAppointment.doctor}` : "No hay citas futuras en esta agenda."}</p>
            {nextAppointment && <Button compact icon={ArrowUpRight} onClick={() => openDetail(nextAppointment)}>Abrir detalle</Button>}
          </div>
          <div className="agenda-brief__stats">
            <div><span>EN AGENDA</span><strong>{briefOpen.length}</strong><small>{viewMode === "day" ? "citas del día" : "en la semana"}</small></div>
            <div><span>{useMocks ? "SIN VISITA REGISTRADA" : "CONFIRMADAS"}</span><strong>{useMocks ? briefWithoutVisit.length : briefOpen.filter((appointment) => appointment.status === "Confirmada").length}</strong><small>{useMocks ? "sin visita asociada" : "estado de la cita"}</small></div>
            <div><span>VISITAS</span><strong>{useMocks ? briefArrived.length : "—"}</strong><small>{useMocks ? "iniciadas" : "no disponibles"}</small></div>
          </div>
        </section>}

        {loading ? (
          <div className="agenda-loading" role="status" aria-live="polite" aria-busy="true"><div className="skeleton skeleton--wide" /><div className="skeleton skeleton--calendar" /><span>Cargando agenda…</span></div>
        ) : (
          <>
            {viewMode === "day" ? (
              <section className={styles.dayAgenda} aria-label={`Agenda del ${weekDays[activeDay]}`}>
                {chronologicalDayAppointments.map((appointment) => (
                  <button
                    type="button"
                    key={appointment.id}
                    className={`${styles.dayAppointment} ${styles[`dayAppointment--${statusTone(appointment.status)}`]}`}
                    onClick={() => openDetail(appointment)}
                    aria-label={`${appointment.time} ${appointment.patient}, ${appointment.treatment}, ${appointment.status}`}
                  >
                    <time className={styles.dayTime} dateTime={appointment.startUtc}>{appointment.time}</time>
                    <span className={styles.dayDetails}>
                      <span className={styles.dayTitle}><strong>{appointment.patient}</strong><Badge tone={statusTone(appointment.status)}>{appointment.status}</Badge></span>
                      <span className={styles.dayDescription}>{appointment.treatment} · {appointment.doctor} · {appointment.branch}</span>
                    </span>
                    <StatusIcon status={appointment.status} />
                  </button>
                ))}
                {dayAppointments.length === 0 && <div className="empty-state agenda-empty" role="status"><CalendarDays size={24} aria-hidden="true" /><strong>No hay citas para este día y filtros.</strong><span>Prueba otra sede, odontólogo o estado.</span></div>}
              </section>
            ) : (
              <div className="calendar-grid calendar-grid--week" aria-label="Agenda semanal">
                <div className="calendar-corner" />
                {visibleDayIndexes.map((dayIndex) => <div key={weekDays[dayIndex]} className={`calendar-day ${dayIndex === todayIndex ? "calendar-day--today" : ""}`}>{weekDays[dayIndex]}</div>)}
                {HOURS.map((hour) => [
                  <div key={`${hour}-label`} className="calendar-time">{Number(hour.slice(0, 2)) >= 12 ? `${Number(hour.slice(0, 2)) === 12 ? 12 : Number(hour.slice(0, 2)) - 12}:00 p. m.` : `${Number(hour.slice(0, 2))}:00 a. m.`}</div>,
                  ...visibleDayIndexes.map((dayIndex) => <div key={`${hour}-${dayIndex}`} className="calendar-cell">
                    {inCell(dayIndex, hour).map((appointment) => (
                      <button type="button" key={appointment.id} className={`appointment-card appointment-card--${statusTone(appointment.status)}`} style={appointmentCardStyle(appointment)} onClick={() => openDetail(appointment)} aria-label={`${appointment.time} ${appointment.patient}, ${appointment.treatment}, ${appointment.status}`}>
                        <span className="appointment-card__top"><strong>{appointment.time}</strong><StatusIcon status={appointment.status} /></span>
                        <span>{appointment.patient} · {appointment.treatment}</span>
                        <Badge tone={statusTone(appointment.status)}>{appointment.status}</Badge>
                      </button>
                    ))}
                  </div>),
                ])}
              </div>
            )}
            {viewMode === "week" && visible.length === 0 && <div className="empty-state agenda-empty" role="status"><CalendarDays size={24} aria-hidden="true" /><strong>No hay citas para estos filtros.</strong><span>Prueba otra sede, odontólogo o estado.</span></div>}
          </>
        )}
      </section>

      <aside className="day-summary">
        <h2>Resumen del día</h2><h3>{weekDays[activeDay] ?? "Hoy"}</h3>
        <div className="summary-stats">
          <div><CalendarDays className="text-blue" aria-hidden="true" /><strong>{dayAppointments.length}</strong><span>citas</span></div>
          <div><CheckCircle2 className="text-green" aria-hidden="true" /><strong>{useMocks ? withoutVisitToday : dayAppointments.filter((appointment) => appointment.status === "Confirmada").length}</strong><span>{useMocks ? "sin visita registrada" : "confirmadas"}</span></div>
          <div><Clock3 className="text-amber" aria-hidden="true" /><strong>{visitsToday ?? "—"}</strong><span>{useMocks ? "visitas iniciadas" : "visitas no disponibles"}</span></div>
        </div>
        <div className="summary-divider" />
        <h2>Agenda por odontólogo</h2>
        {practitionerChoices.length === 0 && <p className="summary-empty">No hay odontólogos en la vista.</p>}
        {practitionerChoices.map((practitioner) => (
          <button key={practitioner.value} className={`doctor-card doctor-card--blue ${practitionerFilter === practitioner.value ? "doctor-card--active" : ""}`} type="button" aria-pressed={practitionerFilter === practitioner.value} onClick={() => setPractitionerFilter(practitionerFilter === practitioner.value ? "all" : practitioner.value)}><span>{practitioner.label.slice(0, 2).toUpperCase()}</span><strong>{practitioner.label}</strong><b aria-hidden="true">›</b></button>
        ))}
      </aside>

      <Drawer title="Detalle de la cita" open={Boolean(selected)} onClose={closeDetail}>
        {selected && <div className="detail-list appointment-detail">
          {detailLoading && <div className="detail-loading" role="status">Actualizando detalle…</div>}
          <div><span>Lead / contacto</span><strong>{detail?.lead_name ?? selected.patient}</strong></div>
          <div><span>Servicio</span><strong>{detail?.service_name ?? selected.treatment}</strong></div>
          <div><span>Fecha</span><strong>{formatAppointmentDate(detailStart, detailTimeZone)}</strong></div>
          <div><span>Hora</span><strong>{formatAppointmentTime(detailStart, detailEnd, detailTimeZone)}</strong></div>
          {durationMinutes(detailStart, detailEnd) && <div><span>Duración</span><strong>{durationMinutes(detailStart, detailEnd)} min</strong></div>}
          <div><span>Sede</span><strong>{detail?.location_name ?? selected.branch}</strong></div>
          <div><span>Odontólogo</span><strong>{detail?.practitioner_name ?? selected.doctor}</strong></div>
          <div><span>Estado</span><Badge tone={statusTone(detailState)}>{detailState}</Badge></div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="form-actions appointment-detail__actions">
            <Button onClick={closeDetail}>Cerrar</Button>
            {detailState !== "Cancelada" && <>
              <Button onClick={() => void startReschedule()} disabled={busy || detailLoading}>Reprogramar</Button>
              <Button variant="danger" onClick={() => { setError(""); setCancelOpen(true); }} disabled={busy || detailLoading}>Cancelar cita</Button>
            </>}
          </div>
        </div>}
      </Drawer>

      <Modal title="Reprogramar cita" open={rescheduleOpen} onClose={() => !busy && setRescheduleOpen(false)}>
        <div className="slot-picker slot-picker--reschedule" aria-live="polite">
          <p className="modal-intro">Selecciona un horario válido para el mismo servicio, sede y odontólogo.</p>
          {rescheduleLoading && <p className="slot-picker__hint" role="status">Consultando disponibilidad…</p>}
          {!rescheduleLoading && !error && rescheduleSlots.length === 0 && <p className="slot-picker__hint">No hay horarios disponibles para este odontólogo en la semana consultada.</p>}
          {detailSlots.map(([date, dateSlots]) => <div className="slot-picker__day" key={date}><strong>{formatSlotDate(date)}</strong><div className="slot-picker__options">{dateSlots.map((slot) => { const active = rescheduleSlot === slot.start; return <button className={`slot-option ${active ? "slot-option--active" : ""}`} type="button" key={`${slot.practitioner_id}-${slot.start}`} aria-pressed={active} onClick={() => setRescheduleSlot(slot.start)}>{formatSlotTime(slot.start, detailTimeZone)}</button>; })}</div></div>)}
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="form-actions"><Button onClick={() => setRescheduleOpen(false)} disabled={busy}>Mantener cita</Button><Button variant="primary" onClick={() => void submitReschedule()} disabled={busy || rescheduleLoading || !rescheduleSlot}>{busy ? "Guardando…" : "Confirmar nueva hora"}</Button></div>
        </div>
      </Modal>

      <Modal title="Cancelar cita" open={cancelOpen} onClose={() => !busy && setCancelOpen(false)} size="small">
        <div className="confirmation-message appointment-cancel-confirmation">
          <XCircle size={52} aria-hidden="true" />
          <h3>¿Cancelar esta cita?</h3>
          <p>Se liberará el horario de la cita seleccionada. Esta acción solo cambia el estado de la cita.</p>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="form-actions"><Button onClick={() => setCancelOpen(false)} disabled={busy}>Mantener cita</Button><Button variant="danger" onClick={() => void submitCancel()} disabled={busy}>{busy ? "Cancelando…" : "Cancelar cita"}</Button></div>
        </div>
      </Modal>
    </div>
  );
}
