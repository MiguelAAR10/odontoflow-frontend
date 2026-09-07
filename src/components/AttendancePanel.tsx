"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, ClipboardPenLine, Search, UserRound, WalletCards } from "lucide-react";
import {
  createChargeRecord,
  createPatientRecord,
  createServiceExecutionRecord,
  createVisitRecord,
  loadPatients,
  loadServiceOptions,
  loadVisit,
  loadVisits,
  newIdempotencyKey,
  toApiError,
  useMocks,
} from "../api";
import { Badge, statusTone } from "./Badge";
import { Button } from "./Button";
import { Drawer } from "./Drawer";
import type { AppointmentListItem } from "../contracts/client";
import type { Appointment, Patient, ServiceExecution, ServiceOption, Visit } from "../types";

interface AttendancePanelProps {
  appointment: Appointment | null;
  detail?: AppointmentListItem | null;
  onClose: () => void;
}

type Step = 1 | 2 | 3;
const stepItems: Array<[Step, string]> = [[1, "Paciente"], [2, "Servicio ejecutado"], [3, "Cargo"]];

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function money(value: number): string {
  return `S/ ${value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function AttendancePanel({ appointment, detail, onClose }: AttendancePanelProps) {
  const [step, setStep] = useState<Step>(1);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientLoading, setPatientLoading] = useState(false);
  const [newPatientOpen, setNewPatientOpen] = useState(false);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [serviceId, setServiceId] = useState<number | "">(appointment?.serviceId ?? "");
  const [price, setPrice] = useState("");
  const [visit, setVisit] = useState<Visit | null>(null);
  const [executions, setExecutions] = useState<ServiceExecution[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const canonicalPatientId = appointment?.patientId ?? detail?.patient_id ?? undefined;
  const canonicalPatientName = appointment?.patientName ?? detail?.patient_name ?? (appointment?.patientId ? appointment.patient : undefined);
  const selectedService = useMemo(() => services.find((service) => service.id === serviceId), [serviceId, services]);

  useEffect(() => {
    if (!appointment) return;
    setStep(1);
    setError("");
    setSaved(false);
    setPatient(null);
    setPatientQuery("");
    setNewPatientOpen(false);
    setServiceId(appointment.serviceId ?? "");
    setPrice("");
    setVisit(null);
    setExecutions([]);
    setPatientLoading(false);
    void loadServiceOptions().then(setServices).catch((caught) => setError(toApiError(caught).message));
  }, [appointment]);

  useEffect(() => {
    if (!appointment || canonicalPatientId == null) return;
    setPatient({
      id: String(canonicalPatientId),
      initials: initials(canonicalPatientName ?? appointment.patient),
      name: canonicalPatientName ?? appointment.patient,
      dni: "",
      phone: "",
      branch: appointment.branch,
      nextAppointment: "",
      treatment: appointment.treatment,
      status: "Activo",
      tone: "cyan",
      origin: "Proyección canónica",
      interest: "",
    });
  }, [appointment, canonicalPatientId, canonicalPatientName]);

  useEffect(() => {
    if (!appointment || !patient) return;
    setLoading(true);
    setError("");
    void loadVisits(useMocks ? undefined : { patient_id: Number(patient.id) }).then(async (rows) => {
      const existing = rows.find((row) => row.appointmentId != null && String(row.appointmentId) === String(appointment.id));
      if (existing) {
        const detailed = existing.executions.length ? existing : await loadVisit(existing.id);
        setVisit(detailed);
        setExecutions(detailed.executions);
      }
    }).catch((caught) => setError(toApiError(caught).message)).finally(() => setLoading(false));
  }, [appointment, patient]);

  const searchPatients = async () => {
    setPatientLoading(true);
    setError("");
    try {
      setPatients(await loadPatients(patientQuery.trim() || undefined));
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      setPatientLoading(false);
    }
  };

  const choosePatient = (next: Patient) => {
    setPatient(next);
    setPatients([]);
    setPatientQuery("");
    setError("");
  };

  const submitNewPatient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError("");
    try {
      const created = await createPatientRecord({
        full_name: String(form.get("full_name") ?? "").trim(),
        ...(String(form.get("dni") ?? "").trim() ? { dni: String(form.get("dni")).trim() } : {}),
        ...(String(form.get("phone") ?? "").trim() ? { phone: String(form.get("phone")).trim() } : {}),
      }, newIdempotencyKey());
      choosePatient(created);
      setNewPatientOpen(false);
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      setLoading(false);
    }
  };

  const ensureVisit = async () => {
    if (!appointment || !patient) return;
    if (visit) {
      setStep(2);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const created = await createVisitRecord({
        patient_id: patient.id,
        appointment_id: useMocks ? appointment.id : Number(appointment.id),
      }, newIdempotencyKey());
      setVisit(created);
      setExecutions(created.executions);
      setStep(2);
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      setLoading(false);
    }
  };

  const submitExecution = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!visit || serviceId === "") return;
    setLoading(true);
    setError("");
    try {
      const created = await createServiceExecutionRecord(visit.id, { service_id: Number(serviceId), executed_price: Number(price) }, newIdempotencyKey());
      setExecutions((current) => [...current, created]);
      setPrice("");
      setStep(3);
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      setLoading(false);
    }
  };

  const issueCharge = async (execution: ServiceExecution) => {
    setLoading(true);
    setError("");
    try {
      const charge = await createChargeRecord(execution.id, {}, newIdempotencyKey());
      setExecutions((current) => current.map((item) => item.id === execution.id ? { ...item, chargeId: Number(charge.id) } : item));
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      setLoading(false);
    }
  };

  const existingExecutionForService = executions.find((execution) => execution.serviceId === Number(serviceId));
  const readyToCharge = executions.length > 0;

  return <Drawer title="Registrar atención" open={Boolean(appointment)} onClose={onClose} width="wide">
    {appointment && <div className="attendance-panel">
      <div className="attendance-intro"><div><span className="eyebrow">Atención vinculada</span><h3>{appointment.patient}</h3><p>{appointment.treatment} · {appointment.branch} · {appointment.time}</p></div><Badge tone={statusTone(appointment.status)}>{appointment.status}</Badge></div>
      <ol className="attendance-steps" aria-label="Pasos de atención">{stepItems.map(([number, label]) => <li key={number} className={step === number ? "attendance-step--active" : step > number ? "attendance-step--done" : ""}><span>{step > number ? <Check size={14} /> : number}</span>{label}</li>)}</ol>
      {error && <div className="form-error" role="alert">{error}</div>}
      {loading && <div className="detail-loading" role="status">Guardando en el backend…</div>}

      {step === 1 && <section className="attendance-step-panel" aria-labelledby="attendance-patient-title"><div className="section-heading"><div><span className="eyebrow">Paso 1 de 3</span><h4 id="attendance-patient-title">Confirma el paciente</h4></div><UserRound size={22} aria-hidden="true" /></div>{patient ? <div className="canonical-patient"><span className="avatar avatar--cyan">{patient.initials}</span><div><strong>{patient.name}</strong><small>{patient.id && `Paciente #${patient.id}`}</small><p>Proyección canónica de Pacientes; no se modifica desde Agenda.</p></div><Badge tone="green">Paciente</Badge></div> : <div className="patient-search-block"><p className="field-note"><UserRound size={16} /> Esta cita todavía no tiene un Patient canónico. Busca o registra uno; el Lead no se convierte automáticamente.</p><div className="search-control search-control--full"><Search size={18} /><input value={patientQuery} onChange={(event) => setPatientQuery(event.target.value)} placeholder="Buscar por nombre, DNI o teléfono" aria-label="Buscar paciente" /><Button compact type="button" onClick={() => void searchPatients()} disabled={patientLoading}>{patientLoading ? "Buscando…" : "Buscar"}</Button></div>{patients.length > 0 && <div className="patient-search-results">{patients.map((item) => <button key={item.id} type="button" onClick={() => choosePatient(item)}><span className={`avatar avatar--${item.tone}`}>{item.initials}</span><span><strong>{item.name}</strong><small>{item.dni || "Sin DNI"} · {item.phone || "Sin teléfono"}</small></span></button>)}</div>}<Button type="button" variant="secondary" onClick={() => setNewPatientOpen((current) => !current)}>{newPatientOpen ? "Cerrar registro" : "Registrar Patient canónico"}</Button>{newPatientOpen && <form className="form-grid attendance-new-patient" onSubmit={submitNewPatient}><label className="field field--wide"><span>Nombre completo</span><input name="full_name" required autoFocus /></label><label className="field"><span>DNI (opcional)</span><input name="dni" inputMode="numeric" /></label><label className="field"><span>Teléfono (opcional)</span><input name="phone" type="tel" /></label><div className="form-actions field--wide"><Button type="submit" variant="primary" disabled={loading}>Guardar Patient</Button></div></form>}</div>}<div className="form-actions attendance-actions"><Button type="button" onClick={onClose}>Cancelar</Button><Button type="button" variant="primary" onClick={() => void ensureVisit()} disabled={!patient || loading}>Continuar al servicio</Button></div></section>}

      {step === 2 && <section className="attendance-step-panel" aria-labelledby="attendance-service-title"><div className="section-heading"><div><span className="eyebrow">Paso 2 de 3</span><h4 id="attendance-service-title">Registra lo ejecutado</h4><p>El precio lo ingresa el operador; no se muestra un precio sugerido de catálogo.</p></div><ClipboardPenLine size={22} aria-hidden="true" /></div>{visit && <div className="canonical-patient canonical-patient--compact"><span className="avatar avatar--cyan">{initials(visit.patientName)}</span><div><strong>{visit.patientName}</strong><small>{visit.locationName} · {visit.practitionerName}</small></div><Badge tone="green">Visita #{visit.id}</Badge></div>}{executions.length > 0 && <div className="execution-list">{executions.map((execution) => <div className="execution-row" key={execution.id}><span><strong>{execution.serviceName}</strong><small>{money(execution.executedPrice)} · {execution.chargeId ? "Cargo emitido" : "Sin cargo"}</small></span><Badge tone={execution.chargeId ? "green" : "amber"}>{execution.chargeId ? "Facturado" : "Por facturar"}</Badge></div>)}</div>}<form className="form-grid" onSubmit={submitExecution}><label className="field field--wide"><span>Servicio ejecutado</span><select value={serviceId} onChange={(event) => setServiceId(event.target.value ? Number(event.target.value) : "")} required disabled={loading || Boolean(existingExecutionForService)}><option value="">Selecciona el servicio</option>{services.filter((service) => service.isActive).map((service) => <option key={service.id} value={service.id}>{service.name} · {service.durationMinutes} min</option>)}</select></label><label className="field field--wide"><span>Precio ejecutado (S/)</span><input type="number" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} required disabled={loading || Boolean(existingExecutionForService)} placeholder="Ingresa el importe acordado" /></label>{existingExecutionForService && <p className="field-note field--wide"><Check size={16} /> Este servicio ya está registrado en la visita; continúa para emitir su cargo.</p>}<div className="form-actions field--wide"><Button type="button" onClick={() => setStep(1)} disabled={loading}>Atrás</Button>{existingExecutionForService ? <Button type="button" variant="primary" onClick={() => setStep(3)} disabled={loading}>Continuar al cargo</Button> : <Button type="submit" variant="primary" disabled={loading || !price}>{loading ? "Guardando…" : "Registrar ejecución"}</Button>}</div></form></section>}

      {step === 3 && <section className="attendance-step-panel" aria-labelledby="attendance-charge-title"><div className="section-heading"><div><span className="eyebrow">Paso 3 de 3</span><h4 id="attendance-charge-title">Emite los cargos</h4><p>El cargo toma el precio ejecutado por defecto; cualquier corrección debe ser deliberada y validada por el servidor.</p></div><WalletCards size={22} aria-hidden="true" /></div><div className="charge-issue-list">{executions.map((execution) => <div className="charge-issue-row" key={execution.id}><div><strong>{execution.serviceName}</strong><span>{money(execution.executedPrice)} · Ejecución #{execution.id}</span></div>{execution.chargeId ? <Badge tone="green"><Check size={13} /> Cargo emitido</Badge> : <Button compact variant="primary" onClick={() => void issueCharge(execution)} disabled={loading}>Crear cargo</Button>}</div>)}</div>{!readyToCharge && <p className="empty-state">Registra al menos un servicio ejecutado para emitir un cargo.</p>}{executions.length > 0 && executions.every((execution) => execution.chargeId) && <div className="settled-callout"><Check size={20} /><span>Atención registrada y cargos emitidos. Los cobros se gestionan desde Caja.</span></div>}<div className="form-actions attendance-actions"><Button type="button" onClick={() => setStep(2)} disabled={loading}>Atrás</Button><Button type="button" variant="primary" onClick={() => { setSaved(true); onClose(); }} disabled={loading || !executions.length || !executions.every((execution) => execution.chargeId)}>{saved ? "Listo" : "Finalizar atención"}</Button></div></section>}
    </div>}
  </Drawer>;
}
