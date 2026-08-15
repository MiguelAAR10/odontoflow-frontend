import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Outlet } from "react-router-dom";
import { createAppointment, getEligiblePractitioners, getLeads, getLocations, getServices, newIdempotencyKey, toApiError, useMocks } from "../api";
import type { LeadRead, LocationRead, PractitionerRead, ServiceRead } from "../contracts/client";
import { Button } from "./Button";
import { Header } from "./Header";
import { Modal } from "./Modal";

export function AppShell() {
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [key, setKey] = useState("");

  const [leads, setLeads] = useState<LeadRead[]>([]);
  const [services, setServices] = useState<ServiceRead[]>([]);
  const [locations, setLocations] = useState<LocationRead[]>([]);
  const [practitioners, setPractitioners] = useState<PractitionerRead[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [locationId, setLocationId] = useState("");

  const loadSelectors = useCallback(() => {
    if (useMocks) return;
    void getLeads().then(setLeads).catch(() => setError("No se pudieron cargar los pacientes."));
    void getServices().then(setServices).catch(() => setError("No se pudieron cargar los tratamientos."));
    void getLocations().then(setLocations).catch(() => setError("No se pudieron cargar las sedes."));
  }, []);

  useEffect(() => {
    if (!appointmentOpen) return;
    loadSelectors();
    setError("");
    setKey(newIdempotencyKey());
  }, [appointmentOpen, loadSelectors]);

  useEffect(() => {
    if (useMocks || !serviceId || !locationId) {
      setPractitioners([]);
      return;
    }
    void getEligiblePractitioners(Number(serviceId), Number(locationId))
      .then(setPractitioners)
      .catch(() => setError("No se pudieron cargar los odontólogos."));
  }, [serviceId, locationId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const submitAppointment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const real = {
        lead_id: Number(form.get("lead_id")),
        service_id: Number(form.get("service_id")),
        location_id: Number(form.get("location_id")),
        practitioner_id: Number(form.get("practitioner_id")),
        date: String(form.get("date")),
        time: String(form.get("time")),
        idempotencyKey: key,
      };
      const lead = leads.find((item) => item.id === real.lead_id);
      const service = services.find((item) => item.id === real.service_id);
      const location = locations.find((item) => item.id === real.location_id);
      const practitioner = practitioners.find((item) => item.id === real.practitioner_id);
      await createAppointment(
        useMocks
          ? {
              patient: String(form.get("patient")),
              treatment: String(form.get("treatment")),
              doctor: String(form.get("doctor")),
              branch: String(form.get("branch")),
              date: String(form.get("date")),
              time: String(form.get("time")),
            }
          : {
              patient: lead?.full_name ?? "",
              treatment: service?.name ?? "",
              doctor: practitioner?.display_name ?? "",
              branch: location?.name ?? "",
              ...real,
            },
      );
      setAppointmentOpen(false);
      setToast("Cita creada correctamente");
      window.dispatchEvent(new Event("appointment-created"));
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-shell">
      <Header onNewAppointment={() => setAppointmentOpen(true)} />
      <main className="app-main"><Outlet /></main>
      <Modal title="Nueva cita" open={appointmentOpen} onClose={() => setAppointmentOpen(false)}>
        <form id="new-appointment-form" className="form-grid" onSubmit={submitAppointment}>
          {useMocks ? (
            <>
              <label className="field field--wide"><span>Paciente</span><input name="patient" required placeholder="Nombre del paciente" autoFocus /></label>
              <label className="field"><span>Tratamiento</span><select name="treatment" defaultValue="Limpieza dental"><option>Limpieza dental</option><option>Evaluación</option><option>Ortodoncia</option><option>Endodoncia</option></select></label>
              <label className="field"><span>Odontólogo</span><select name="doctor"><option>Dra. Valeria Ruiz</option><option>Dr. Mateo León</option></select></label>
              <label className="field"><span>Sede</span><select name="branch"><option>Lince</option><option>Jesús María</option><option>Magdalena</option></select></label>
            </>
          ) : (
            <>
              <label className="field field--wide"><span>Paciente</span><select name="lead_id" required autoFocus><option value="">Selecciona un paciente…</option>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.full_name}</option>)}</select></label>
              <label className="field"><span>Tratamiento</span><select name="service_id" required value={serviceId} onChange={(event) => setServiceId(event.target.value)}><option value="">Selecciona…</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
              <label className="field"><span>Sede</span><select name="location_id" required value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">Selecciona…</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
              <label className="field"><span>Odontólogo</span><select name="practitioner_id" required disabled={practitioners.length === 0}><option value="">Selecciona…</option>{practitioners.map((practitioner) => <option key={practitioner.id} value={practitioner.id}>{practitioner.display_name}</option>)}</select></label>
            </>
          )}
          <label className="field"><span>Fecha</span><input name="date" type="date" defaultValue="2026-08-14" required /></label>
          <label className="field"><span>Hora</span><input name="time" type="time" defaultValue="10:30" required /></label>
          {error && <div className="form-error field--wide" role="alert">{error}</div>}
          <div className="form-actions field--wide"><Button type="button" onClick={() => setAppointmentOpen(false)}>Cancelar</Button><Button type="submit" variant="primary" disabled={saving}>{saving ? "Guardando…" : "Crear cita"}</Button></div>
        </form>
      </Modal>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
