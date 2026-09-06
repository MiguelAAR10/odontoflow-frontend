import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  bookReal,
  createAppointment,
  currentWeekWindow,
  getEligiblePractitioners,
  getLeads,
  getLocations,
  getServices,
  getSlots,
  newIdempotencyKey,
  toApiError,
  useMocks,
} from "../api";
import type { LeadRead, LocationRead, PractitionerRead, ServiceRead, SlotResult } from "../contracts/client";
import { AppSidebar } from "./AppSidebar";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { Surface } from "./Surface";
import { Topbar } from "./Topbar";

function localDateKey(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
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

export function AppShell({ children }: { children: ReactNode }) {
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [key, setKey] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [leads, setLeads] = useState<LeadRead[]>([]);
  const [services, setServices] = useState<ServiceRead[]>([]);
  const [locations, setLocations] = useState<LocationRead[]>([]);
  const [practitioners, setPractitioners] = useState<PractitionerRead[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [practitionerId, setPractitionerId] = useState("");
  const [slots, setSlots] = useState<SlotResult[]>([]);
  const [selectedStart, setSelectedStart] = useState("");
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");

  const selectedLocation = locations.find((location) => location.id === Number(locationId));
  const slotTimeZone = selectedLocation?.timezone ?? "America/Lima";
  const slotsByDate = useMemo(() => {
    const grouped = new Map<string, SlotResult[]>();
    for (const slot of slots) {
      const date = localDateKey(slot.start, slotTimeZone);
      const daySlots = grouped.get(date) ?? [];
      daySlots.push(slot);
      grouped.set(date, daySlots);
    }
    return Array.from(grouped.entries());
  }, [slotTimeZone, slots]);

  const loadSelectors = useCallback(() => {
    if (useMocks) return;
    void getLeads().then(setLeads).catch((caught) => setError(toApiError(caught).message));
    void getServices().then(setServices).catch((caught) => setError(toApiError(caught).message));
    void getLocations().then(setLocations).catch((caught) => setError(toApiError(caught).message));
  }, []);

  useEffect(() => {
    if (!appointmentOpen) return;
    loadSelectors();
    setError("");
    setKey(newIdempotencyKey());
    setServiceId("");
    setLocationId("");
    setPractitionerId("");
    setPractitioners([]);
    setSlots([]);
    setSelectedStart("");
    setSlotsError("");
  }, [appointmentOpen, loadSelectors]);

  useEffect(() => {
    if (useMocks || !serviceId || !locationId) {
      setPractitioners([]);
      setPractitionerId("");
      setSlots([]);
      setSelectedStart("");
      return;
    }
    setPractitionerId("");
    setSlots([]);
    setSelectedStart("");
    void getEligiblePractitioners(Number(serviceId), Number(locationId))
      .then(setPractitioners)
      .catch((caught) => setError(toApiError(caught).message));
  }, [locationId, serviceId]);

  useEffect(() => {
    if (useMocks || !appointmentOpen || !serviceId || !locationId || !practitionerId) {
      setSlotsLoading(false);
      return;
    }
    setSlotsLoading(true);
    setSlotsError("");
    setSelectedStart("");
    const window = currentWeekWindow(slotTimeZone);
    void getSlots({
      service_id: Number(serviceId),
      location_id: Number(locationId),
      window_start: window.from,
      window_end: window.to,
    })
      .then((available) => {
        setSlots(available.filter((slot) => slot.practitioner_id === Number(practitionerId)));
      })
      .catch((caught) => setSlotsError(toApiError(caught).message))
      .finally(() => setSlotsLoading(false));
  }, [appointmentOpen, locationId, practitionerId, serviceId, slotTimeZone]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [sidebarOpen]);

  const submitAppointment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      if (useMocks) {
        await createAppointment({
          patient: String(form.get("patient")),
          treatment: String(form.get("treatment")),
          doctor: String(form.get("doctor")),
          branch: String(form.get("branch")),
          date: String(form.get("date")),
          time: String(form.get("time")),
        });
      } else {
        if (!selectedStart) {
          setError("Selecciona un horario disponible.");
          return;
        }
        await bookReal({
          lead_id: Number(form.get("lead_id")),
          service_id: Number(form.get("service_id")),
          location_id: Number(form.get("location_id")),
          practitioner_id: Number(form.get("practitioner_id")),
          start: selectedStart,
        }, key);
      }
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
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      <AppSidebar mobileOpen={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
      <div className="app-workspace">
        <Topbar onNewAppointment={() => setAppointmentOpen(true)} mobileOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((value) => !value)} />
        <Surface as="main" id="main-content" className="app-main">{children}</Surface>
      </div>
      {sidebarOpen && <button className="sidebar-backdrop" type="button" aria-label="Cerrar navegación" onClick={() => setSidebarOpen(false)} />}
      <Modal title="Nueva cita" open={appointmentOpen} onClose={() => setAppointmentOpen(false)}>
        <form id="new-appointment-form" className="form-grid" onSubmit={submitAppointment}>
          {useMocks ? (
            <>
              <label className="field field--wide"><span>Paciente</span><input name="patient" required placeholder="Nombre del paciente" autoFocus /></label>
              <label className="field"><span>Tratamiento</span><select name="treatment" defaultValue="Limpieza dental"><option>Limpieza dental</option><option>Evaluación</option><option>Ortodoncia</option><option>Endodoncia</option></select></label>
              <label className="field"><span>Odontólogo</span><select name="doctor"><option>Dra. Valeria Ruiz</option><option>Dr. Mateo León</option></select></label>
              <label className="field"><span>Sede</span><select name="branch"><option>Lince</option><option>Jesús María</option><option>Magdalena</option></select></label>
              <label className="field"><span>Fecha</span><input name="date" type="date" defaultValue="2026-08-14" required /></label>
              <label className="field"><span>Hora</span><input name="time" type="time" defaultValue="10:30" required /></label>
            </>
          ) : (
            <>
              <label className="field field--wide"><span>Paciente / lead</span><select name="lead_id" required autoFocus><option value="">Selecciona un lead…</option>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.full_name}</option>)}</select></label>
              <label className="field"><span>Servicio</span><select name="service_id" required value={serviceId} onChange={(event) => setServiceId(event.target.value)}><option value="">Selecciona…</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
              <label className="field"><span>Sede</span><select name="location_id" required value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">Selecciona…</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
              <label className="field"><span>Odontólogo</span><select name="practitioner_id" required value={practitionerId} disabled={!serviceId || !locationId || practitioners.length === 0} onChange={(event) => setPractitionerId(event.target.value)}><option value="">{serviceId && locationId ? "Selecciona…" : "Elige servicio y sede"}</option>{practitioners.map((practitioner) => <option key={practitioner.id} value={practitioner.id}>{practitioner.display_name}</option>)}</select></label>
              <div className="field field--wide slot-picker" aria-live="polite">
                <span>Horario disponible</span>
                {!practitionerId && <p className="slot-picker__hint">Elige un odontólogo para consultar horarios reales.</p>}
                {slotsLoading && <p className="slot-picker__hint">Consultando disponibilidad…</p>}
                {slotsError && <p className="form-error" role="alert">{slotsError}</p>}
                {!slotsLoading && practitionerId && !slotsError && slots.length === 0 && <p className="slot-picker__hint">No hay horarios disponibles para este odontólogo en la semana consultada.</p>}
                {slotsByDate.map(([date, dateSlots]) => (
                  <div className="slot-picker__day" key={date}>
                    <strong>{formatSlotDate(date)}</strong>
                    <div className="slot-picker__options">
                      {dateSlots.map((slot) => {
                        const active = selectedStart === slot.start;
                        return <button className={`slot-option ${active ? "slot-option--active" : ""}`} type="button" key={`${slot.practitioner_id}-${slot.start}`} aria-pressed={active} onClick={() => setSelectedStart(slot.start)}>{formatSlotTime(slot.start, slotTimeZone)}</button>;
                      })}
                    </div>
                  </div>
                ))}
                {selectedStart && <p className="slot-picker__selection">Horario seleccionado: <strong>{formatSlotTime(selectedStart, slotTimeZone)}</strong></p>}
              </div>
            </>
          )}
          {error && <div className="form-error field--wide" role="alert">{error}</div>}
          <div className="form-actions field--wide"><Button type="button" onClick={() => setAppointmentOpen(false)}>Cancelar</Button><Button type="submit" variant="primary" disabled={saving || (!useMocks && !selectedStart)}>{saving ? "Guardando…" : "Crear cita"}</Button></div>
        </form>
      </Modal>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
