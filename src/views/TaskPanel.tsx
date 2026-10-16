"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { acceptTask, canCompleteTask, finishTask, loadTasks, newIdempotencyKey, toApiError, useMocks } from "../api";
import type { TaskOut } from "../contracts/client";
import { usePersona } from "../components/PersonaContext";
import { createLatestRequest } from "../session";

const labels = { open: "Pendiente", done: "Completada", escalated: "Escalada", cancelled: "Cancelada" };
const deliveryLabels = { not_configured: "No configurado", pending: "Pendiente de envío", sent: "Enviado", delivered: "Entregado", failed: "No se entregó" };
const instant = (value: string) => new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" }).format(new Date(value));

export function TaskPanel({ locationId }: { locationId: string | null }) {
  const { identity, version } = usePersona();
  return <TaskList key={`${version}:${locationId}`} locationId={locationId} identity={identity} />;
}

function TaskList({ locationId, identity }: { locationId: string | null; identity: ReturnType<typeof usePersona>["identity"] }) {
  const [rows, setRows] = useState<TaskOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [history, setHistory] = useState(false);
  const [partial, setPartial] = useState(false);
  const requests = useRef(createLatestRequest());
  useEffect(() => {
    const isCurrent = requests.current.begin();
    setLoading(true); setError(""); setRows([]); setPartial(false);
    // The unscoped route includes own tasks without requiring proposals.read.
    // Separate active states prevent completed history from consuming the limit.
    const states = history ? ["done", "cancelled"] as const : ["open", "escalated"] as const;
    void Promise.all(states.map(status => loadTasks({ status, limit: 100 }))).then(pages => {
      if (!isCurrent()) return;
      setPartial(pages.some(page => page.length === 100));
      const data = [...new Map(pages.flat().map(task => [task.id, task])).values()];
      setRows(data.filter(task => !locationId || task.location_id === Number(locationId)));
    }).catch(caught => { if (isCurrent()) setError(toApiError(caught).message); })
      .finally(() => { if (isCurrent()) setLoading(false); });
    return () => requests.current.invalidate();
  }, [locationId, revision, history]);
  return <section className="turn-group" aria-label="Tareas del equipo" aria-busy={loading}>
    <h2>Tareas del equipo</h2>
    <p className="operations-meta">Completar una tarea no cambia la atención clínica ni firma una ficha.</p>
    <div className="form-actions"><button className="catalog-button" aria-pressed={!history} onClick={() => setHistory(false)}>Activas</button><button className="catalog-button" aria-pressed={history} onClick={() => setHistory(true)}>Historial</button></div>
    {loading && <p role="status">Cargando tareas…</p>}
    {error && <p role="alert">{error} <button className="catalog-button" onClick={() => setRevision(value => value + 1)}>Reintentar</button></p>}
    {!loading && !error && !rows.length && <p>{useMocks ? "Esta demo no tiene tareas delegadas." : "No hay tareas accesibles con este contexto."}</p>}
    {!error && rows.map(row => <TaskRow key={row.id} task={row} identity={identity} onUpdate={next => setRows(current => current.map(item => item.id === next.id ? next : item))} />)}
    {partial && <p className="operations-meta">Esta fuente devuelve hasta 100 tareas por estado antes de filtrar la sede; la lista puede ser parcial.</p>}
  </section>;
}

function TaskRow({ task, identity, onUpdate }: { task: TaskOut; identity: ReturnType<typeof usePersona>["identity"]; onUpdate: (task: TaskOut) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [failedAction, setFailedAction] = useState<"ack" | "complete" | null>(null);
  const intents = useRef<Partial<Record<"complete" | "ack", string>>>({});
  const requests = useRef(createLatestRequest());
  useEffect(() => () => requests.current.invalidate(), []);
  const complete = async (action: "complete" | "ack") => {
    if (busy || !canCompleteTask(identity, task)) return;
    const isCurrent = requests.current.begin();
    const key = intents.current[action] ??= newIdempotencyKey();
    setBusy(true); setError(""); setFailedAction(null);
    try {
      const updated = action === "ack" ? await acceptTask(task.id, key) : await finishTask(task.id, {}, key);
      if (isCurrent()) { onUpdate(updated); delete intents.current[action]; }
    } catch (caught) { if (isCurrent()) { setError(toApiError(caught).message); setFailedAction(action); } }
    finally { if (isCurrent()) setBusy(false); }
  };
  return <article className="operations-case" aria-label={`Tarea ${task.id}`}>
    <strong>{task.title}</strong><p>{task.assignee_name} · {labels[task.status]}</p>
    <p>{task.due_at ? <>Plazo: <time dateTime={task.due_at}>{instant(task.due_at)}</time>{task.overdue ? " · Vencida" : ""}</> : "Sin plazo registrado"}</p>
    <p className="operations-meta">WhatsApp: {task.delivery ? deliveryLabels[task.delivery.state] : "estado del canal no disponible en esta fuente"}. La tarea permanece en AIRI.</p>
    <p>{task.acknowledged_at ? <>Aceptada: <time dateTime={task.acknowledged_at}>{instant(task.acknowledged_at)}</time></> : "Sin acuse registrado"}</p>
    {task.context?.patient && <p><Link href={`/pacientes?patient=${task.context.patient.id}`}>{task.context.patient.full_name}</Link></p>}
    {task.context?.appointment && <p><Link href={`/agenda?appointment=${task.context.appointment.id}`}>{task.context.appointment.service_name} · {instant(task.context.appointment.start_utc)}</Link></p>}
    {task.context?.restricted && <p className="operations-meta">Parte del contexto requiere permisos adicionales.</p>}
    {task.completed_at && <p>Completada: <time dateTime={task.completed_at}>{instant(task.completed_at)}</time></p>}
    {error && <p role="alert">{failedAction === "ack" ? "Aceptación" : "Completado"}: {error}</p>}
    {canCompleteTask(identity, task) && <>
      {!task.acknowledged_at && <button className="catalog-button" disabled={busy} onClick={() => void complete("ack")}>{busy ? "Guardando…" : failedAction === "ack" ? "Reintentar aceptación" : "Aceptar tarea"}</button>}
      <button className="catalog-button" disabled={busy} onClick={() => void complete("complete")}>{busy ? "Guardando…" : failedAction === "complete" ? "Reintentar completar" : "Completar tarea"}</button>
    </>}
  </article>;
}
