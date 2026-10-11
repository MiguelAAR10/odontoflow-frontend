"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { History, Plus, Power, RotateCcw, UserRound } from "lucide-react";
import {
  newIdempotencyKey, toApiError,
  type AdminAuditEventRead, type ApiError, type LocationRead, type PractitionerRosterRead, type ServiceRead,
} from "../contracts/client";
import { CLINIC_TIME_ZONE } from "../activity";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { DataTable, type Column } from "../components/DataTable";
import { Drawer } from "../components/Drawer";
import { Modal } from "../components/Modal";
import {
  addAvailabilityRule, addCapability, addPractitioner, loadHistory, loadRoster, renameRosterPractitioner, toggleAdminEntity,
  type AdminEntity,
} from "../practitioners";
import { usePersona } from "../components/PersonaContext";
import { adminGrants, type AdminGrants } from "../session";
import { loadSettingsLocations, loadSettingsServices } from "../settings";
import { SettingsError } from "./SettingsError";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const ACTION_LABELS: Record<string, string> = {
  "practitioner.created": "Alta",
  "practitioner.renamed": "Cambio de nombre",
  "practitioner_membership.deactivated": "Desactivado",
  "practitioner_membership.reactivated": "Reactivado",
  "practitioner_capability.created": "Servicio añadido",
  "practitioner_capability.deactivated": "Servicio desactivado",
  "practitioner_capability.reactivated": "Servicio reactivado",
  "availability_rule.created": "Horario añadido",
  "availability_rule.deactivated": "Horario desactivado",
  "availability_rule.reactivated": "Horario reactivado",
};

const ACTOR_LABELS: Record<string, string> = { human: "Persona", agent: "Agente", integration: "Integración", system: "Sistema" };

const MIN_REASON_LENGTH = 3;
const MAX_REASON_LENGTH = 250;
/** The backend lists at most this many appointment ids in a conflict; the full number comes from the roster. */
const CONFLICT_ID_LIMIT = 50;

const dayFormat = new Intl.DateTimeFormat("es-PE", { timeZone: CLINIC_TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" });
const momentFormat = new Intl.DateTimeFormat("es-PE", {
  timeZone: CLINIC_TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const formatDate = (iso: string) => dayFormat.format(new Date(iso));
const formatMoment = (iso: string) => momentFormat.format(new Date(iso));
const dayName = (day: number) => DAYS[day] ?? `Día ${day}`;
const hhmm = (value: string) => value.slice(0, 5);
const countActive = (rows: { is_active: boolean }[]) => rows.filter((row) => row.is_active).length;

// --- one idempotent mutation at a time ---------------------------------------------

interface MutationFailure { scope: string; error: ApiError }

/**
 * The intent pattern of `SettingsPage`: an unchanged retry reuses its
 * `Idempotency-Key`, changed data starts a new intent, and a success ends it.
 * One mutation runs at a time; a failure is tagged with the `scope` that owns
 * the place where it is shown.
 */
export function useIntentMutation() {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<MutationFailure | null>(null);
  const busyRef = useRef(false);
  const intent = useRef<{ input: string; key: string } | null>(null);

  const run = useCallback(async (scope: string, input: unknown, action: (idempotencyKey: string) => Promise<void>): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const serialized = JSON.stringify(input);
      if (intent.current?.input !== serialized) intent.current = { input: serialized, key: newIdempotencyKey() };
      await action(intent.current.key);
      intent.current = null;
      return true;
    } catch (caught) {
      setFailure({ scope, error: toApiError(caught) });
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);
  const clear = useCallback(() => setFailure(null), []);
  const errorFor = (scope: string): ApiError | null => (failure?.scope === scope ? failure.error : null);

  return { busy, run, clear, errorFor };
}

type Mutation = ReturnType<typeof useIntentMutation>;

// --- future-appointment conflict ----------------------------------------------------

const isFutureAppointmentConflict = (error: ApiError) => error.httpStatus === 409 && error.code === "APPOINTMENT_CONFLICT";

function conflictIds(error: ApiError): number[] {
  const ids = error.details.appointment_ids;
  return Array.isArray(ids) ? ids.filter((id): id is number => typeof id === "number") : [];
}

function conflictSentence(count: number, exact: boolean): string {
  const ending = "Reprográmalas o cancélalas en la Agenda antes de desactivar.";
  if (count === 0) return `Tiene citas futuras confirmadas. ${ending}`;
  if (count === 1 && exact) return "Tiene 1 cita futura confirmada. Reprográmala o cancélala en la Agenda antes de desactivar.";
  return `Tiene ${exact ? "" : "al menos "}${count} citas futuras confirmadas. ${ending}`;
}

/** A 409 the human (or agent) can act on: which appointments to move first, and where. */
function ConflictNotice({ error, knownTotal }: { error: ApiError; knownTotal?: number | undefined }) {
  const ids = conflictIds(error);
  const total = knownTotal ?? 0;
  const count = Math.max(ids.length, total);
  const exact = ids.length < CONFLICT_ID_LIMIT || total >= ids.length;
  return <div className="approvals-notice field--wide" role="alert">
    <h3>No se puede desactivar todavía</h3>
    <p>{conflictSentence(count, exact)}</p>
    {ids.length > 0 && <p>Citas: {ids.map((id) => `#${id}`).join(", ")}{exact ? "" : "…"}</p>}
    <Link className="home-text-link" href="/agenda">Ir a la Agenda</Link>
  </div>;
}

// --- deactivation dialog (shared with Sedes and Servicios) ---------------------------

export interface DeactivateTarget {
  entity: AdminEntity;
  id: number;
  /** Dialog heading and form label, e.g. "Desactivar doctor". */
  title: string;
  /** What is being switched off, named for the person confirming. */
  subject: string;
  /** The roster's full count for a doctor, so a capped id list never understates it. */
  futureAppointments?: number | undefined;
}

interface DeactivateDialogProps {
  target: DeactivateTarget | null;
  busy: boolean;
  error: ApiError | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
}

/** Every deactivation needs a reason (it goes to the audit history); the backend's 409 is explained here. */
export function DeactivateDialog({ target, busy, error, onCancel, onConfirm }: DeactivateDialogProps) {
  const [reason, setReason] = useState("");
  const [tooShort, setTooShort] = useState(false);

  useEffect(() => {
    setReason("");
    setTooShort(false);
  }, [target?.entity, target?.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const trimmed = reason.trim();
    if (trimmed.length < MIN_REASON_LENGTH) {
      setTooShort(true);
      return;
    }
    setTooShort(false);
    await onConfirm(trimmed);
  }

  return <Modal title={target?.title ?? "Desactivar"} open={target !== null} onClose={() => { if (!busy) onCancel(); }} size="small">
    {target && <form className="form-grid" aria-label={target.title} aria-busy={busy} onSubmit={submit}>
      <p className="field--wide" style={{ margin: 0 }}>Vas a desactivar <strong>{target.subject}</strong>. Se puede reactivar más adelante.</p>
      <label className="field field--wide">
        <span>Motivo</span>
        <textarea
          value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={MAX_REASON_LENGTH} required
          disabled={busy} aria-invalid={tooShort} aria-describedby="deactivate-reason-help" placeholder="Ej.: fin de contrato" autoFocus
          style={{ padding: "10px 12px" }}
        />
        <small id="deactivate-reason-help">Obligatorio, mínimo {MIN_REASON_LENGTH} caracteres. Queda registrado en el historial.</small>
      </label>
      {tooShort && <p className="field--wide field-note" style={{ color: "var(--status-danger)" }}>Indica el motivo (mínimo {MIN_REASON_LENGTH} caracteres).</p>}
      {error && (isFutureAppointmentConflict(error)
        ? <ConflictNotice error={error} knownTotal={target.futureAppointments} />
        : <div className="field--wide"><SettingsError error={error} /></div>)}
      <div className="form-actions field--wide">
        <Button onClick={onCancel} disabled={busy}>Cancelar</Button>
        <Button type="submit" variant="danger" icon={Power} disabled={busy}>{busy ? "Desactivando…" : "Desactivar"}</Button>
      </div>
    </form>}
  </Modal>;
}

// --- small pieces ------------------------------------------------------------------

function StateBadge({ active, since }: { active: boolean; since: string | null }) {
  if (active) return <Badge tone="green">Activo</Badge>;
  return <Badge tone="slate">{since ? `Inactivo desde ${formatDate(since)}` : "Inactivo"}</Badge>;
}

function RowsTable({ label, headers, empty, children }: { label: string; headers: string[]; empty: string; children: ReactNode[] }) {
  return <div className="table-scroll">
    <table className="data-table" style={{ minWidth: 0 }} aria-label={label}>
      <thead><tr>{headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr></thead>
      <tbody>{children.length ? children : <tr><td colSpan={headers.length}><div className="empty-state">{empty}</div></td></tr>}</tbody>
    </table>
  </div>;
}

function eventSubject(event: AdminAuditEventRead, doctor: PractitionerRosterRead): string | null {
  if (event.entity_type === "practitioner_capability") {
    const row = doctor.capabilities.find((item) => String(item.id) === event.entity_id);
    return row ? `${row.service_name} · ${row.location_name}` : null;
  }
  if (event.entity_type === "availability_rule") {
    const row = doctor.availability_rules.find((item) => String(item.id) === event.entity_id);
    return row ? `${dayName(row.day_of_week)} ${hhmm(row.start_local)}–${hhmm(row.end_local)} · ${row.location_name}` : null;
  }
  if (event.action === "practitioner.renamed") {
    const before = event.before_state?.display_name;
    const after = event.after_state?.display_name;
    return typeof before === "string" && typeof after === "string" ? `${before} → ${after}` : null;
  }
  return null;
}

function actorLabel(event: AdminAuditEventRead): string {
  const kind = ACTOR_LABELS[event.actor_type] ?? event.actor_type;
  return event.actor_type === "system" ? kind : `${kind} #${event.actor_id}`;
}

// --- one doctor, in the drawer ------------------------------------------------------

interface DoctorDetailProps {
  doctor: PractitionerRosterRead;
  /** What this profile may change, from its `/me` grants. */
  grants: AdminGrants;
  mutation: Mutation;
  refresh: () => Promise<void>;
  onDeactivate: (target: DeactivateTarget) => void;
}

function DoctorDetail({ doctor, grants, mutation, refresh, onDeactivate }: DoctorDetailProps) {
  const [name, setName] = useState(doctor.display_name);
  const [services, setServices] = useState<ServiceRead[]>([]);
  const [sites, setSites] = useState<LocationRead[]>([]);
  const [catalog, setCatalog] = useState<"loading" | "ready" | "failed">("loading");
  const [capabilityForm, setCapabilityForm] = useState({ serviceId: "", locationId: "" });
  const [ruleForm, setRuleForm] = useState({ day: "0", locationId: "", start: "09:00", end: "13:00" });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<AdminAuditEventRead[] | null>(null);
  const [historyError, setHistoryError] = useState<ApiError | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const active = doctor.membership_active;
  const busy = mutation.busy;

  const canAdd = grants.capabilities || grants.schedules;
  useEffect(() => {
    if (!canAdd) return;
    let cancelled = false;
    Promise.all([loadSettingsServices(), loadSettingsLocations()]).then(([serviceRows, siteRows]) => {
      if (cancelled) return;
      setServices(serviceRows.filter((row) => row.is_active));
      setSites(siteRows.filter((row) => row.is_active));
      setCatalog("ready");
    }).catch(() => {
      if (!cancelled) setCatalog("failed");
    });
    return () => { cancelled = true; };
  }, [canAdd]);

  // The history is read on demand and kept fresh: every change reloads the roster, and with it this list.
  useEffect(() => {
    if (!historyOpen) return;
    let cancelled = false;
    setHistoryLoading(true);
    loadHistory(doctor.id).then((rows) => {
      if (cancelled) return;
      setHistory(rows);
      setHistoryError(null);
    }).catch((caught: unknown) => {
      if (!cancelled) setHistoryError(toApiError(caught));
    }).finally(() => {
      if (!cancelled) setHistoryLoading(false);
    });
    return () => { cancelled = true; };
  }, [historyOpen, doctor]);

  async function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = name.trim();
    if (!next || next === doctor.display_name) return;
    await mutation.run("rename", { op: "rename", id: doctor.id, name: next }, async (key) => {
      await renameRosterPractitioner(doctor.id, next, key);
      await refresh();
    });
  }

  function reactivate(entity: AdminEntity, id: number, scope: string) {
    return mutation.run(scope, { op: "reactivate", entity, id }, async (key) => {
      await toggleAdminEntity(entity, id, true, key);
      await refresh();
    });
  }

  async function submitCapability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = { practitioner_id: doctor.id, service_id: Number(capabilityForm.serviceId), location_id: Number(capabilityForm.locationId), is_active: true };
    if (!input.service_id || !input.location_id) return;
    const ok = await mutation.run("add-capability", { op: "add-capability", ...input }, async (key) => {
      await addCapability(input, key);
      await refresh();
    });
    if (ok) setCapabilityForm({ serviceId: "", locationId: "" });
  }

  async function submitRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = {
      practitioner_id: doctor.id, location_id: Number(ruleForm.locationId), day_of_week: Number(ruleForm.day),
      start_local: `${ruleForm.start}:00`, end_local: `${ruleForm.end}:00`,
    };
    if (!input.location_id || !ruleForm.start || !ruleForm.end) return;
    const ok = await mutation.run("add-rule", { op: "add-rule", ...input }, async (key) => {
      await addAvailabilityRule(input, key);
      await refresh();
    });
    if (ok) setRuleForm((current) => ({ ...current, locationId: "" }));
  }

  const renameError = mutation.errorFor("rename");
  const stateError = mutation.errorFor("state");
  const capabilitiesError = mutation.errorFor("capabilities");
  const rulesError = mutation.errorFor("rules");
  const addCapabilityError = mutation.errorFor("add-capability");
  const addRuleError = mutation.errorFor("add-rule");

  // 422 with the id of the row that already exists: offer to bring it back instead of failing.
  const existingId = addCapabilityError?.httpStatus === 422 ? Number(addCapabilityError.details.capability_id) : NaN;
  const existing = Number.isInteger(existingId) ? doctor.capabilities.find((row) => row.id === existingId) : undefined;
  const existingIsPaused = addCapabilityError?.details.is_active === false || existing?.is_active === false;

  const addDisabled = busy || !active || catalog !== "ready";
  const sectionStyle = { display: "grid", gap: "var(--space-4)", marginBottom: "var(--space-6)" } as const;

  return <div>
    <section style={sectionStyle} aria-labelledby="doctor-data">
      <h3 id="doctor-data" style={{ margin: 0 }}>Datos</h3>
      {!grants.doctors ? <p style={{ margin: 0 }}><strong>{doctor.display_name}</strong></p> : <form className="form-grid" aria-label="Datos del doctor" aria-busy={busy} onSubmit={submitRename}>
        {renameError && <div className="field--wide"><SettingsError error={renameError} /></div>}
        <label className="field field--wide">
          <span>Nombre</span>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={250} required disabled={busy} />
        </label>
        <div className="form-actions field--wide">
          <Button type="submit" variant="primary" disabled={busy || !name.trim() || name.trim() === doctor.display_name}>Guardar nombre</Button>
        </div>
      </form>}
    </section>

    <section style={sectionStyle} aria-labelledby="doctor-state">
      <h3 id="doctor-state" style={{ margin: 0 }}>Estado</h3>
      <div className="badge-stack">
        <StateBadge active={active} since={doctor.deactivated_at} />
        {!doctor.platform_active && <Badge tone="amber">Suspendido por la plataforma</Badge>}
      </div>
      {!doctor.platform_active && <p className="field-note">La plataforma suspendió a este profesional: la clínica no puede cambiarlo y no recibe citas aunque esté activo aquí.</p>}
      {stateError && <SettingsError error={stateError} />}
      <p className="field-note">
        {active
          ? "Si lo desactivas deja de recibir citas nuevas. Sus servicios y horarios se conservan: al reactivarlo vuelve tal como estaba."
          : "No recibe citas nuevas. Al reactivarlo vuelve con los servicios y horarios que tenía."}
      </p>
      {active && doctor.future_confirmed_appointments > 0 && <p className="field-note">
        Hoy tiene {doctor.future_confirmed_appointments} {doctor.future_confirmed_appointments === 1 ? "cita futura confirmada" : "citas futuras confirmadas"}: para desactivarlo, reprográmalas o cancélalas antes en la Agenda.
      </p>}
      {grants.doctors && <div className="form-actions">
        {active
          ? <Button variant="danger" icon={Power} disabled={busy} onClick={() => onDeactivate({
            entity: "practitioners", id: doctor.id, title: "Desactivar doctor", subject: doctor.display_name, futureAppointments: doctor.future_confirmed_appointments,
          })}>Desactivar</Button>
          : <Button variant="primary" icon={RotateCcw} disabled={busy} onClick={() => void reactivate("practitioners", doctor.id, "state")}>Reactivar</Button>}
      </div>}
    </section>

    <section style={sectionStyle} aria-labelledby="doctor-services">
      <h3 id="doctor-services" style={{ margin: 0 }}>Servicios que atiende</h3>
      {capabilitiesError && <SettingsError error={capabilitiesError} />}
      <RowsTable label="Servicios que atiende" headers={grants.capabilities ? ["Servicio", "Sede", "Estado", "Acciones"] : ["Servicio", "Sede", "Estado"]} empty={grants.capabilities ? "Aún no atiende ningún servicio. Añade el primero." : "Aún no atiende ningún servicio."}>
        {doctor.capabilities.map((row) => <tr key={row.id}>
          <td><strong>{row.service_name}</strong></td>
          <td>{row.location_name}</td>
          <td><StateBadge active={row.is_active} since={row.deactivated_at} /></td>
          {grants.capabilities && <td>
            {row.is_active
              ? <Button compact icon={Power} disabled={busy} aria-label={`Desactivar ${row.service_name} en ${row.location_name}`} onClick={() => onDeactivate({
                entity: "capabilities", id: row.id, title: "Desactivar servicio del doctor", subject: `${row.service_name} · ${row.location_name} (${doctor.display_name})`,
              })}>Desactivar</Button>
              : <Button compact icon={RotateCcw} disabled={busy} aria-label={`Reactivar ${row.service_name} en ${row.location_name}`} onClick={() => void reactivate("capabilities", row.id, "capabilities")}>Reactivar</Button>}
          </td>}
        </tr>)}
      </RowsTable>
      {grants.capabilities && <form className="form-grid" aria-label="Añadir servicio" aria-busy={busy} onSubmit={submitCapability}>
        <h4 className="field--wide" style={{ margin: 0 }}>Añadir servicio</h4>
        {addCapabilityError && (existing && Number.isInteger(existingId)
          ? <div className="approvals-notice field--wide" role="alert">
            <h3>Ya lo atiende en esa sede</h3>
            <p>{existingIsPaused ? "Ese servicio está desactivado para este doctor. Puedes reactivarlo en vez de crearlo otra vez." : "Ese servicio ya está activo para este doctor."}</p>
            {existingIsPaused && <Button compact icon={RotateCcw} disabled={busy} onClick={() => void reactivate("capabilities", existingId, "capabilities")}>Reactivar</Button>}
          </div>
          : <div className="field--wide"><SettingsError error={addCapabilityError} /></div>)}
        <label className="field">
          <span>Servicio</span>
          <select value={capabilityForm.serviceId} onChange={(event) => setCapabilityForm((current) => ({ ...current, serviceId: event.target.value }))} required disabled={addDisabled}>
            <option value="">Elige un servicio</option>
            {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Sede</span>
          <select value={capabilityForm.locationId} onChange={(event) => setCapabilityForm((current) => ({ ...current, locationId: event.target.value }))} required disabled={addDisabled}>
            <option value="">Elige una sede</option>
            {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
        </label>
        {catalog === "failed" && <p className="field-note field--wide" role="status">No se pudo cargar el catálogo de servicios y sedes. Cierra y vuelve a abrir esta ficha para reintentar.</p>}
        {!active && <p className="field-note field--wide">Reactiva al doctor para añadirle servicios.</p>}
        <div className="form-actions field--wide"><Button type="submit" variant="primary" icon={Plus} disabled={addDisabled}>Añadir servicio</Button></div>
      </form>}
    </section>

    <section style={sectionStyle} aria-labelledby="doctor-hours">
      <h3 id="doctor-hours" style={{ margin: 0 }}>Horarios</h3>
      {grants.schedules && <p className="field-note">Para cambiar un horario, desactiva el actual y añade el nuevo; el historial guarda ambos.</p>}
      {rulesError && <SettingsError error={rulesError} />}
      <RowsTable label="Horarios" headers={grants.schedules ? ["Día", "Horario", "Sede", "Estado", "Acciones"] : ["Día", "Horario", "Sede", "Estado"]} empty={grants.schedules ? "Aún no tiene horarios. Añade el primero." : "Aún no tiene horarios."}>
        {doctor.availability_rules.map((row) => <tr key={row.id}>
          <td><strong>{dayName(row.day_of_week)}</strong></td>
          <td>{hhmm(row.start_local)}–{hhmm(row.end_local)}</td>
          <td>{row.location_name}</td>
          <td><StateBadge active={row.is_active} since={row.deactivated_at} /></td>
          {grants.schedules && <td>
            {row.is_active
              ? <Button compact icon={Power} disabled={busy} aria-label={`Desactivar horario del ${dayName(row.day_of_week)} en ${row.location_name}`} onClick={() => onDeactivate({
                entity: "availability-rules", id: row.id, title: "Desactivar horario",
                subject: `${dayName(row.day_of_week)} ${hhmm(row.start_local)}–${hhmm(row.end_local)} · ${row.location_name} (${doctor.display_name})`,
              })}>Desactivar</Button>
              : <Button compact icon={RotateCcw} disabled={busy} aria-label={`Reactivar horario del ${dayName(row.day_of_week)} en ${row.location_name}`} onClick={() => void reactivate("availability-rules", row.id, "rules")}>Reactivar</Button>}
          </td>}
        </tr>)}
      </RowsTable>
      {grants.schedules && <form className="form-grid" aria-label="Añadir horario" aria-busy={busy} onSubmit={submitRule}>
        <h4 className="field--wide" style={{ margin: 0 }}>Añadir horario</h4>
        {addRuleError && <div className="field--wide"><SettingsError error={addRuleError} /></div>}
        <label className="field">
          <span>Día</span>
          <select value={ruleForm.day} onChange={(event) => setRuleForm((current) => ({ ...current, day: event.target.value }))} disabled={addDisabled}>
            {DAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Sede</span>
          <select value={ruleForm.locationId} onChange={(event) => setRuleForm((current) => ({ ...current, locationId: event.target.value }))} required disabled={addDisabled}>
            <option value="">Elige una sede</option>
            {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Desde</span>
          <input type="time" value={ruleForm.start} onChange={(event) => setRuleForm((current) => ({ ...current, start: event.target.value }))} required disabled={addDisabled} />
        </label>
        <label className="field">
          <span>Hasta</span>
          <input type="time" value={ruleForm.end} onChange={(event) => setRuleForm((current) => ({ ...current, end: event.target.value }))} required disabled={addDisabled} />
        </label>
        {!active && <p className="field-note field--wide">Reactiva al doctor para añadirle horarios.</p>}
        <div className="form-actions field--wide"><Button type="submit" variant="primary" icon={Plus} disabled={addDisabled}>Añadir horario</Button></div>
      </form>}
    </section>

    {grants.history && <section style={sectionStyle} aria-labelledby="doctor-history">
      <h3 id="doctor-history" style={{ margin: 0 }}>Historial</h3>
      <div className="form-actions" style={{ justifyContent: "flex-start" }}>
        <Button icon={History} aria-expanded={historyOpen} onClick={() => setHistoryOpen((open) => !open)}>{historyOpen ? "Ocultar historial" : "Ver historial"}</Button>
      </div>
      {historyOpen && (historyError
        ? <SettingsError error={historyError} />
        : historyLoading && !history
          ? <p role="status" className="empty-state">Cargando historial…</p>
          : !history?.length
            ? <p className="empty-state">Sin cambios registrados.</p>
            : <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-3)" }} aria-label="Historial del doctor">
              {history.map((event) => {
                const subject = eventSubject(event, doctor);
                const why = typeof event.after_state?.reason === "string" ? event.after_state.reason : null;
                return <li key={event.id} style={{ display: "grid", gap: 2, paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--line)" }}>
                  <span><strong>{ACTION_LABELS[event.action] ?? event.action}</strong>{subject ? ` · ${subject}` : ""}</span>
                  <small>{formatMoment(event.occurred_at)} · {actorLabel(event)}</small>
                  {why && <small>Motivo: {why}</small>}
                </li>;
              })}
            </ol>)}
    </section>}
  </div>;
}

// --- the section ---------------------------------------------------------------------

export function PractitionersPanel() {
  const [roster, setRoster] = useState<PractitionerRosterRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [showInactive, setShowInactive] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<DeactivateTarget | null>(null);
  const [newName, setNewName] = useState("");
  const mutation = useIntentMutation();
  const { identity } = usePersona();
  const grants = adminGrants(identity);
  const readOnly = !grants.doctors && !grants.capabilities && !grants.schedules;
  const mounted = useRef(true);
  const latestRead = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  /** Reads the roster again; a slower, older read never overwrites a newer one. */
  const refresh = useCallback(async () => {
    const read = ++latestRead.current;
    try {
      const rows = await loadRoster();
      if (!mounted.current || read !== latestRead.current) return;
      setRoster(rows);
      setLoadError(null);
    } catch (caught) {
      if (!mounted.current || read !== latestRead.current) return;
      setLoadError(toApiError(caught));
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const visible = showInactive ? roster : roster.filter((row) => row.membership_active);
  const selected = roster.find((row) => row.id === selectedId) ?? null;
  const createError = mutation.errorFor("create");

  async function submitNewDoctor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const display_name = newName.trim();
    if (!display_name) return;
    const ok = await mutation.run("create", { op: "create-doctor", display_name }, async (key) => {
      await addPractitioner({ display_name, is_active: true }, key);
      await refresh();
    });
    if (ok) setNewName("");
  }

  async function confirmDeactivation(reason: string) {
    if (!dialog) return;
    const { entity, id } = dialog;
    const ok = await mutation.run("deactivate", { op: "deactivate", entity, id, reason }, async (key) => {
      await toggleAdminEntity(entity, id, false, key, reason);
      await refresh();
    });
    if (ok) setDialog(null);
  }

  function openDialog(target: DeactivateTarget) {
    mutation.clear();
    setDialog(target);
  }

  function cancelDialog() {
    mutation.clear();
    setDialog(null);
  }

  const columns: Column<PractitionerRosterRead>[] = [
    { key: "name", header: "Nombre", render: (row) => <strong>{row.display_name}</strong> },
    {
      key: "state", header: "Estado", render: (row) => <span className="badge-stack">
        <StateBadge active={row.membership_active} since={row.deactivated_at} />
        {!row.platform_active && <Badge tone="amber">Suspendido por la plataforma</Badge>}
      </span>,
    },
    { key: "services", header: "Servicios activos", render: (row) => `${countActive(row.capabilities)}/${row.capabilities.length}` },
    { key: "hours", header: "Horarios activos", render: (row) => countActive(row.availability_rules) },
    { key: "appointments", header: "Citas futuras", render: (row) => row.future_confirmed_appointments },
    {
      key: "actions", header: "Acciones", render: (row) => <Button compact icon={UserRound} aria-label={`Gestionar ${row.display_name}`} onClick={() => setSelectedId(row.id)}>Gestionar</Button>,
    },
  ];

  return <>
    <section className="panel table-panel table-panel--flush" aria-labelledby="settings-practitioners">
      <div className="panel-header">
        <h2 id="settings-practitioners"><UserRound size={20} aria-hidden="true" /> Doctores</h2>
        <label className="field-note" style={{ marginLeft: "auto", alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} /> Mostrar inactivos
        </label>
      </div>
      {loadError ? <SettingsError error={loadError} /> : loading ? <p role="status" className="empty-state">Cargando doctores…</p> : <>
        <DataTable
          columns={columns} rows={visible} rowKey={(row) => String(row.id)}
          emptyMessage={roster.length ? "No hay doctores activos. Activa «Mostrar inactivos» para ver al resto." : "No hay doctores registrados. Añade el primero."}
        />
        {readOnly && <p className="field-note" role="note" style={{ padding: "var(--space-5)", margin: 0 }}>Tu perfil puede consultar los doctores, pero no administrarlos.</p>}
        {grants.doctors && <form className="form-grid" aria-label="Nuevo doctor" aria-busy={mutation.busy} onSubmit={submitNewDoctor} style={{ padding: "var(--space-5)" }}>
          <h3 className="field--wide" style={{ margin: 0 }}>Nuevo doctor</h3>
          {createError && <div className="field--wide"><SettingsError error={createError} /></div>}
          <label className="field">
            <span>Nombre del doctor</span>
            <input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={250} required disabled={mutation.busy} placeholder="Dra. Nombre Apellido" />
          </label>
          <div className="form-actions field--wide">
            <Button type="submit" variant="primary" icon={Plus} disabled={mutation.busy || !newName.trim()}>{mutation.busy ? "Guardando…" : "Crear doctor"}</Button>
          </div>
        </form>}
      </>}
    </section>
    {/* Escape closes the topmost overlay only: the dialog first, then the drawer. */}
    <Drawer title={selected?.display_name ?? "Doctor"} open={selected !== null} width="wide" onClose={() => { if (!dialog) setSelectedId(null); }}>
      {selected && <DoctorDetail key={selected.id} doctor={selected} grants={grants} mutation={mutation} refresh={refresh} onDeactivate={openDialog} />}
    </Drawer>
    <DeactivateDialog target={dialog} busy={mutation.busy} error={mutation.errorFor("deactivate")} onCancel={cancelDialog} onConfirm={confirmDeactivation} />
  </>;
}
