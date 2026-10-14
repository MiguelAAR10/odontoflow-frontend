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
  agendaDateKey,
  agendaWeekReadWindow,
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
import { createLatestRequest } from "../session";
import { useAgent } from "../agui/useAgent";
import { useShellContext } from "../components/shell/ShellContext";
import { Card as CatalogCard } from "../catalog/Card";
import type { DemoAgendaData } from "../agui/sim/gaps";

const LIMA = "America/Lima";
const APPOINTMENT_KINDS = [
  ["urgencia", "Urgencia"], ["evaluacion", "Evaluación"], ["tratamiento", "Tratamiento"],
  ["control", "Control"], ["ortodoncia", "Ortodoncia"],
] as const;
interface DayEntry {
  id: string; start: string; end: string; doctorId: string; doctor: string;
  patient: string; procedure: string; state: string; kind?: string;
}
interface DayGap { start: string; end: string; doctorId: string; minutes: number; offerable: boolean }

/** Shared presentation only: real appointments keep their backend state and
 * unclassified procedures stay neutral rather than guessing a clinical type. */
function DoctorDayCalendar({ entries, gaps = [], now, date, onSelect, onOffer, busy = false }: {
  entries: DayEntry[]; gaps?: DayGap[]; now: string; date: string;
  onSelect: (id: string) => void; onOffer?: () => void; busy?: boolean;
}) {
  const [doctor, setDoctor] = useState("all");
  const scroll = useRef<HTMLDivElement>(null);
  const doctors = Array.from(new Map(entries.map(row => [row.doctorId, row.doctor])).entries());
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 600px)");
    const update = () => setMobile(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const chosenDoctor = doctors.some(([id]) => id === doctor) ? doctor : "all";
  const shown = chosenDoctor === "all" ? (mobile ? doctors.slice(0, 1) : doctors) : doctors.filter(([id]) => id === chosenDoctor);
  const minute = (instant: string) => {
    const [hour, min] = formatSlotTime(instant, LIMA).split(":").map(Number);
    return hour * 60 + min;
  };
  const start = Math.min(480, ...entries.map(row => minute(row.start)));
  const end = Math.max(1170, ...entries.map(row => minute(row.end)));
  const px = 1.4;
  const position = (from: string, to: string) => ({ top: (minute(from) - start) * px + 2, height: Math.max(30, (Date.parse(to) - Date.parse(from)) / 60_000 * px - 4) });
  const nowMinute = minute(now);
  const showNow = formatDateKey(now, LIMA) === date && nowMinute >= start && nowMinute <= end;
  const first = entries.length ? Math.min(...entries.map(row => minute(row.start))) : start;
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = Math.max(0, (first - start - 30) * px); }, [date, first, start]);
  return <div className="airi-day-calendar">
    {entries.some(row => row.kind) ? <div className="airi-agenda-legend" aria-label="Tipos de atención">
      {APPOINTMENT_KINDS.map(([kind, label]) => <span key={kind}><i className={`airi-kind-${kind}`} />{label}</span>)}
      {gaps.length ? <span><i className="airi-kind-gap" />Hueco</span> : null}
    </div> : null}
    <label className="airi-doctor-select">Ver odontólogo<select value={mobile && chosenDoctor === "all" ? doctors[0]?.[0] ?? "all" : chosenDoctor} onChange={event => setDoctor(event.target.value)}>
      {!mobile ? <option value="all">Todos los odontólogos</option> : null}
      {doctors.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
    </select></label>
    {shown.length ? <div className="airi-agenda-scroll" ref={scroll} role="region" aria-label="Agenda del día por odontólogo" tabIndex={0}>
      <div className="airi-doctor-grid" style={{ gridTemplateColumns: `58px repeat(${shown.length}, minmax(0, 1fr))` }}>
        <div className="airi-doctor-head airi-doctor-corner" aria-hidden="true" />
        {shown.map(([id, label]) => <h2 className="airi-doctor-head" key={id}>{label}</h2>)}
        <div className="airi-agenda-hours" style={{ height: (end - start) * px }} aria-hidden="true">
          {Array.from({ length: Math.ceil((end - start) / 60) }, (_, i) => <span key={i} style={{ top: i * 60 * px + 4 }}>{String(Math.floor(start / 60) + i).padStart(2, "0")}:00</span>)}
          {showNow ? <b className="airi-now-label" style={{ top: (nowMinute - start) * px }}>{formatSlotTime(now, LIMA)}</b> : null}
        </div>
        {shown.map(([id, label]) => <section key={id} className="airi-doctor-column" aria-label={label} style={{ height: (end - start) * px }}>
          {Array.from({ length: Math.ceil((end - start) / 60) }, (_, i) => <span key={i} className="airi-hour-rule" style={{ top: i * 60 * px }} />)}
          {entries.filter(row => row.doctorId === id && formatDateKey(row.start, LIMA) === date).map(row => <button type="button" key={row.id} data-appointment={row.id}
            className={`airi-agenda-appointment airi-kind-${row.kind ?? "unknown"} ${Date.parse(row.end) <= Date.parse(now) ? "airi-appointment-past" : ""}`}
            style={position(row.start, row.end)} onClick={() => onSelect(row.id)} aria-label={`${formatSlotTime(row.start, LIMA)} ${row.patient}, ${row.procedure}, ${row.state}`}>
            <b>{formatSlotTime(row.start, LIMA)} {row.patient}</b>{Date.parse(row.end) - Date.parse(row.start) >= 45 * 60_000 ? <span>{row.procedure} · {row.state}</span> : null}
          </button>)}
          {gaps.filter(gap => gap.doctorId === id).map(gap => <button type="button" key={gap.start} data-gap={id} style={position(gap.start, gap.end)}
            className="airi-agenda-appointment airi-agenda-gap" disabled={!gap.offerable || busy} onClick={onOffer}
            aria-label={`${formatSlotTime(gap.start, LIMA)} Hueco ${gap.minutes} min, ${label}${gap.offerable ? ", ofrecer a lista de espera" : ", sin propuesta disponible"}`}>
            <b>{formatSlotTime(gap.start, LIMA)} · Hueco {gap.minutes} min</b><span>{gap.offerable ? "Ofrecer a lista de espera" : "Sin propuesta disponible"}</span>
          </button>)}
          {showNow ? <div className="airi-agenda-now" style={{ top: (nowMinute - start) * px }} aria-label={`Hora Lima ${formatSlotTime(now, LIMA)}`} /> : null}
        </section>)}
      </div>
    </div> : <p role="status" className="airi-agenda-empty">No hay citas para esta fecha y filtros.</p>}
    <AgendaStyles />
  </div>;
}

function DemoAgenda() {
  const agent = useAgent();
  const { role } = useShellContext();
  const [data, setData] = useState<DemoAgendaData | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<DayEntry | null>(null);
  const [receipt, setReceipt] = useState<Record<string, string>>({});
  const approved = Object.values(agent.cards).filter(entry => ["r-oferta", "cv-oferta"].includes(entry.card.id) && entry.status === "approved").map(entry => entry.card.id).join(",");
  useEffect(() => {
    if (!approved) { setReceipt({}); return; }
    setReceipt(previous => Object.fromEntries(approved.split(",").map(id => [id, previous[id] ?? new Date().toISOString()])));
  }, [approved]);
  useEffect(() => {
    let active = true;
    import("../agui/sim/gaps").then(module => module.readDemoAgenda()).then(result => { if (active) setData(result); })
      .catch(caught => { if (active) setError(toApiError(caught).message); });
    return () => { active = false; };
  }, []);
  if (!data) return <section className="airi-agenda-view"><h1>Agenda de hoy</h1>{error ? <p role="alert">{error}</p> : <p role="status">Cargando agenda…</p>}</section>;
  const date = formatDateKey(data.cutAt, LIMA);
  const rows: DayEntry[] = data.appointments.map(row => ({ id: row.id, start: row.start_at, end: row.end_at, doctorId: row.practitioner, doctor: row.practitioner_name,
    patient: row.patient, procedure: row.procedure, state: row.state, kind: row.kind }));
  const gaps: DayGap[] = data.visibleGaps(data.declared, data.appointments, { date, now: data.cutAt }).map(gap => ({
    start: gap.start_at, end: gap.end_at, doctorId: gap.practitioner, minutes: gap.duration_minutes,
    offerable: role === "admin" && gap.start_at === data.offer?.start_at && gap.practitioner === data.offer?.practitioner,
  }));
  const offers = Object.values(agent.cards).filter(entry => ["r-oferta", "cv-oferta"].includes(entry.card.id));
  const offer = () => { if (offers.length) { agent.openPanel(); return; } setError(""); void agent.send("¿Quién puede tomar el hueco de la tarde?", { role, view: "agenda", viewing: "Agenda" }).catch(caught => setError(toApiError(caught).message)); };
  return <section className="airi-agenda-view" aria-labelledby="airi-agenda-title">
    <header className="airi-agenda-heading"><div><h1 id="airi-agenda-title">Agenda de hoy</h1><p>Lince · {formatSlotDate(date)} · hora Lima</p></div>
      {role === "admin" ? <button type="button" className="airi-agenda-ask" disabled={agent.working} onClick={offer}><CalendarDays size={18} aria-hidden="true" />Consultar el hueco</button> : null}
    </header>
    <p className="airi-agenda-note">Demostración · corte del {formatSlotDate(date)} a las {formatSlotTime(data.cutAt, LIMA)}. Los colores indican el tipo de atención; el pasado conserva su estado.</p>
    {error ? <p role="alert">{error}</p> : null}
    <DoctorDayCalendar entries={rows} gaps={gaps} date={date} now={data.cutAt} onSelect={id => setSelected(rows.find(row => row.id === id) ?? null)} onOffer={offer} busy={agent.working} />
    {offers.length ? <section className="airi-agenda-decisions" aria-label="Oferta para el hueco"><h2>La oferta, para tu revisión</h2>{offers.map(entry => <div key={entry.card.id}>
      <CatalogCard card={entry.card} status={entry.status} error={entry.error} loadingReason={entry.loadingReason ?? null} onApprove={() => agent.approve(entry.card.id)} />
      {entry.status === "approved" && receipt[entry.card.id] ? <p className="airi-agenda-receipt" role="status">Confirmación recibida a las <time dateTime={receipt[entry.card.id]}>{formatSlotTime(receipt[entry.card.id], LIMA)}</time> (Lima). El hueco sigue libre hasta la aceptación de la paciente.</p> : null}
    </div>)}</section> : null}
    <Drawer title="Detalle de la cita" open={!!selected} onClose={() => setSelected(null)}>{selected ? <dl className="airi-agenda-detail">
      <dt>Paciente</dt><dd>{selected.patient}</dd><dt>Atención</dt><dd>{selected.procedure}</dd><dt>Odontólogo</dt><dd>{selected.doctor}</dd><dt>Horario · Lima</dt><dd>{formatAppointmentDateTime(selected.start, selected.end, LIMA)}</dd><dt>Estado registrado</dt><dd>{selected.state}</dd>
    </dl> : null}</Drawer>
    <AgendaStyles />
  </section>;
}

function AgendaStyles() {
  return <style>{`
    .airi-agenda-view{padding:28px 32px 120px;max-width:1400px;margin:auto;min-width:0;color:var(--ink)}
    .airi-agenda-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}
    .airi-agenda-heading h1{font-family:var(--font-display);font-size:30px;font-weight:600;line-height:1.15;margin:0 0 6px}
    .airi-agenda-heading p{margin:0;color:var(--muted);font-size:14px}
    .airi-agenda-ask{display:flex;gap:8px;align-items:center;padding:10px 14px;border:1px solid var(--line-2);border-radius:10px;background:var(--surface);color:var(--ink);font-size:14px;min-height:44px}
    .airi-agenda-note{font-size:13px;color:var(--muted);margin:0 0 20px;max-width:80ch;line-height:1.6}
    .airi-day-calendar{min-width:0}.airi-agenda-legend{display:flex;flex-wrap:wrap;gap:10px 18px;margin-bottom:12px;font-size:13px;color:var(--ink-2)}
    .airi-agenda-legend span{display:flex;align-items:center;gap:6px}.airi-agenda-legend i{height:10px;width:10px;border-radius:50%}
    .airi-kind-urgencia{background:#F04438;color:#111214}.airi-kind-evaluacion{background:#FFC31F;color:#111214}
    .airi-kind-tratamiento{background:#1F5BFF;color:#fff}.airi-kind-control{background:#22C55E;color:#111214}.airi-kind-ortodoncia{background:#9B5CF6;color:#111214}
    .airi-kind-unknown{background:var(--surface-2);color:var(--ink);border:1px solid var(--line-2)!important}.airi-kind-gap{background:var(--muted)}
    .airi-doctor-select{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--ink-2);margin-bottom:12px}
    .airi-doctor-select select{background:var(--surface);color:var(--ink);border:1px solid var(--line-2);border-radius:9px;padding:9px;min-height:44px;max-width:100%;min-width:0}
    .airi-agenda-scroll{border:1px solid var(--line);border-radius:14px;background:var(--surface);overflow:auto;max-height:640px;scroll-padding-top:55px}
    .airi-doctor-grid{display:grid;position:relative;min-width:0}.airi-doctor-head{position:sticky;top:0;z-index:4;background:var(--surface);padding:14px 10px;border-bottom:1px solid var(--line);font-size:14px;font-weight:500;line-height:1.4;margin:0}
    .airi-doctor-head:not(.airi-doctor-corner){border-left:1px solid var(--line)}
    .airi-agenda-hours{position:relative}.airi-agenda-hours>span{position:absolute;right:7px;font-size:12px;color:var(--muted);font-family:var(--font-display);font-variant-numeric:tabular-nums}
    .airi-doctor-column{position:relative;border-left:1px solid var(--line);min-width:0}.airi-hour-rule{position:absolute;left:0;right:0;border-top:1px solid var(--line)}
    .airi-agenda-appointment{position:absolute;left:5px;right:5px;text-align:left;border:0;border-radius:9px;padding:5px 8px;font-size:12px;line-height:1.3;overflow:hidden}
    .airi-agenda-appointment b{display:block;font-weight:600;font-size:13px;line-height:1.3;font-variant-numeric:tabular-nums}.airi-agenda-appointment span{display:block;margin-top:2px}
    .airi-agenda-appointment:hover{outline:2px solid var(--ink);outline-offset:1px}.airi-agenda-appointment:focus-visible,.airi-agenda-ask:focus-visible,.airi-doctor-select select:focus-visible{outline:3px solid var(--focus);outline-offset:3px;z-index:5}
    .airi-appointment-past{background:var(--surface-2);color:var(--ink-2);border-left:4px solid var(--ink-2);filter:saturate(.25)}
    .airi-appointment-past.airi-kind-control{border-left-color:#0C8137}.airi-appointment-past.airi-kind-tratamiento{border-left-color:#1F5BFF}.airi-appointment-past.airi-kind-evaluacion{border-left-color:#AC7900}
    .airi-agenda-gap{background:repeating-linear-gradient(135deg,var(--surface) 0 6px,var(--surface-2) 6px 12px);border:1.5px dashed var(--line-2);color:var(--ink-2);padding:3px 7px}
    .airi-agenda-gap b{font-size:12px}.airi-agenda-gap span{font-size:11px;line-height:1.1;margin-top:0}.airi-agenda-gap:disabled{opacity:1;cursor:default}
    .airi-agenda-now{position:absolute;left:0;right:0;border-top:2px solid var(--red-ink);pointer-events:none;z-index:2}
    .airi-now-label{position:absolute;right:2px;transform:translateY(-50%);font-family:var(--font-display);font-size:12px;font-weight:500;background:var(--red-ink);color:var(--surface);border-radius:4px;padding:2px 4px;z-index:3}
    .airi-agenda-decisions{margin-top:26px;max-width:760px}.airi-agenda-decisions>h2{font-size:19px;font-weight:500;margin-bottom:12px}.airi-agenda-receipt{font-size:13px;color:var(--green-ink);line-height:1.6;margin:12px 0 20px}
    .airi-agenda-detail dt{font-size:13px;color:var(--muted);margin-top:16px}.airi-agenda-detail dd{margin:4px 0;font-size:16px}.airi-agenda-empty{padding:40px 12px;text-align:center;color:var(--muted)}
    @media(max-width:600px){.airi-agenda-view{padding:20px 16px 120px}.airi-agenda-heading{gap:14px;margin-bottom:14px}.airi-agenda-heading h1{font-size:26px}.airi-agenda-legend{gap:8px 12px;font-size:12px}.airi-doctor-select{display:grid;gap:6px}.airi-agenda-scroll{max-height:600px}.airi-agenda-appointment{font-size:12px}.airi-doctor-head{font-size:14px}.airi-agenda-decisions .catalog-card{max-width:100%}}
  `}</style>;
}

export function AgendaPage() {
  return useMocks ? <DemoAgenda /> : <AgendaManagement />;
}

const HOURS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00"];
const WEEKDAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const AGENDA_STATES = ["Pendiente", "Ausente", "Confirmada", "Cancelada", "Atendida"];

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
  if (status === "Confirmada" || status === "Atendida") return <CheckCircle2 size={17} aria-hidden="true" />;
  if (status === "Cancelada" || status === "Ausente") return <XCircle size={17} aria-hidden="true" />;
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

function AgendaManagement() {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date().toISOString()), 30_000); return () => window.clearInterval(timer); }, []);
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
  const [viewMode, setViewMode] = useState<ViewMode>("day");
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
  const [locations, setLocations] = useState<LocationRead[]>([]);
  const calendarTimeZone = locations.find((location) => String(location.id) === locationFilter)?.timezone ?? locations[0]?.timezone ?? "America/Lima";
  const agendaRequests = useRef(createLatestRequest());
  const detailRequests = useRef(createLatestRequest());
  const slotRequests = useRef(createLatestRequest());

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
  };
  const moveMonth = (offset: number) => {
    const next = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + offset, 1));
    setCalendarMonth(next.toISOString().slice(0, 7));
  };

  const refresh = useCallback(async (): Promise<Appointment[]> => {
    const isCurrent = agendaRequests.current.begin();
    setLoading(true);
    setError("");
    try {
      const rows = useMocks
        ? await getAppointments()
        : await loadAgenda({ locationId: locationFilter === "all" ? undefined : Number(locationFilter), ...agendaWeekReadWindow(selectedDate, calendarTimeZone) });
      if (!isCurrent()) return [];
      setAppointments(rows);
      return rows;
    } catch (caught) {
      if (isCurrent()) setError(toApiError(caught).message);
      return [];
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [locationFilter, selectedDate, calendarTimeZone]);

  useEffect(() => {
    setSelected(null);
    setDetail(null);
    setDetailLoading(false);
    setRescheduleOpen(false);
    setRescheduleLoading(false);
    setCancelOpen(false);
    void refresh();
    const reload = () => void refresh();
    window.addEventListener("appointment-created", reload);
    return () => {
      agendaRequests.current.invalidate();
      detailRequests.current.invalidate();
      slotRequests.current.invalidate();
      window.removeEventListener("appointment-created", reload);
    };
  }, [refresh]);

  useEffect(() => {
    if (useMocks) return;
    let active = true;
    void getLocations()
      .then((rows) => { if (active) setLocations(rows); })
      .catch((caught) => { if (active) setError(toApiError(caught).message); });
    return () => { active = false; };
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
    const isCurrent = detailRequests.current.begin();
    slotRequests.current.invalidate();
    setSelected(appointment);
    setDetail(null);
    setError("");
    if (useMocks) return;
    setDetailLoading(true);
    void getAgendaDetail(Number(appointment.id))
      .then((row) => { if (isCurrent()) setDetail(row); })
      .catch((caught) => { if (isCurrent()) setError(toApiError(caught).message); })
      .finally(() => { if (isCurrent()) setDetailLoading(false); });
  };

  const closeDetail = () => {
    if (busy) return;
    detailRequests.current.invalidate();
    slotRequests.current.invalidate();
    setDetailLoading(false);
    setRescheduleLoading(false);
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
    const isCurrent = slotRequests.current.begin();
    setRescheduleOpen(true);
    setRescheduleLoading(true);
    setRescheduleSlots([]);
    setRescheduleSlot("");
    setError("");
    try {
      const timeZone = selected.timeZone ?? "America/Lima";
      const window = agendaWeekReadWindow(agendaDateKey(new Date().toISOString(), timeZone), timeZone);
      const slots = await getSlots({
        service_id: selected.serviceId,
        location_id: selected.locationId,
        window_start: window.from,
        window_end: window.to,
      });
      // The SlotQuery contract returns eligible practitioners. A reschedule
      // keeps the appointment's practitioner because the mutation accepts only
      // a new start, so only that practitioner's canonical slots are valid here.
      if (isCurrent()) setRescheduleSlots(slots.filter((slot) => slot.practitioner_id === selected.practitionerId));
    } catch (caught) {
      if (isCurrent()) setError(toApiError(caught).message);
    } finally {
      if (isCurrent()) setRescheduleLoading(false);
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
            <Button compact onClick={() => selectDate(agendaDateKey(new Date().toISOString(), calendarTimeZone))}>Hoy</Button>
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
            {viewMode === "day" ? <DoctorDayCalendar entries={dayAppointments.filter(row => row.startUtc && row.endUtc).map(row => ({
              id: row.id, start: row.startUtc!, end: row.endUtc!, doctorId: String(row.practitionerId ?? row.doctor), doctor: row.doctor,
              patient: row.patient, procedure: row.treatment, state: row.status,
            }))} date={selectedDate} now={now} onSelect={id => { const row = appointments.find(item => item.id === id); if (row) openDetail(row); }} /> : <div className={`calendar-grid calendar-grid--${viewMode}`} aria-label={viewMode === "week" ? "Agenda semanal" : "Agenda diaria"}>
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
            </div>}
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
          <div><Clock3 className="text-amber" aria-hidden="true" /><strong>{dayAppointments.filter((item) => agendaState(item.status) === "Pendiente").length}</strong><span>pendientes</span></div>
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
