"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  UserRoundPlus,
  Clock3,
  MapPin,
  SlidersHorizontal,
  UserRound,
  XCircle,
} from "lucide-react";
import {
  cancelReal,
  deleteDemoAppointment,
  editDemoAppointment,
  currentWeekWindow,
  getAgendaDetail,
  getAppointments,
  getLocations,
  getSlots,
  loadAgenda,
  newIdempotencyKey,
  rescheduleReal,
  toApiError,
  toUiStatus,
  useMocks,
} from "../api";
import type { AppointmentListItem, LocationRead, SlotResult } from "../contracts/client";
import { AttendancePanel } from "../components/AttendancePanel";
import { Badge, statusTone } from "../components/Badge";
import { Button } from "../components/Button";
import { Drawer } from "../components/Drawer";
import { Modal } from "../components/Modal";
import type { Appointment } from "../types";

const HOURS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00"];
const WEEKDAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const AGENDA_STATES = ["Pendiente", "En espera", "Ausente", "Confirmada", "Cancelada", "En consulta", "Atendida", "Reprogramada"];

function weekForDate(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const monday = new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * 86400000);
  return { from: monday.toISOString(), to: new Date(monday.getTime() + 7 * 86400000).toISOString() };
}

function agendaState(status: string) {
  return status === "Por confirmar" || status === "No respondió" ? "Pendiente" : status;
}

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

function formatAppointmentDateTime(start: string | undefined, end: string | undefined, timeZone: string): string {
  if (!start) return "No disponible";
  const date = new Intl.DateTimeFormat("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(new Date(start));
  const startTime = formatSlotTime(start, timeZone);
  const endTime = end ? formatSlotTime(end, timeZone) : "";
  return `${date} · ${startTime}${endTime ? ` – ${endTime}` : ""}`;
}

function durationMinutes(start: string | undefined, end: string | undefined): number | null {
  if (!start || !end) return null;
  const duration = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
  return duration > 0 ? duration : null;
}

function localDayIndex(): number {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", weekday: "short" }).format(new Date());
  const index = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday);
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
  const end = new Date(start.getTime() + 6 * 86_400_000);
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

export function AgendaPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [detail, setDetail] = useState<AppointmentListItem | null>(null);
  const [attendanceAppointment, setAttendanceAppointment] = useState<Appointment | null>(null);
  const [attendanceDetail, setAttendanceDetail] = useState<AppointmentListItem | null>(null);
  const [locationFilter, setLocationFilter] = useState("all");
  const [practitionerFilter, setPractitionerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<string[]>([...AGENDA_STATES]);
  const [statusDraft, setStatusDraft] = useState<string[]>([...AGENDA_STATES]);
  const [statusOpen, setStatusOpen] = useState(false);
  const statusFilterRef = useRef<HTMLDivElement>(null);
  const statusTriggerRef = useRef<HTMLButtonElement>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => formatDateKey(new Date().toISOString(), "America/Lima"));
  const [calendarMonth, setCalendarMonth] = useState(() => formatDateKey(new Date().toISOString(), "America/Lima").slice(0, 7));
  const [userOpen, setUserOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const [agendaUsers, setAgendaUsers] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [activeDay, setActiveDay] = useState(localDayIndex);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleSlots, setRescheduleSlots] = useState<SlotResult[]>([]);
  const [rescheduleSlot, setRescheduleSlot] = useState("");
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!statusOpen) return;
    const outside = (event: PointerEvent) => { if (!statusFilterRef.current?.contains(event.target as Node)) setStatusOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setStatusOpen(false); statusTriggerRef.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [statusOpen]);

  const weekWindow = useMemo(() => weekForDate(selectedDate), [selectedDate]);
  const weekDays = useMemo(() => WEEKDAY_LABELS.map((_, index) => formatWeekDay(weekWindow.from, index)), [weekWindow.from]);
  const visibleDayIndexes = viewMode === "day" ? [activeDay] : [0, 1, 2, 3, 4, 5, 6];
  const monthDate = new Date(`${calendarMonth}-01T00:00:00Z`);
  const monthStartOffset = (monthDate.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0)).getUTCDate();
  const selectDate = (dateKey: string) => {
    setSelectedDate(dateKey); setCalendarMonth(dateKey.slice(0, 7));
    setActiveDay((new Date(`${dateKey}T00:00:00Z`).getUTCDay() + 6) % 7);
    setViewMode("day");
  };
  const moveMonth = (offset: number) => {
    const next = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + offset, 1));
    setCalendarMonth(next.toISOString().slice(0, 7));
  };

  const refresh = useCallback(async (): Promise<Appointment[]> => {
    setLoading(true);
    setError("");
    try {
      const rows = useMocks
        ? await getAppointments()
        : await loadAgenda({ locationId: locationFilter === "all" ? undefined : Number(locationFilter), from: new Date(new Date(weekWindow.from).getTime() + 5 * 3600000).toISOString(), to: new Date(new Date(weekWindow.to).getTime() + 5 * 3600000).toISOString() });
      setAppointments(rows);
      return rows;
    } catch (caught) {
      setError(toApiError(caught).message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [locationFilter, weekWindow.from, weekWindow.to]);

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

  const visible = useMemo(() => appointments.filter((appointment) => {
    const appointmentPractitioner = appointment.practitionerId != null ? String(appointment.practitionerId) : `name:${appointment.doctor}`;
    const appointmentLocation = useMocks ? appointment.branch : String(appointment.locationId ?? "");
    return (
      (appointment.startUtc ? weekForDate(formatDateKey(appointment.startUtc, appointment.timeZone ?? "America/Lima")).from === weekWindow.from : useMocks && weekWindow.from === currentWeekWindow().from) &&
      (locationFilter === "all" || appointmentLocation === locationFilter) &&
      (practitionerFilter === "all" || appointmentPractitioner === practitionerFilter) &&
      statusFilter.includes(agendaState(appointment.status))
    );
  }), [appointments, locationFilter, practitionerFilter, statusFilter, weekWindow.from]);
  const dayAppointments = useMemo(() => visible.filter((appointment) => appointment.day === activeDay), [activeDay, visible]);

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

  const closeDetail = () => {
    if (busy) return;
    setSelected(null);
    setDetail(null);
    setRescheduleOpen(false);
    setCancelOpen(false);
    setRescheduleSlots([]);
    setRescheduleSlot("");
    setEditOpen(false);
    setDeleteOpen(false);
  };

  const openEdit = () => {
    if (!selected) return;
    setError("");
    setEditDate(selected.startUtc ? formatDateKey(selected.startUtc, selected.timeZone ?? "America/Lima") : new Date(new Date(currentWeekWindow().from).getTime() + selected.day * 86400000).toISOString().slice(0, 10));
    setEditOpen(true);
  };

  const submitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const updated = await editDemoAppointment(selected.id, { patient: String(form.get("patient")).trim(), treatment: String(form.get("treatment")).trim(), doctor: String(form.get("doctor")).trim(), branch: String(form.get("branch")).trim(), date: editDate, time: String(form.get("time")) });
      setSelected(updated); selectDate(editDate); setEditOpen(false);
      window.dispatchEvent(new Event("appointment-created"));
    } catch (caught) { setError(toApiError(caught).message); }
    finally { setBusy(false); }
  };

  const submitDelete = async () => {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      await deleteDemoAppointment(selected.id);
      setSelected(null); setDeleteOpen(false); setDetail(null);
      window.dispatchEvent(new Event("appointment-created"));
    } catch (caught) { setError(toApiError(caught).message); }
    finally { setBusy(false); }
  };

  const canRecordAttendance = (appointment: Appointment): boolean => {
    if (appointment.status !== "Confirmada") return false;
    if (!appointment.startUtc) return true;
    return new Date(appointment.startUtc).getTime() <= Date.now() + 15 * 60_000;
  };

  const startReschedule = async () => {
    if (!selected?.serviceId || !selected.locationId || !selected.practitionerId) return;
    setRescheduleOpen(true);
    setRescheduleLoading(true);
    setRescheduleSlots([]);
    setRescheduleSlot("");
    setError("");
    try {
      const window = currentWeekWindow(selected.timeZone ?? "America/Lima");
      const slots = await getSlots({
        service_id: selected.serviceId,
        location_id: selected.locationId,
        window_start: window.from,
        window_end: window.to,
      });
      // The SlotQuery contract returns eligible practitioners. A reschedule
      // keeps the appointment's practitioner because the mutation accepts only
      // a new start, so only that practitioner's canonical slots are valid here.
      setRescheduleSlots(slots.filter((slot) => slot.practitioner_id === selected.practitionerId));
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      setRescheduleLoading(false);
    }
  };

  const updateDetailAfterMutation = async (appointmentId: string, rows: Appointment[]) => {
    const next = rows.find((appointment) => appointment.id === appointmentId);
    if (next) setSelected(next);
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
      await rescheduleReal(Number(selected.id), rescheduleSlot, newIdempotencyKey());
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
      await cancelReal(Number(selected.id), newIdempotencyKey());
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

  return (
    <div className="agenda-layout">
      <section className="page agenda-page">
        <div className="page-heading page-heading--with-actions">
          <div>
            <h1>Agenda de citas</h1>
            <p>{formatWeekRange(weekWindow.from)}</p>
          </div>
          <div className="filter-row filter-row--heading">
            <label className="select-control"><span className="sr-only">Periodo</span><select value={viewMode} onChange={(event) => setViewMode(event.target.value as ViewMode)}><option value="week">Semana</option><option value="day">Día</option></select><ChevronDown size={16} aria-hidden="true" /></label>
            {viewMode === "day" && <label className="select-control"><span className="sr-only">Día de la semana</span><select value={String(activeDay)} onChange={(event) => selectDate(new Date(new Date(weekWindow.from).getTime() + Number(event.target.value) * 86400000).toISOString().slice(0, 10))}>{weekDays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select><ChevronDown size={16} aria-hidden="true" /></label>}
            <label className="select-control"><MapPin size={18} aria-hidden="true" /><span className="sr-only">Sede</span><select value={locationFilter} onChange={(event) => { setLocationFilter(event.target.value); setPractitionerFilter("all"); }}><option value="all">Todas las sedes</option>{locationChoices.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={16} aria-hidden="true" /></label>
            {practitionerChoices.length > 0 && <label className="select-control"><UserRound size={18} aria-hidden="true" /><span className="sr-only">Odontólogo</span><select value={practitionerFilter} onChange={(event) => setPractitionerFilter(event.target.value)}><option value="all">Todos los odontólogos</option>{practitionerChoices.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={16} aria-hidden="true" /></label>}
            <div className="agenda-status-filter" ref={statusFilterRef}>
              <button ref={statusTriggerRef} type="button" className="select-control" aria-expanded={statusOpen} aria-controls="agenda-status-options" onClick={() => { setStatusDraft([...statusFilter]); setStatusOpen((value) => !value); }}><SlidersHorizontal size={18} /><span>Estado: {statusFilter.length === AGENDA_STATES.length ? "Todos" : `${statusFilter.length} seleccionados`}</span><ChevronDown size={16} /></button>
              {statusOpen && <div className="agenda-status-options" id="agenda-status-options"><label className="agenda-status-all"><input type="checkbox" checked={statusDraft.length === AGENDA_STATES.length} onChange={(event) => setStatusDraft(event.target.checked ? [...AGENDA_STATES] : [])} />Todos</label><div>{AGENDA_STATES.map((state) => <label key={state}><input type="checkbox" checked={statusDraft.includes(state)} onChange={(event) => setStatusDraft((current) => event.target.checked ? [...current, state] : current.filter((item) => item !== state))} />{state}</label>)}</div><footer><Button compact onClick={() => setStatusOpen(false)}>Cerrar</Button><Button compact variant="primary" onClick={() => { setStatusFilter([...statusDraft]); setStatusOpen(false); }}>Aplicar</Button></footer></div>}
            </div>
          </div>
        </div>

        {error && <div className="form-error agenda-error" role="alert">{error}<Button compact onClick={() => void refresh()}>Reintentar</Button></div>}

        {loading ? (
          <div className="agenda-loading" role="status" aria-live="polite" aria-busy="true"><div className="skeleton skeleton--wide" /><div className="skeleton skeleton--calendar" /><span>Cargando agenda…</span></div>
        ) : (
          <>
            <div className={`calendar-grid calendar-grid--${viewMode}`} aria-label={viewMode === "week" ? "Agenda semanal" : "Agenda diaria"}>
              <div className="calendar-corner" />
              {visibleDayIndexes.map((dayIndex) => <div key={weekDays[dayIndex]} className={`calendar-day ${dayIndex === activeDay ? "calendar-day--today" : ""}`}>{weekDays[dayIndex]}</div>)}
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
            {(viewMode === "day" ? dayAppointments.length : visible.length) === 0 && <div className="empty-state agenda-empty" role="status"><CalendarDays size={24} aria-hidden="true" /><strong>No hay citas para esta fecha y filtros.</strong><span>Prueba otra fecha, sede, odontólogo o estado.</span></div>}
          </>
        )}
      </section>

      <aside className="day-summary">
        <div className="agenda-mini-calendar">
          <header><label><span className="sr-only">Mes del calendario</span><input type="month" value={calendarMonth} onChange={(event) => { if (event.target.value) setCalendarMonth(event.target.value); }} /></label><button type="button" aria-label="Mes anterior" onClick={() => moveMonth(-1)}><ChevronLeft size={18} /></button><button type="button" aria-label="Mes siguiente" onClick={() => moveMonth(1)}><ChevronRight size={18} /></button></header>
          <div className="mini-calendar-weekdays">{["L", "M", "M", "J", "V", "S", "D"].map((label, index) => <span key={index}>{label}</span>)}</div>
          <div className="mini-calendar-days">{Array.from({ length: monthStartOffset }, (_, index) => <span key={`blank-${index}`} />)}{Array.from({ length: daysInMonth }, (_, index) => { const dateKey = `${calendarMonth}-${String(index + 1).padStart(2, "0")}`; return <button key={dateKey} type="button" aria-label={`Ir al ${dateKey}`} aria-pressed={selectedDate === dateKey} onClick={() => selectDate(dateKey)}>{index + 1}</button>; })}</div>
        </div>
        <h2>Resumen del día</h2><h3>{weekDays[activeDay] ?? "Hoy"}</h3>
        <div className="summary-stats">
          <div><CalendarDays className="text-blue" aria-hidden="true" /><strong>{dayAppointments.length}</strong><span>citas</span></div>
          <div><CheckCircle2 className="text-green" aria-hidden="true" /><strong>{dayAppointments.filter((item) => item.status === "Confirmada").length}</strong><span>confirmadas</span></div>
          <div><Clock3 className="text-amber" aria-hidden="true" /><strong>{dayAppointments.filter((item) => item.status !== "Confirmada" && item.status !== "Cancelada").length}</strong><span>pendientes</span></div>
        </div>
        <div className="summary-divider" />
        <h2>Agenda por odontólogo</h2>
        {practitionerChoices.length === 0 && <p className="summary-empty">No hay odontólogos en la vista.</p>}
        {practitionerChoices.map((practitioner) => (
          <button key={practitioner.value} className={`doctor-card doctor-card--blue ${practitionerFilter === practitioner.value ? "doctor-card--active" : ""}`} type="button" aria-pressed={practitionerFilter === practitioner.value} onClick={() => setPractitionerFilter(practitionerFilter === practitioner.value ? "all" : practitioner.value)}><span>{practitioner.label.slice(0, 2).toUpperCase()}</span><strong>{practitioner.label}</strong><b aria-hidden="true">›</b></button>
        ))}
        {agendaUsers.map((name) => <div className="agenda-added-user" key={name}><CheckCircle2 size={18} /><span>{name}</span><button type="button" aria-label={`Quitar usuario ${name}`} onClick={() => setAgendaUsers((current) => current.filter((item) => item !== name))}><XCircle size={16} /></button></div>)}
        <button className="agenda-add-user" type="button" onClick={() => setUserOpen(true)}><UserRoundPlus size={20} />Agregar usuario</button>
      </aside>

      <Modal title="Agregar usuario a la agenda" open={userOpen} onClose={() => setUserOpen(false)} size="small"><form className="transfer-form" onSubmit={(event) => { event.preventDefault(); const name = userName.trim(); if (!useMocks || !name) return; setAgendaUsers((current) => current.includes(name) ? current : [...current, name]); setUserName(""); setUserOpen(false); }}><p>{useMocks ? "Vista previa: agrega un usuario a esta lista. No crea una cuenta ni permisos; se conserva mientras la agenda esté abierta." : "La creación de cuentas y permisos estará disponible en Configuración > Usuarios y roles."}</p>{useMocks && <label className="field"><span>Nombre del usuario</span><input value={userName} onChange={(event) => setUserName(event.target.value)} required autoFocus /></label>}<div className="form-actions"><Button type="button" onClick={() => setUserOpen(false)}>Cancelar</Button><Button type="submit" variant="primary" disabled={!useMocks || !userName.trim()}>Agregar usuario</Button></div></form></Modal>

      <Drawer title="Detalle de la cita" open={Boolean(selected)} onClose={closeDetail}>
        {selected && <div className="detail-list appointment-detail">
          {detailLoading && <div className="detail-loading" role="status">Actualizando detalle…</div>}
          <div><span>{selected.patientId ? "Patient canónico" : "Lead / contacto"}</span><strong>{detail?.patient_name ?? detail?.lead_name ?? selected.patient}</strong></div>
          <div><span>Servicio</span><strong>{detail?.service_name ?? selected.treatment}</strong></div>
          <div><span>Fecha y hora</span><strong>{formatAppointmentDateTime(detailStart, detailEnd, detailTimeZone)}</strong></div>
          {durationMinutes(detailStart, detailEnd) && <div><span>Duración</span><strong>{durationMinutes(detailStart, detailEnd)} min</strong></div>}
          <div><span>Sede</span><strong>{detail?.location_name ?? selected.branch}</strong></div>
          <div><span>Odontólogo</span><strong>{detail?.practitioner_name ?? selected.doctor}</strong></div>
          <div><span>Estado</span><Badge tone={statusTone(detailState)}>{detailState}</Badge></div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="form-actions appointment-detail__actions">
            <Button onClick={closeDetail}>Cerrar</Button>
            {canRecordAttendance(selected) && <Button variant="primary" onClick={() => { setAttendanceAppointment(selected); setAttendanceDetail(detail); closeDetail(); }}>Registrar atención</Button>}
            {useMocks && <><Button onClick={openEdit}>Editar cita</Button><Button variant="danger" onClick={() => { setError(""); setDeleteOpen(true); }}>Eliminar cita</Button></>}
            {!useMocks && detailState !== "Cancelada" && <>
              <Button onClick={() => void startReschedule()} disabled={busy || detailLoading}>Reprogramar</Button>
              <Button variant="danger" onClick={() => { setError(""); setCancelOpen(true); }} disabled={busy || detailLoading}>Cancelar cita</Button>
            </>}
          </div>
        </div>}
      </Drawer>

      <AttendancePanel appointment={attendanceAppointment} detail={attendanceDetail} onClose={() => { setAttendanceAppointment(null); setAttendanceDetail(null); }} />
      <Modal title="Editar cita" open={editOpen} onClose={() => !busy && setEditOpen(false)}>
        <form className="form-grid" onSubmit={submitEdit}>
          <label className="field field--wide"><span>Paciente</span><input name="patient" defaultValue={selected?.patient} required autoFocus /></label>
          <label className="field"><span>Tratamiento</span><input name="treatment" defaultValue={selected?.treatment} required /></label>
          <label className="field"><span>Odontólogo</span><select name="doctor" defaultValue={selected?.doctor}>{practitionerChoices.map((choice) => <option key={choice.value}>{choice.label}</option>)}</select></label>
          <label className="field"><span>Sede</span><select name="branch" defaultValue={selected?.branch}>{locationChoices.map((choice) => <option key={choice.value}>{choice.label}</option>)}</select></label>
          <label className="field"><span>Fecha</span><input type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} required /></label>
          <label className="field"><span>Hora</span><input name="time" type="time" defaultValue={selected?.time} required /></label>
          {error && <p className="form-error field--wide" role="alert">{error}</p>}
          <div className="form-actions field--wide"><Button type="button" onClick={() => setEditOpen(false)} disabled={busy}>Cancelar</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? "Guardando…" : "Guardar cambios"}</Button></div>
        </form>
      </Modal>
      <Modal title="Eliminar cita" open={deleteOpen} onClose={() => !busy && setDeleteOpen(false)} size="small"><div className="confirmation-message"><XCircle size={48} /><h3>¿Eliminar la cita de {selected?.patient}?</h3><p>La cita se quitará de la agenda de demostración. Esta acción no se puede deshacer.</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><Button onClick={() => setDeleteOpen(false)} disabled={busy}>Mantener cita</Button><Button variant="danger" onClick={() => void submitDelete()} disabled={busy}>{busy ? "Eliminando…" : "Eliminar cita"}</Button></div></div></Modal>

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
