"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { loadTaskAssignees, newIdempotencyKey, proposeTaskDelegation, toApiError } from "../api";
import type { InboxItem, TaskAssignees, TaskDelegationCreate } from "../contracts/client";
import type { Appointment } from "../types";
import { Button } from "../components/Button";
import { usePersona } from "../components/PersonaContext";
import { createLatestRequest } from "../session";
import { ProposalReceipt } from "./ProposalReceipt";

export function TaskDelegationDraft({ appointment }: { appointment: Appointment }) {
  const { version } = usePersona();
  return <DelegationDraft key={`${version}:${appointment.id}:${appointment.locationId}:${appointment.patientId}`} appointment={appointment} />;
}

function DelegationDraft({ appointment }: { appointment: Appointment }) {
  const { identity } = usePersona();
  const [assignees, setAssignees] = useState<TaskAssignees>([]);
  const [assignee, setAssignee] = useState("");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [proposal, setProposal] = useState<InboxItem | null>(null);
  const requests = useRef(createLatestRequest());
  const writes = useRef(createLatestRequest());
  const intent = useRef<{ fingerprint: string; key: string } | null>(null);
  useEffect(() => {
    const isCurrent = requests.current.begin();
    setAssignees([]); setAssignee(""); setLoading(true); setError("");
    if (!appointment.locationId) { setError("La cita no tiene una sede autorizada."); setLoading(false); return; }
    void loadTaskAssignees(appointment.locationId).then(rows => { if (isCurrent()) setAssignees(rows); })
      .catch(caught => { if (isCurrent()) setError(toApiError(caught).message); })
      .finally(() => { if (isCurrent()) setLoading(false); });
    return () => { requests.current.invalidate(); writes.current.invalidate(); };
  }, [appointment.locationId, revision]);
  // Sede authorization comes from the catalogue/report endpoints, not /me's org grants.
  const permitted = identity?.principalType === "human";
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !permitted || !appointment.locationId || !assignees.some(person => String(person.principal_id) === assignee)) return;
    const deadline = new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(due) ? `${due}-05:00` : NaN);
    if (!Number.isFinite(deadline.getTime())) { setError("Escribe un plazo válido en hora Lima."); return; }
    const payload: TaskDelegationCreate = {
      title: title.trim(), location_id: appointment.locationId, assignee_principal_id: Number(assignee), due_at: deadline.toISOString(),
      appointment_id: Number(appointment.id), ...(appointment.patientId != null ? { patient_id: Number(appointment.patientId) } : {}),
    };
    const fingerprint = JSON.stringify(payload);
    if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, key: newIdempotencyKey() };
    const isCurrent = writes.current.begin();
    setBusy(true); setError("");
    try {
      const row = await proposeTaskDelegation(payload, intent.current.key);
      if (isCurrent()) { setProposal(row); intent.current = null; }
    } catch (caught) { if (isCurrent()) setError(toApiError(caught).message); }
    finally { if (isCurrent()) setBusy(false); }
  };
  return <div className="airi-catalog">
    <p>{appointment.patient} · {appointment.treatment} · {appointment.branch}</p>
    <p className="field-note">Prepararás una delegación para revisión humana. La tarea, su acuse, su completado y WhatsApp tienen estados separados.</p>
    {loading && <p role="status">Consultando responsables de esta sede…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !assignees.length && <p>No hay responsables disponibles. <Button compact disabled={busy} onClick={() => setRevision(value => value + 1)}>Volver a consultar</Button></p>}
    {proposal ? <div><ProposalReceipt proposal={proposal} /><p>Solicitar la delegación por sí solo no crea ni completa una tarea; requiere la aprobación humana.</p></div> : <form className="form-grid" onSubmit={submit}>
      <label className="field field--wide"><span>Qué debe hacer</span><input required maxLength={200} autoFocus value={title} disabled={busy} onChange={event => setTitle(event.target.value)} /></label>
      <label className="field"><span>Responsable del equipo</span><select required value={assignee} disabled={loading || busy} onChange={event => setAssignee(event.target.value)}><option value="">Elige una persona…</option>{assignees.map(person => <option key={person.principal_id} value={person.principal_id}>{person.display_name}</option>)}</select></label>
      <label className="field"><span>Plazo · hora Lima</span><input required type="datetime-local" value={due} disabled={busy} onChange={event => setDue(event.target.value)} /></label>
      {!permitted && <p>Tu usuario no tiene permiso para preparar esta delegación.</p>}
      <div className="form-actions field--wide"><Button type="submit" variant="primary" disabled={busy || loading || !permitted || !assignee || !title.trim() || !due}>{busy ? "Preparando…" : "Preparar delegación"}</Button></div>
    </form>}
  </div>;
}
