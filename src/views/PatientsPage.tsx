"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, ChevronDown, Eye, Plus, Search, Users } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { createPatient, DEMO_NOW, DEMO_TIME_ZONE, loadPatients, newIdempotencyKey, toApiError, useMocks, useOdontoRepository, type OdontoSnapshot } from "../api";
import { Button } from "../components/Button";
import { type Column, DataTable } from "../components/DataTable";
import { KpiCard } from "../components/KpiCard";
import { Modal } from "../components/Modal";
import type { Patient } from "../types";
import { LeadsWorkspace } from "./LeadsWorkspace";
import { canReadClinicalRecord, hasCapability } from "../roles";
import styles from "./PatientsPage.module.css";

function demoPatientRows(snapshot: OdontoSnapshot): Patient[] {
  const visiblePatients = snapshot.patients.filter((patient) => snapshot.actor.role === "owner" || snapshot.actor.role === "admin" ? patient.locationId === snapshot.actor.locationId || snapshot.actor.role === "owner" : patient.practitionerId === snapshot.actor.practitionerId);
  return visiblePatients.map((patient) => {
    const next = snapshot.appointments.filter((appointment) => appointment.patientId === patient.id && appointment.state === "confirmed" && appointment.startAt >= DEMO_NOW && !snapshot.visits.some((visit) => visit.appointmentId === appointment.id)).sort((left, right) => left.startAt.localeCompare(right.startAt))[0];
    return {
      id: patient.id,
      initials: patient.name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
      name: patient.name,
      dni: "",
      phone: patient.phone,
      branch: snapshot.locations.find((location) => location.id === patient.locationId)?.name ?? "Sede no informada",
      nextAppointment: next ? new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: DEMO_TIME_ZONE }).format(new Date(next.startAt)) : "Sin cita",
      treatment: patient.treatment,
      status: "No disponible",
      tone: "cyan",
      origin: patient.leadId ? "Lead vinculado" : "Sin lead vinculado",
      interest: useMocks ? "En seguimiento" : "No disponible",
    };
  });
}

export function PatientsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const patientQuery = searchParams.get("patient");
  const activeTab = searchParams.get("tab") === "leads" ? "leads" : "patients";
  const { snapshot, dispatch } = useOdontoRepository();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("Todas las sedes");
  const [selected, setSelected] = useState<Patient | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const demoRows = useMemo(() => demoPatientRows(snapshot), [snapshot]);

  useEffect(() => {
    if (activeTab !== "patients") return;
    setLoading(true);
    setError("");
    void (useMocks ? Promise.resolve(demoRows) : loadPatients()).then((data) => {
      setPatients(data);
      if (patientQuery) setSelected(data.find((item) => item.id === patientQuery) ?? null);
    }).catch((caught) => setError(toApiError(caught).message)).finally(() => setLoading(false));
  }, [activeTab, demoRows, patientQuery]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return patients.filter((patient) =>
      (!normalized || [patient.name, patient.dni, patient.phone].some((value) => value.toLowerCase().includes(normalized))) &&
      (branch === "Todas las sedes" || patient.branch === branch)
    );
  }, [patients, query, branch]);

  const paged = useMemo(() => visible.slice((page - 1) * pageSize, page * pageSize), [page, pageSize, visible]);
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));

  useEffect(() => { setPage(1); }, [query, branch, pageSize]);

  const submitPatient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    try {
      const branchName = String(form.get("branch"));
      if (useMocks) {
        const locationId = snapshot.locations.find((location) => location.name === branchName)?.id ?? snapshot.actor.locationId ?? snapshot.locations[0]?.id ?? "lince";
        await dispatch({ type: "createPatient", name: String(form.get("name")), phone: String(form.get("phone")), locationId });
      } else {
        const saved = await createPatient({
          name: String(form.get("name")), dni: String(form.get("dni")), phone: String(form.get("phone")),
          branch: branchName, status: "Activo", nextAppointment: "Sin cita", treatment: "Por definir", origin: "Registro manual", interest: "Por validar",
          idempotencyKey: newIdempotencyKey(),
        });
        setPatients((current) => [saved, ...current]);
      }
      setNewOpen(false);
    } catch (caught) {
      setError(toApiError(caught).message);
    }
  };

  const submitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name")).trim();
    const phone = String(form.get("phone")).trim();
    try {
      await dispatch({ type: "updatePatient", patientId: selected.id, name, phone });
      setSelected((current) => current ? { ...current, name, phone } : current);
      setEditOpen(false);
    } catch (caught) {
      setError(toApiError(caught).message);
    }
  };

  const upcomingCount = useMocks
    ? patients.filter((patient) => patient.nextAppointment !== "Sin cita" && patient.nextAppointment !== "Por reprogramar").length
    : "—";

  const showDni = patients.some((patient) => Boolean(patient.dni));
  const patientHistory = selected && useMocks ? [
    ...snapshot.appointments.filter((item) => item.patientId === selected.id).map((item) => ({ id: `appointment-${item.id}`, date: item.startAt, label: `Cita · ${item.serviceName}`, detail: item.state === "confirmed" ? "Confirmada" : "Cancelada" })),
    ...snapshot.visits.filter((item) => item.patientId === selected.id).map((item) => ({ id: `visit-${item.id}`, date: item.startedAt, label: "Visita clínica", detail: snapshot.practitioners.find((person) => person.id === item.practitionerId)?.name ?? "Profesional no asignado" })),
    ...snapshot.clinicalRecords.filter((item) => item.patientId === selected.id && snapshot.visits.some((visit) => visit.id === item.visitId && canReadClinicalRecord(snapshot.actor.role, snapshot.actor.practitionerId, visit.practitionerId))).map((item) => ({ id: `record-${item.id}`, date: item.updatedAt, label: "Registro clínico", detail: item.note || "Sin nota" })),
    ...snapshot.requests.filter((item) => item.patientId === selected.id).map((item) => ({ id: `request-${item.id}`, date: item.createdAt, label: item.title, detail: item.status === "done" ? "Completada" : item.status === "in_progress" ? "En curso" : "Abierta" })),
    ...snapshot.labOrders.filter((item) => item.patientId === selected.id).map((item) => ({ id: `lab-${item.id}`, date: item.dueAt, label: "Orden de laboratorio", detail: item.status === "ready" ? "Lista" : item.status === "received" ? "Recibida" : "Solicitada" })),
    ...snapshot.charges.filter((item) => item.patientId === selected.id).map((item) => ({ id: `charge-${item.id}`, date: item.createdAt, label: "Cargo registrado", detail: new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(item.amount) })),
  ].sort((left, right) => right.date.localeCompare(left.date)).slice(0, 6) : [];

  const columns: Column<Patient>[] = [
    { key: "name", header: "Paciente", width: "24%", render: (patient) => <span className="person-cell"><span className={`avatar avatar--${patient.tone}`}>{patient.initials}</span><span><strong>{patient.name}</strong>{useMocks && <small>{patient.treatment}</small>}</span></span> },
    ...(showDni ? [{ key: "dni", header: "DNI", render: (patient: Patient) => patient.dni || "No informado" }] : []),
    { key: "phone", header: "Teléfono", render: (patient) => patient.phone },
    ...(useMocks ? [
      { key: "branch", header: "Sede", render: (patient: Patient) => patient.branch },
      { key: "next", header: "Próxima cita", width: "19%", render: (patient: Patient) => patient.nextAppointment },
    ] : []),
    { key: "actions", header: "", render: (patient) => <Button compact icon={Eye} onClick={() => setSelected(patient)}>Ver ficha</Button> },
  ];

  return (
    <section className={`page ${styles.patientsPage}`}>
      <div className="page-heading page-heading--with-actions"><div><span className="page-kicker">Directorio clínico</span><h1>Pacientes</h1></div>{activeTab === "patients" && hasCapability(snapshot.actor.role, "patients.create") && <Button variant="primary" icon={Plus} onClick={() => setNewOpen(true)}>Nuevo paciente</Button>}</div>
      <nav className="segmented-control" aria-label="Directorio de pacientes">
        <button type="button" className={activeTab === "patients" ? "is-active" : ""} aria-pressed={activeTab === "patients"} onClick={() => router.push("/pacientes")}>Pacientes</button>
        <button type="button" className={activeTab === "leads" ? "is-active" : ""} aria-pressed={activeTab === "leads"} onClick={() => router.push("/pacientes?tab=leads")}>Leads</button>
      </nav>
      {activeTab === "leads" ? <LeadsWorkspace /> : <>
      {useMocks && <div className="kpi-grid kpi-grid--patients">
        <KpiCard icon={Users} value={patients.length} label="Pacientes" tone="blue" />
        <KpiCard icon={Users} value={upcomingCount} label="Con próxima cita · demo" tone="cyan" />
        <KpiCard icon={CalendarDays} value={patients.length - Number(upcomingCount)} label="Sin próxima cita · demo" tone="amber" />
      </div>}
      <section className="panel table-panel patient-directory-table">
        <div className="table-toolbar">
          <label className="search-control"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, DNI o teléfono" aria-label="Buscar pacientes" /></label>
          {useMocks && <label className="select-control"><select value={branch} onChange={(event) => setBranch(event.target.value)} aria-label="Filtrar por sede"><option>Todas las sedes</option><option>Lince</option><option>Jesús María</option><option>Magdalena</option></select><ChevronDown size={16} /></label>}
          <span className="result-count">{visible.length} pacientes</span>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        {loading && <div className="table-loading" role="status">Cargando pacientes…</div>}
        {!loading && <DataTable className={styles.patientTable} columns={columns} rows={paged} rowKey={(patient) => patient.id} helpLabel={(patient) => patient.name} helpHref={(patient) => `/pacientes?patient=${encodeURIComponent(patient.id)}`} />}
        <div className="pagination"><span>Mostrando {paged.length} de {visible.length}</span><div><button aria-label="Página anterior" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>‹</button>{Array.from({ length: pageCount }, (_, index) => index + 1).slice(0, 5).map((value) => <button key={value} className={page === value ? "page-active" : ""} onClick={() => setPage(value)}>{value}</button>)}<button aria-label="Página siguiente" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>›</button></div><select aria-label="Filas por página" value={String(pageSize)} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value="5">5 por página</option><option value="10">10 por página</option><option value="25">25 por página</option></select></div>
      </section>

      <Modal title="Ficha del paciente" open={Boolean(selected)} onClose={() => setSelected(null)}>
        {selected && <div className={`patient-profile ${styles.patientProfile}`}>
          <div className="patient-profile__hero"><span className={`avatar avatar--${selected.tone}`}>{selected.initials}</span><div><h3>{selected.name}</h3></div></div>
          <div className={`detail-list ${styles.patientFacts}`}>
            {selected.dni && <div><span>DNI</span><strong>{selected.dni}</strong></div>}
            <div><span>Teléfono</span><strong>{selected.phone || "No informado"}</strong></div>
            {useMocks && <><div><span>Sede</span><strong>{selected.branch}</strong></div><div><span>Tratamiento registrado</span><strong>{selected.treatment}</strong></div><div><span>Próxima cita</span><strong>{selected.nextAppointment}</strong></div><div><span>Lead relacionado</span><strong>{selected.origin}</strong></div></>}
          </div>
          {!useMocks && <p className={styles.apiLimit}>La respuesta de pacientes solo incluye nombre, DNI y teléfono. Sede, citas y datos clínicos no están disponibles en esta consulta.</p>}
          {useMocks && <section className={styles.patientHistory}><h4>Registros vinculados · demo</h4>{patientHistory.length ? <ul>{patientHistory.map((item) => <li key={item.id}><span><strong>{item.label}</strong><small>{item.detail}</small></span><time>{new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: DEMO_TIME_ZONE }).format(new Date(item.date))}</time></li>)}</ul> : <p>Sin citas, visitas, registros clínicos, solicitudes ni cargos vinculados.</p>}</section>}
          <div className="form-actions"><Button onClick={() => setSelected(null)}>Cerrar</Button>{useMocks && hasCapability(snapshot.actor.role, "patients.create") && <Button variant="primary" onClick={() => setEditOpen(true)}>Editar ficha · demo</Button>}</div>
        </div>}
      </Modal>

      <Modal title="Editar ficha · demo temporal" open={editOpen} onClose={() => setEditOpen(false)}>
        {selected && <form className={`form-grid ${styles.editForm}`} onSubmit={submitEdit}>
          <p className={`field--wide ${styles.demoNotice}`}>Los cambios se guardan solo en este escenario de demostración y no se envían a la API.</p>
          <label className="field field--wide"><span>Nombre completo</span><input name="name" defaultValue={selected.name} required autoFocus /></label>
          <label className="field"><span>Teléfono</span><input name="phone" type="tel" defaultValue={selected.phone} required /></label>
          <div className="form-actions field--wide"><Button type="button" onClick={() => setEditOpen(false)}>Cancelar</Button><Button type="submit" variant="primary">Guardar cambios</Button></div>
        </form>}
      </Modal>

      <Modal title="Registrar paciente" open={newOpen} onClose={() => setNewOpen(false)}>
        <form className="form-grid" onSubmit={submitPatient}>
          <label className="field field--wide"><span>Nombre completo</span><input name="name" required autoFocus /></label>
          <label className="field"><span>DNI</span><input name="dni" inputMode="numeric" minLength={8} required /></label>
          <label className="field"><span>Teléfono</span><input name="phone" type="tel" required /></label>
          {useMocks && <label className="field field--wide"><span>Sede preferida</span><select name="branch">{snapshot.locations.map((location) => <option key={location.id}>{location.name}</option>)}</select></label>}
          <div className="form-actions field--wide"><Button type="button" onClick={() => setNewOpen(false)}>Cancelar</Button><Button type="submit" variant="primary">Registrar paciente</Button></div>
        </form>
      </Modal>
      </>}
    </section>
  );
}
