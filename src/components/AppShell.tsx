import { useEffect, useState, type FormEvent } from "react";
import { Outlet } from "react-router-dom";
import { createAppointment } from "../api";
import { Button } from "./Button";
import { Header } from "./Header";
import { Modal } from "./Modal";

export function AppShell() {
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const submitAppointment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    await createAppointment({
      patient: String(form.get("patient")),
      treatment: String(form.get("treatment")),
      doctor: String(form.get("doctor")),
      branch: String(form.get("branch")),
      date: String(form.get("date")),
      time: String(form.get("time")),
    });
    setSaving(false);
    setAppointmentOpen(false);
    setToast("Cita creada correctamente");
    window.dispatchEvent(new Event("appointment-created"));
  };

  return (
    <div className="app-shell">
      <Header onNewAppointment={() => setAppointmentOpen(true)} />
      <main className="app-main"><Outlet /></main>
      <Modal title="Nueva cita" open={appointmentOpen} onClose={() => setAppointmentOpen(false)}>
        <form id="new-appointment-form" className="form-grid" onSubmit={submitAppointment}>
          <label className="field field--wide"><span>Paciente</span><input name="patient" required placeholder="Nombre del paciente" autoFocus /></label>
          <label className="field"><span>Tratamiento</span><select name="treatment" defaultValue="Limpieza dental"><option>Limpieza dental</option><option>Evaluación</option><option>Ortodoncia</option><option>Endodoncia</option></select></label>
          <label className="field"><span>Odontólogo</span><select name="doctor"><option>Dra. Valeria Ruiz</option><option>Dr. Mateo León</option></select></label>
          <label className="field"><span>Sede</span><select name="branch"><option>Lince</option><option>Jesús María</option><option>Magdalena</option></select></label>
          <label className="field"><span>Fecha</span><input name="date" type="date" defaultValue="2026-08-14" required /></label>
          <label className="field"><span>Hora</span><input name="time" type="time" defaultValue="10:30" required /></label>
          <div className="form-actions field--wide"><Button type="button" onClick={() => setAppointmentOpen(false)}>Cancelar</Button><Button type="submit" variant="primary" disabled={saving}>{saving ? "Guardando…" : "Crear cita"}</Button></div>
        </form>
      </Modal>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
