import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronDown, Clock3, MapPin, SlidersHorizontal, XCircle } from "lucide-react";
import { cancelReal, currentWeekWindow, getAgendaDetail, getLocations, loadAgenda, newIdempotencyKey, rescheduleReal, toApiError, useMocks } from "../api";
import { Badge, statusTone } from "../components/Badge";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import type { Appointment } from "../types";

const hours = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00"];
const STATUS_OPTIONS = ["Todos los estados", "Confirmada", "Por confirmar", "No respondió", "Cancelada"];

const WEEKDAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function AgendaPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [branch, setBranch] = useState("Todas las sedes");
  const [status, setStatus] = useState("Todos los estados");
  const [error, setError] = useState("");
  const [branchOptions, setBranchOptions] = useState<string[]>(["Lince", "Jesús María", "Magdalena"]);
  const [weekDays, setWeekDays] = useState<string[]>(["Lunes 10", "Martes 11", "Miércoles 12", "Jueves 13", "Viernes 14", "Sábado 15"]);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (useMocks) {
      void import("../api").then(({ getAppointments }) => getAppointments().then(setAppointments));
      return;
    }
    setError("");
    void loadAgenda()
      .then(setAppointments)
      .catch((caught) => setError(toApiError(caught).message));
  }, []);

  useEffect(() => {
    if (useMocks) return;
    const window = currentWeekWindow();
    const monday = new Date(window.from);
    setWeekDays(WEEKDAY_LABELS.map((label, index) => {
      const day = new Date(monday.getTime() + index * 86_400_000);
      return `${label} ${day.getUTCDate()}`;
    }));
    void getLocations()
      .then((locations) => setBranchOptions(["Todas las sedes", ...locations.map((location) => location.name)]))
      .catch(() => setError("No se pudieron cargar las sedes."));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("appointment-created", load);
    return () => window.removeEventListener("appointment-created", load);
  }, [load]);

  const visible = useMemo(() => appointments.filter((appointment) =>
    (branch === "Todas las sedes" || appointment.branch === branch) &&
    (status === "Todos los estados" || appointment.status === status)
  ), [appointments, branch, status]);

  const inCell = (day: number, hour: string) => visible.filter((appointment) => appointment.day === day && Number(appointment.time.slice(0, 2)) === Number(hour.slice(0, 2)));

  const openDetail = (appointment: Appointment) => {
    setSelected(appointment);
    setError("");
    if (useMocks) return;
    // Refresh the detail from the backend when available.
    void getAgendaDetail(Number(appointment.id))
      .then(() => { /* names/state already present in the list row */ })
      .catch((caught) => setError(toApiError(caught).message));
  };

  const submitReschedule = async () => {
    if (!selected || !rescheduleDate || !rescheduleTime) return;
    setBusy(true);
    setError("");
    try {
      const start = new Date(`${rescheduleDate}T${rescheduleTime}:00`);
      await rescheduleReal(Number(selected.id), start.toISOString(), newIdempotencyKey());
      setRescheduleOpen(false);
      setSelected(null);
      window.dispatchEvent(new Event("appointment-created"));
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
      setSelected(null);
      window.dispatchEvent(new Event("appointment-created"));
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="agenda-layout">
      <section className="page agenda-page">
        <div className="page-heading page-heading--with-actions">
          <div><h1>Agenda de citas</h1><p>{weekDays[0]?.split(" ")[1]} – {weekDays[5]?.split(" ")[1]} agosto 2026</p></div>
          <div className="filter-row filter-row--heading">
            <Button icon={CalendarDays}>Hoy</Button>
            <label className="select-control"><span className="sr-only">Periodo</span><select defaultValue="Semana"><option>Semana</option><option>Día</option></select><ChevronDown size={16} /></label>
            <label className="select-control"><MapPin size={18} /><span className="sr-only">Sede</span><select value={branch} onChange={(event) => setBranch(event.target.value)}>{branchOptions.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={16} /></label>
            <label className="select-control"><SlidersHorizontal size={18} /><span className="sr-only">Estado</span><select value={status} onChange={(event) => setStatus(event.target.value)}>{STATUS_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={16} /></label>
          </div>
        </div>

        {error && <div className="form-error" role="alert">{error}</div>}

        <div className="calendar-grid" aria-label="Agenda semanal">
          <div className="calendar-corner" />
          {weekDays.map((day, index) => <div key={day} className={`calendar-day ${index === 4 ? "calendar-day--today" : ""}`}>{day}</div>)}
          {hours.map((hour) => [
            <div key={`${hour}-label`} className="calendar-time">{Number(hour.slice(0, 2)) >= 12 ? `${Number(hour.slice(0, 2)) === 12 ? 12 : Number(hour.slice(0, 2)) - 12}:00 p. m.` : `${Number(hour.slice(0, 2))}:00 a. m.`}</div>,
            ...weekDays.map((_, dayIndex) => <div key={`${hour}-${dayIndex}`} className="calendar-cell">
              {inCell(dayIndex, hour).map((appointment) => (
                <button key={appointment.id} className={`appointment-card appointment-card--${statusTone(appointment.status)}`} style={{ marginTop: appointment.time.endsWith(":30") ? "38px" : "4px" }} onClick={() => openDetail(appointment)}>
                  <span className="appointment-card__top"><strong>{appointment.time}</strong>{appointment.status === "Confirmada" ? <CheckCircle2 size={17} /> : appointment.status === "Cancelada" ? <XCircle size={17} /> : appointment.status === "Por confirmar" ? <Clock3 size={17} /> : <XCircle size={17} />}</span>
                  <span>{appointment.patient} · {appointment.treatment}</span>
                  <Badge tone={statusTone(appointment.status)}>{appointment.status}</Badge>
                </button>
              ))}
            </div>),
          ])}
        </div>
      </section>

      <aside className="day-summary">
        <h2>Resumen del día</h2><h3>{weekDays[4] ?? "Viernes 14"}</h3>
        <div className="summary-stats">
          <div><CalendarDays className="text-blue" /><strong>{appointments.length}</strong><span>citas</span></div>
          <div><CheckCircle2 className="text-green" /><strong>{appointments.filter((item) => item.status === "Confirmada").length}</strong><span>confirmadas</span></div>
          <div><Clock3 className="text-amber" /><strong>{appointments.filter((item) => item.status === "Por confirmar").length}</strong><span>por confirmar</span></div>
        </div>
        <div className="summary-divider" />
        <h2>Agenda por odontólogo</h2>
        {[...new Set(appointments.map((item) => item.doctor))].map((doctor) => (
          <button key={doctor} className="doctor-card doctor-card--blue"><span>{(doctor ?? "?").slice(0, 2).toUpperCase()}</span><strong>{doctor}</strong><b>›</b></button>
        ))}
      </aside>

      <Modal title="Detalle de la cita" open={Boolean(selected)} onClose={() => setSelected(null)}>
        {selected && <div className="detail-list">
          <div><span>Paciente</span><strong>{selected.patient}</strong></div>
          <div><span>Tratamiento</span><strong>{selected.treatment}</strong></div>
          <div><span>Fecha y hora</span><strong>{weekDays[selected.day]} · {selected.time}</strong></div>
          <div><span>Odontólogo</span><strong>{selected.doctor}</strong></div>
          <div><span>Sede</span><strong>{selected.branch}</strong></div>
          <div><span>Estado</span><Badge tone={statusTone(selected.status)}>{selected.status}</Badge></div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="form-actions">
            <Button onClick={() => setSelected(null)}>Cerrar</Button>
            {!useMocks && selected.status === "Confirmada" && (
              <>
                <Button onClick={() => setRescheduleOpen(true)} disabled={busy}>Reprogramar</Button>
                <Button variant="danger" onClick={() => void submitCancel()} disabled={busy}>Cancelar cita</Button>
              </>
            )}
          </div>
        </div>}
      </Modal>

      <Modal title="Reprogramar cita" open={rescheduleOpen} onClose={() => setRescheduleOpen(false)}>
        <div className="form-grid">
          <label className="field"><span>Fecha</span><input type="date" value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} required /></label>
          <label className="field"><span>Hora</span><input type="time" value={rescheduleTime} onChange={(event) => setRescheduleTime(event.target.value)} required /></label>
          {error && <div className="form-error field--wide" role="alert">{error}</div>}
          <div className="form-actions field--wide"><Button onClick={() => setRescheduleOpen(false)}>Cancelar</Button><Button variant="primary" onClick={() => void submitReschedule()} disabled={busy || !rescheduleDate || !rescheduleTime}>Confirmar</Button></div>
        </div>
      </Modal>
    </div>
  );
}
