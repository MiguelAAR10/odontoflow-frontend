"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, CheckCircle2, CircleAlert, Lock, Search, X } from "lucide-react";
import Link from "next/link";
import { loadAgenda, searchPatients, toApiError } from "../api";
import { Badge, statusTone } from "../components/Badge";
import { Button } from "../components/Button";
import { Drawer } from "../components/Drawer";
import type { Appointment } from "../types";
import {
  safeHomeStage,
  type AgentFallbackStage,
  type AgentOutcomeStage,
  type HomeStage,
} from "../home/registry";
import { nowMinutes, splitWorklist } from "../home/schedule";
import type { HomePatient } from "../home/types";

/** Width at which the persistent AIRI rail still leaves the worklist legible.
 *  Below it the same rail content is served by the contextual drawer. */
const RAIL_MEDIA_QUERY = "(min-width: 1400px)";

function railIsPersistent(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(RAIL_MEDIA_QUERY).matches;
}

function localDayIndex(): number {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", weekday: "short" }).format(new Date());
  const index = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday);
  return index >= 0 ? index : 0;
}

function formatToday(): string {
  const label = new Intl.DateTimeFormat("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

function countCopy(count: number): string {
  return `${count} ${count === 1 ? "cita" : "citas"}`;
}

/** Accessible name for a worklist row: the row is the deterministic entry point
 *  into the real patient search, so the label states both the data and the act. */
function rowLabel(appointment: Appointment): string {
  const where = appointment.branch ? `, ${appointment.branch}` : "";
  return `${appointment.time} · ${appointment.patient} · ${appointment.treatment}${where} · ${appointment.status}. Buscar a este paciente con AIRI.`;
}

/** Brand-dark `A` monogram. The presence dot is static except for the
 *  request-bound pulse while a real `searchPatients` call is in flight. */
function AiriMark({ searching }: { searching: boolean }) {
  return (
    <span className="airi-mark" aria-hidden="true">
      <span className="airi-mark__letter">A</span>
      <span className={`airi-mark__dot${searching ? " airi-mark__dot--active" : ""}`} />
    </span>
  );
}

/* ---------------------------------------------------------------- masthead */

/**
 * The shape of the real day. One tick per loaded appointment, muted once its
 * wall time has passed and emphasised on the next one. It counts rows, never
 * attendance: a passed tick only means the hour is behind us.
 */
function ShiftTicks({ past, upcoming }: { past: Appointment[]; upcoming: Appointment[] }) {
  const total = past.length + upcoming.length;
  if (total === 0) return null;

  const caption =
    past.length === 0
      ? `${countCopy(total)} por delante`
      : upcoming.length === 0
        ? `${countCopy(total)} · el horario de todas ya pasó`
        : `${past.length} con hora pasada · ${upcoming.length} por venir`;

  return (
    <div className="home-shift">
      {total <= 24 ? (
        <div className="home-shift__ticks" aria-hidden="true">
          {past.map((appointment) => (
            <span className="home-shift__tick home-shift__tick--past" key={appointment.id} />
          ))}
          {upcoming.map((appointment, index) => (
            <span
              className={`home-shift__tick${index === 0 ? " home-shift__tick--next" : ""}`}
              key={appointment.id}
            />
          ))}
        </div>
      ) : (
        <div className="home-shift__bar" aria-hidden="true">
          <span className="home-shift__bar-past" style={{ flexGrow: past.length }} />
          <span className="home-shift__bar-rest" style={{ flexGrow: upcoming.length }} />
        </div>
      )}
      <p className="home-shift__caption">{caption}</p>
    </div>
  );
}

function Masthead({
  today,
  loading,
  error,
  past,
  upcoming,
  onRetry,
}: {
  today: string;
  loading: boolean;
  error: string;
  past: Appointment[];
  upcoming: Appointment[];
  onRetry: () => void;
}) {
  const total = past.length + upcoming.length;

  return (
    <header className="home-masthead">
      <div className="home-masthead__lede">
        <p className="home-masthead__eyebrow">
          <span>{today}</span>
          <span className="home-masthead__dot" aria-hidden="true" />
          <span>Todas las sedes</span>
        </p>
        <h1 className="home-masthead__title">
          {greeting()}
          <span className="home-masthead__accent">.</span>
        </h1>

        {loading && <p className="home-figure home-figure--quiet" role="status">Cargando el turno de hoy</p>}

        {!loading && error && (
          <div className="home-figure home-figure--error" role="alert">
            <span>No pudimos cargar tu turno</span>
            <Button compact variant="secondary" onClick={onRetry}>Reintentar</Button>
          </div>
        )}

        {!loading && !error && total === 0 && (
          <p className="home-figure home-figure--quiet">Sin citas registradas para hoy</p>
        )}

        {!loading && !error && total > 0 && (
          <p className="home-figure">
            <strong className="home-figure__value">{total}</strong>
            <span className="home-figure__label">{total === 1 ? "cita hoy" : "citas hoy"}</span>
            {upcoming[0] && (
              <>
                <span className="home-figure__rule" aria-hidden="true" />
                <strong className="home-figure__value home-figure__value--time">{upcoming[0].time}</strong>
                <span className="home-figure__label">la próxima</span>
              </>
            )}
          </p>
        )}
      </div>

      {!loading && !error && <ShiftTicks past={past} upcoming={upcoming} />}
    </header>
  );
}

/* ---------------------------------------------------------------- worklist */

function Spotlight({
  appointment,
  selected,
  onLocate,
}: {
  appointment: Appointment;
  selected: boolean;
  onLocate: (appointment: Appointment) => void;
}) {
  return (
    <article className={`home-spotlight${selected ? " home-spotlight--selected" : ""}`}>
      <p className="home-spotlight__kicker">Siguiente atención</p>
      <div className="home-spotlight__body">
        <p className="home-spotlight__time">{appointment.time}</p>
        <div className="home-spotlight__who">
          <h3>{appointment.patient}</h3>
          <p className="home-spotlight__treatment">{appointment.treatment}</p>
          <p className="home-spotlight__meta">
            {appointment.doctor}
            {appointment.branch ? ` · ${appointment.branch}` : ""}
          </p>
        </div>
        <div className="home-spotlight__state">
          <Badge tone={statusTone(appointment.status)}>{appointment.status}</Badge>
        </div>
      </div>
      <div className="home-spotlight__actions">
        <Button
          variant="secondary"
          compact
          icon={Search}
          onClick={() => onLocate(appointment)}
          aria-label={`Buscar a ${appointment.patient} con AIRI`}
        >
          Ubicar paciente
        </Button>
      </div>
    </article>
  );
}

function WorkRow({
  appointment,
  selected,
  onLocate,
}: {
  appointment: Appointment;
  selected: boolean;
  onLocate: (appointment: Appointment) => void;
}) {
  return (
    <li className="home-row-item">
      <button
        className="home-row"
        type="button"
        aria-label={rowLabel(appointment)}
        aria-current={selected ? "true" : undefined}
        onClick={() => onLocate(appointment)}
      >
        <span className="home-row__time">{appointment.time}</span>
        <span className="home-row__who">
          <strong>{appointment.patient}</strong>
          <span>{appointment.treatment}{appointment.doctor ? ` · ${appointment.doctor}` : ""}</span>
        </span>
        <span className="home-row__branch" aria-hidden="true">{appointment.branch}</span>
        <span className="home-row__state" aria-hidden="true">
          <Badge tone={statusTone(appointment.status)}>{appointment.status}</Badge>
        </span>
        <span className="home-row__cue" aria-hidden="true">
          <Search size={16} />
          <span>Ubicar</span>
        </span>
      </button>
    </li>
  );
}

function Worklist({
  appointments,
  loading,
  error,
  selectedId,
  onLocate,
  onRetry,
}: {
  appointments: Appointment[];
  loading: boolean;
  error: string;
  selectedId: string | null;
  onLocate: (appointment: Appointment) => void;
  onRetry: () => void;
}) {
  const { past, upcoming } = useMemo(() => splitWorklist(appointments, nowMinutes()), [appointments]);
  const [showPast, setShowPast] = useState(false);
  const pastExpanded = past.length > 0 && (showPast || upcoming.length === 0);
  const spotlight = upcoming[0] ?? null;
  const rest = upcoming.slice(1);
  const ready = !loading && !error;

  return (
    <section className="home-worklist" aria-labelledby="home-turno-title">
      <header className="home-worklist__header">
        <h2 id="home-turno-title">Atenciones de hoy</h2>
        {ready && appointments.length > 0 && (
          <span className="home-worklist__count">{countCopy(appointments.length)}</span>
        )}
      </header>

      {loading && (
        <div className="home-worklist__state">
          <p role="status">Cargando el turno de hoy</p>
        </div>
      )}

      {!loading && error && (
        <div className="home-worklist__state home-worklist__state--error" role="alert">
          <strong>{error}</strong>
          <p>La agenda no respondió. Tu turno no está vacío: todavía no lo conocemos.</p>
          <div><Button compact variant="secondary" onClick={onRetry}>Reintentar</Button></div>
        </div>
      )}

      {ready && appointments.length === 0 && (
        <div className="home-worklist__state">
          <strong>Tu agenda está despejada</strong>
          <p>Hoy no hay citas registradas para este contexto. Abre la agenda para revisar otros días.</p>
          <div><Link className="home-text-link" href="/agenda">Ver agenda</Link></div>
        </div>
      )}

      {ready && spotlight && (
        <Spotlight appointment={spotlight} selected={spotlight.id === selectedId} onLocate={onLocate} />
      )}

      {ready && !spotlight && appointments.length > 0 && (
        <div className="home-worklist__state">
          <strong>El horario de todas las citas de hoy ya pasó</strong>
          <p>Revisa las atenciones anteriores o abre la agenda para el resto de la semana.</p>
        </div>
      )}

      {ready && rest.length > 0 && (
        <div className="home-worklist__group">
          <p className="home-worklist__group-label">Después</p>
          <ul className="home-timeline">
            {rest.map((appointment) => (
              <WorkRow
                key={appointment.id}
                appointment={appointment}
                selected={appointment.id === selectedId}
                onLocate={onLocate}
              />
            ))}
          </ul>
        </div>
      )}

      {ready && past.length > 0 && (
        <div className="home-worklist__group home-worklist__group--past">
          <button
            className="home-past-toggle"
            type="button"
            aria-expanded={pastExpanded}
            aria-controls="home-past-list"
            onClick={() => setShowPast((value) => !value)}
          >
            {pastExpanded ? "Ocultar anteriores" : `Ver ${past.length} anterior${past.length === 1 ? "" : "es"}`}
          </button>
          {pastExpanded && (
            <ul className="home-timeline home-timeline--past" id="home-past-list">
              {past.map((appointment) => (
                <WorkRow
                  key={appointment.id}
                  appointment={appointment}
                  selected={appointment.id === selectedId}
                  onLocate={onLocate}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------- patient context */

function ContextBand({
  patient,
  onSearch,
  onClear,
}: {
  patient: HomePatient;
  onSearch: () => void;
  onClear: () => void;
}) {
  return (
    <section className="home-context-band" aria-label="Paciente activo">
      <span className="avatar avatar--cyan">{initials(patient.name)}</span>
      <div className="home-context-band__copy">
        <span className="home-context-band__label">Paciente anclado a este turno</span>
        <strong>{patient.name}</strong>
        <span>DNI {patient.dni ?? "no registrado"} · {patient.phone ?? "teléfono no registrado"}</span>
      </div>
      <div className="home-context-band__actions">
        <Link className="button button--secondary button--compact home-link-button" href={`/pacientes?patient=${encodeURIComponent(patient.id)}`}>
          Ver ficha
        </Link>
        <Button compact variant="secondary" onClick={onSearch}>Cambiar</Button>
        <button className="icon-button home-clear-button" type="button" onClick={onClear} aria-label="Quitar paciente activo">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- AIRI stages */

interface SearchView {
  query: string;
  state: "idle" | "loading" | "success" | "error";
  results: HomePatient[];
  error: string;
}

function PatientSearchPanel({
  view,
  seedLabel,
  onQueryChange,
  onSubmit,
  onSelect,
}: {
  view: SearchView;
  seedLabel: string | null;
  onQueryChange: (value: string) => void;
  onSubmit: () => void;
  onSelect: (patient: HomePatient) => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <div className="home-search-stage">
      <h3>Buscar paciente</h3>
      <p>
        {seedLabel
          ? `Contexto tomado de la cita de las ${seedLabel}. Consulta el directorio autorizado.`
          : "Escribe el dato que tengas a mano. Consulta el directorio autorizado."}
      </p>
      <form className="home-search-form" onSubmit={submit}>
        <label className="home-search-field">
          <span>Paciente</span>
          <span className="home-search-input">
            <Search size={18} aria-hidden="true" />
            <input
              value={view.query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Nombre del paciente"
              autoComplete="off"
              autoFocus
            />
          </span>
        </label>
        <Button type="submit" variant="secondary" disabled={view.state === "loading"}>
          {view.state === "loading" ? "Buscando" : "Buscar"}
        </Button>
      </form>
      <div className="home-search-results">
        {view.state === "error" && (
          <div className="home-inline-error" role="alert">
            <p>{view.error}</p>
            <Button compact variant="secondary" onClick={onSubmit}>Reintentar</Button>
          </div>
        )}
        {view.state === "loading" && <p className="home-search-status" role="status">Consultando el directorio</p>}
        {view.state === "success" && view.results.length === 0 && (
          <div className="home-empty-inline">
            <strong>Sin coincidencias para “{view.query.trim()}”.</strong>
            <span>Prueba con otra forma del nombre, el DNI o el teléfono.</span>
          </div>
        )}
        {view.state === "success" && view.results.length > 0 && (
          <div className="home-search-result-list">
            <div className="home-search-result-count">
              {view.results.length} resultado{view.results.length === 1 ? "" : "s"}
            </div>
            {view.results.map((patient) => (
              <button className="home-patient-result" type="button" key={patient.id} onClick={() => onSelect(patient)}>
                <span className="avatar avatar--cyan">{initials(patient.name)}</span>
                <span className="home-patient-result__copy">
                  <strong>{patient.name}</strong>
                  <span>{patient.dni ? `DNI ${patient.dni}` : "DNI no registrado"}</span>
                  <span>{patient.phone ?? "Teléfono no registrado"}</span>
                </span>
                <ArrowUpRight size={18} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AgentOutcomePanel({ stage, onSearch }: { stage: AgentOutcomeStage; onSearch: () => void }) {
  const { outcome, patient, message } = stage.payload;
  const isConfirmed = outcome === "confirmado" && patient !== null;
  const actionRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (isConfirmed) actionRef.current?.focus();
  }, [isConfirmed]);

  const title = isConfirmed
    ? "Paciente identificado"
    : outcome === "sin_resultados"
      ? "Sin resultados"
      : outcome === "error"
        ? "No se pudo completar la consulta"
        : "Capacidad no disponible";

  return (
    <div className={`home-outcome${isConfirmed ? " home-outcome--confirmed" : " home-outcome--quiet"}`}>
      <div className="home-outcome__heading">
        {isConfirmed ? <CheckCircle2 size={20} aria-hidden="true" /> : <CircleAlert size={20} aria-hidden="true" />}
        <h3>{title}</h3>
      </div>
      <p>{message}</p>
      {isConfirmed && patient && (
        <dl className="home-outcome__facts">
          <div><dt>Nombre</dt><dd>{patient.name}</dd></div>
          <div><dt>DNI</dt><dd>{patient.dni ?? "No registrado"}</dd></div>
          <div><dt>Teléfono</dt><dd>{patient.phone ?? "No registrado"}</dd></div>
        </dl>
      )}
      <div className="home-stage-actions">
        {isConfirmed && patient && (
          <Link
            ref={actionRef}
            className="button button--secondary home-link-button"
            href={`/pacientes?patient=${encodeURIComponent(patient.id)}`}
          >
            Abrir ficha
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        )}
        <Button variant="secondary" onClick={onSearch} icon={Search}>
          {isConfirmed ? "Buscar otro paciente" : "Buscar paciente"}
        </Button>
      </div>
    </div>
  );
}

function AgentFallbackPanel({ stage, onSearch }: { stage: AgentFallbackStage; onSearch: () => void }) {
  return (
    <div className="home-fallback" role="status">
      <div className="home-fallback__icon"><CircleAlert size={20} aria-hidden="true" /></div>
      <div>
        <h3>Vista no disponible</h3>
        <p>{stage.payload.message}</p>
      </div>
      <Button variant="secondary" onClick={onSearch} icon={Search}>Buscar paciente</Button>
    </div>
  );
}

/* ---------------------------------------------------------------- AIRI rail */

function AiriRail({
  stage,
  searching,
  activePatient,
  searchView,
  seedLabel,
  composerId,
  onOpenSearch,
  onQueryChange,
  onSubmitSearch,
  onSelectPatient,
}: {
  stage: HomeStage | null;
  searching: boolean;
  activePatient: HomePatient | null;
  searchView: SearchView;
  seedLabel: string | null;
  composerId: string;
  onOpenSearch: () => void;
  onQueryChange: (value: string) => void;
  onSubmitSearch: () => void;
  onSelectPatient: (patient: HomePatient) => void;
}) {
  return (
    <div className="home-airi">
      <div className="home-airi__identity">
        <AiriMark searching={searching} />
        <div className="home-airi__identity-copy">
          <strong>AIRI</strong>
          <span>Asistente de Odonto Smart</span>
        </div>
        <span className="home-airi__mode">Modo manual</span>
      </div>

      {activePatient && (
        <p className="home-airi__context">
          <span>Contexto</span>
          <strong>{activePatient.name}</strong>
        </p>
      )}

      <ul className="home-capability">
        <li className="home-capability__item home-capability__item--on">
          <CheckCircle2 size={15} aria-hidden="true" />
          <span>Ubica pacientes en el directorio autorizado</span>
        </li>
        <li className="home-capability__item home-capability__item--on">
          <CheckCircle2 size={15} aria-hidden="true" />
          <span>Abre la ficha del paciente identificado</span>
        </li>
        <li className="home-capability__item home-capability__item--off">
          <Lock size={15} aria-hidden="true" />
          <span>Ejecutar solicitudes — todavía no disponible</span>
        </li>
      </ul>

      <div className="home-airi__stage" aria-live="polite">
        {stage?.component === "PatientSearch" && (
          <PatientSearchPanel
            view={searchView}
            seedLabel={seedLabel}
            onQueryChange={onQueryChange}
            onSubmit={onSubmitSearch}
            onSelect={onSelectPatient}
          />
        )}
        {stage?.component === "AgentOutcome" && <AgentOutcomePanel stage={stage} onSearch={onOpenSearch} />}
        {stage?.component === "AgentFallback" && <AgentFallbackPanel stage={stage} onSearch={onOpenSearch} />}
        {!stage && (
          <p className="home-airi__idle">
            Ancla un paciente para conservar su contexto durante el turno.
          </p>
        )}
      </div>

      <div className="home-airi__footer">
        <Button
          variant="primary"
          className="home-airi-primary"
          onClick={onOpenSearch}
          disabled={searching}
          icon={Search}
        >
          Buscar paciente
        </Button>
        <div className="home-composer">
          <label htmlFor={composerId}>Entrada de AIRI (no disponible)</label>
          <input id={composerId} disabled aria-describedby={`${composerId}-ayuda`} />
          <p id={`${composerId}-ayuda`}>Disponible cuando AIRI pueda ejecutar solicitudes.</p>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- the page */

export function HomePage() {
  const [stage, setStage] = useState<HomeStage | null>(null);
  const [activePatient, setActivePatient] = useState<HomePatient | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [worklistLoading, setWorklistLoading] = useState(true);
  const [worklistError, setWorklistError] = useState("");
  const [airiOpen, setAiriOpen] = useState(false);
  const [seeded, setSeeded] = useState<{ id: string; time: string } | null>(null);

  // Single source of truth for the real `searchPatients` seam, so the rail and
  // the drawer always show the same request, results and error.
  const [searchQuery, setSearchQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchView["state"]>("idle");
  const [searchResults, setSearchResults] = useState<HomePatient[]>([]);
  const [searchError, setSearchError] = useState("");

  const refreshWorklist = useCallback(async () => {
    setWorklistLoading(true);
    setWorklistError("");
    try {
      const rows = await loadAgenda();
      setAppointments(
        rows
          .filter((appointment) => appointment.day === localDayIndex())
          .sort((left, right) => left.time.localeCompare(right.time)),
      );
    } catch (caught) {
      setAppointments([]);
      setWorklistError(toApiError(caught).message);
    } finally {
      setWorklistLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshWorklist();
  }, [refreshWorklist]);

  const runSearch = useCallback(async (entered: string) => {
    const value = entered.trim();
    if (!value) {
      setSearchResults([]);
      setSearchState("error");
      setSearchError("Escribe un nombre, DNI o teléfono para buscar.");
      return;
    }
    setSearchState("loading");
    setSearchError("");
    try {
      const found = await searchPatients(value);
      setSearchResults(found);
      setSearchState("success");
    } catch (caught) {
      setSearchResults([]);
      setSearchState("error");
      setSearchError(toApiError(caught).message);
    }
  }, []);

  /** Open the search stage. A seed only ever comes from a real appointment row,
   *  and runs the same deterministic `searchPatients` request as the form. */
  const openSearch = useCallback(
    (seed?: { query: string; id: string; time: string }) => {
      setSeeded(seed ? { id: seed.id, time: seed.time } : null);
      setSearchQuery(seed?.query ?? "");
      setSearchResults([]);
      setSearchError("");
      setSearchState("idle");
      setStage(safeHomeStage({ component: "PatientSearch", payload: { query: seed?.query ?? "" } }));
      if (!railIsPersistent()) setAiriOpen(true);
      if (seed) void runSearch(seed.query);
    },
    [runSearch],
  );

  const openPatientSearch = useCallback(() => openSearch(), [openSearch]);

  const locatePatient = useCallback(
    (appointment: Appointment) => {
      openSearch({ query: appointment.patient, id: appointment.id, time: appointment.time });
    },
    [openSearch],
  );

  const selectPatient = useCallback((patient: HomePatient) => {
    setActivePatient(patient);
    setStage(safeHomeStage({
      component: "AgentOutcome",
      payload: {
        outcome: "confirmado",
        patient,
        module: "pacientes",
        message: "El registro quedó fijado como contexto activo para este turno.",
      },
    }));
  }, []);

  const today = useMemo(() => formatToday(), []);
  const split = useMemo(() => splitWorklist(appointments, nowMinutes()), [appointments]);

  const searchView: SearchView = {
    query: searchQuery,
    state: searchState,
    results: searchResults,
    error: searchError,
  };
  const searching = searchState === "loading";
  const seedLabel = stage?.component === "PatientSearch" && seeded ? seeded.time : null;

  const railProps = {
    stage,
    searching,
    activePatient,
    searchView,
    seedLabel,
    onOpenSearch: openPatientSearch,
    onQueryChange: setSearchQuery,
    onSubmitSearch: () => void runSearch(searchQuery),
    onSelectPatient: selectPatient,
  };

  return (
    <div className="page home-page">
      <Masthead
        today={today}
        loading={worklistLoading}
        error={worklistError}
        past={split.past}
        upcoming={split.upcoming}
        onRetry={() => void refreshWorklist()}
      />

      <div className="home-layout">
        <div className="home-main">
          {/* Below the persistent-rail breakpoint this is the contextual entry
              point to the same console: it resumes an open AIRI stage, and
              otherwise starts the one primary Home action. */}
          <button
            className="home-airi-trigger"
            type="button"
            aria-haspopup="dialog"
            aria-label={stage ? "Abrir AIRI" : "Buscar paciente con AIRI"}
            onClick={() => (stage ? setAiriOpen(true) : openPatientSearch())}
          >
            <span className="home-airi-trigger__mark" aria-hidden="true">
              <AiriMark searching={searching} />
            </span>
            <span className="home-airi-trigger__copy">
              <strong>AIRI</strong>
              <span>
                {activePatient ? `Contexto: ${activePatient.name}` : "Ubica pacientes y abre su ficha"}
              </span>
            </span>
            <span className="home-airi-trigger__mode">Modo manual</span>
            <span className="home-airi-trigger__cta" aria-hidden="true">
              <Search size={16} />
              {stage ? "Abrir AIRI" : "Buscar paciente"}
            </span>
          </button>

          {activePatient && (
            <ContextBand
              patient={activePatient}
              onSearch={openPatientSearch}
              onClear={() => setActivePatient(null)}
            />
          )}

          <Worklist
            appointments={appointments}
            loading={worklistLoading}
            error={worklistError}
            selectedId={seeded?.id ?? null}
            onLocate={locatePatient}
            onRetry={() => void refreshWorklist()}
          />

          <nav className="home-links" aria-label="Accesos de recepción">
            <Link className="home-link" href="/agenda">
              Ver agenda
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
            <Link className="home-link" href="/pacientes">
              Ver pacientes
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </nav>
        </div>

        <aside className="home-rail" aria-label="Asistente AIRI">
          <AiriRail {...railProps} composerId="home-composer-inline" />
        </aside>
      </div>

      <Drawer title="AIRI" open={airiOpen} onClose={() => setAiriOpen(false)} layerClassName="home-airi-layer">
        <AiriRail {...railProps} composerId="home-composer-sheet" />
      </Drawer>
    </div>
  );
}
