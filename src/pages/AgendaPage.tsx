import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronDown, Clock3, MapPin, SlidersHorizontal, XCircle } from "lucide-react";
import { getAppointments } from "../api";
import { Badge, statusTone } from "../components/Badge";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import type { Appointment } from "../types";

const days = ["Lunes 10", "Martes 11", "Miércoles 12", "Jueves 13", "Viernes 14", "Sábado 15"];
const hours = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00"];

export function AgendaPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [branch, setBranch] = useState("Todas las sedes");
  const [status, setStatus] = useState("Todos los estados");

  const load = useCallback(() => { void getAppointments().then(setAppointments); }, []);
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

  return (
    <div className="agenda-layout">
      <section className="page agenda-page">
        <div className="page-heading page-heading--with-actions">
          <div><h1>Agenda de citas</h1><p>10 – 15 agosto 2026</p></div>
          <div className="filter-row filter-row--heading">
            <Button icon={CalendarDays}>Hoy</Button>
            <label className="select-control"><span className="sr-only">Periodo</span><select defaultValue="Semana"><option>Semana</option><option>Día</option></select><ChevronDown size={16} /></label>
            <label className="select-control"><MapPin size={18} /><span className="sr-only">Sede</span><select value={branch} onChange={(event) => setBranch(event.target.value)}><option>Todas las sedes</option><option>Lince</option><option>Jesús María</option><option>Magdalena</option></select><ChevronDown size={16} /></label>
            <label className="select-control"><SlidersHorizontal size={18} /><span className="sr-only">Estado</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option>Todos los estados</option><option>Confirmada</option><option>Por confirmar</option><option>No respondió</option></select><ChevronDown size={16} /></label>
          </div>
        </div>

        <div className="calendar-grid" aria-label="Agenda semanal">
          <div className="calendar-corner" />
          {days.map((day, index) => <div key={day} className={`calendar-day ${index === 4 ? "calendar-day--today" : ""}`}>{day}</div>)}
          {hours.map((hour) => [
            <div key={`${hour}-label`} className="calendar-time">{Number(hour.slice(0, 2)) >= 12 ? `${Number(hour.slice(0, 2)) === 12 ? 12 : Number(hour.slice(0, 2)) - 12}:00 p. m.` : `${Number(hour.slice(0, 2))}:00 a. m.`}</div>,
            ...days.map((_, dayIndex) => <div key={`${hour}-${dayIndex}`} className="calendar-cell">
              {inCell(dayIndex, hour).map((appointment) => (
                <button key={appointment.id} className={`appointment-card appointment-card--${statusTone(appointment.status)}`} style={{ marginTop: appointment.time.endsWith(":30") ? "38px" : "4px" }} onClick={() => setSelected(appointment)}>
                  <span className="appointment-card__top"><strong>{appointment.time}</strong>{appointment.status === "Confirmada" ? <CheckCircle2 size={17} /> : appointment.status === "Por confirmar" ? <Clock3 size={17} /> : <XCircle size={17} />}</span>
                  <span>{appointment.patient} · {appointment.treatment}</span>
                  <Badge tone={statusTone(appointment.status)}>{appointment.status}</Badge>
                </button>
              ))}
            </div>),
          ])}
        </div>
      </section>

      <aside className="day-summary">
        <h2>Resumen del día</h2><h3>Viernes 14</h3>
        <div className="summary-stats">
          <div><CalendarDays className="text-blue" /><strong>8</strong><span>citas</span></div>
          <div><CheckCircle2 className="text-green" /><strong>5</strong><span>confirmadas</span></div>
          <div><Clock3 className="text-amber" /><strong>2</strong><span>por confirmar</span></div>
        </div>
        <div className="summary-divider" />
        <h2>Agenda por odontólogo</h2>
        <button className="doctor-card doctor-card--blue"><span>VR</span><strong>Dra. Valeria Ruiz</strong><b>›</b></button>
        <button className="doctor-card doctor-card--pink"><span>ML</span><strong>Dr. Mateo León</strong><b>›</b></button>
      </aside>

      <Modal title="Detalle de la cita" open={Boolean(selected)} onClose={() => setSelected(null)}>
        {selected && <div className="detail-list">
          <div><span>Paciente</span><strong>{selected.patient}</strong></div>
          <div><span>Tratamiento</span><strong>{selected.treatment}</strong></div>
          <div><span>Fecha y hora</span><strong>{days[selected.day]} · {selected.time}</strong></div>
          <div><span>Odontólogo</span><strong>{selected.doctor}</strong></div>
          <div><span>Sede</span><strong>{selected.branch}</strong></div>
          <div><span>Estado</span><Badge tone={statusTone(selected.status)}>{selected.status}</Badge></div>
          <div className="form-actions"><Button onClick={() => setSelected(null)}>Cerrar</Button><Button variant="primary">Editar cita</Button></div>
        </div>}
      </Modal>
    </div>
  );
}
