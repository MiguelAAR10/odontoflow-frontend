"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { AgentId } from "../agui/card";
import type { AgentStatus, RunState } from "../agui/reducer";
import { Character } from "./characters/Character";
import { agentActivity, responsibilities } from "./activity";

// Presentation identity from the v10 cast, never business data.
export const CREW = [
  { id: "airi", name: "AIRI", role: "coordina" },
  { id: "cepillo", name: "Cepillo", role: "agenda y cupos" },
  { id: "pasta", name: "Pasta", role: "cobranza" },
  { id: "hilo", name: "Hilo", role: "confirmaciones" },
  { id: "enjuague", name: "Enjuague", role: "caja" },
  { id: "espejo", name: "Espejo", role: "fichas" },
  { id: "escudo", name: "Escudo", role: "identidad" },
] as const;
export const STATUS: Record<AgentStatus, string> = {
  idle: "en reposo", thinking: "pensando", working: "trabajando", handoff: "pasa el caso",
  "needs-you": "te necesita", done: "listo",
};
export const agentColor = (agent: AgentId): CSSProperties => ({
  "--crew-color": `var(--ag-${agent})`, "--crew-text": `var(--agt-${agent})`,
} as CSSProperties);

const traceLabels: Record<string, string> = {
  RUN_REQUESTED: "Intención recibida", RUN_STARTED: "Empezó la tarea", STEP_STARTED: "Empezó un paso",
  STEP_FINISHED: "Terminó un paso", SUBAGENT_STARTED: "Recibió el caso", TOOL_CALL_START: "Consultó una herramienta",
  TOOL_CALL_ARGS: "Preparó la consulta", TOOL_CALL_END: "Preparó la herramienta", TOOL_CALL_RESULT: "Recibió el resultado",
  TEXT_MESSAGE_START: "Empezó la respuesta", TEXT_MESSAGE_CONTENT: "Escribió la respuesta", TEXT_MESSAGE_END: "Terminó la respuesta",
  RUN_FINISHED: "Terminó la tarea", CARD_APPROVED: "Aprobado por ti", STATE_SNAPSHOT: "Consultó el estado",
  STATE_DELTA: "Actualizó el estado", CUSTOM: "Preparó información",
};

export function AgentDialog({ agent, state, trigger, onClose, onOpenCard }: {
  agent: AgentId; state: RunState; trigger: HTMLButtonElement; onClose: () => void; onOpenCard: (cardId: string) => void;
}) {
  const identity = CREW.find(item => item.id === agent)!;
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [position, setPosition] = useState({ left: 16, top: 110 });
  const latest = state.trace.filter(row => row.agent === agent).slice(-3).reverse();
  const activity = agentActivity(state, agent);
  const card = (activity.pending ?? activity.latest)?.card;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    const place = () => {
      const rect = trigger.getBoundingClientRect();
      setPosition({ left: Math.max(16, Math.min(window.innerWidth - element.offsetWidth - 16, rect.left + rect.width / 2 - element.offsetWidth / 2)),
        top: Math.max(16, Math.min(rect.bottom + 14, window.innerHeight - element.offsetHeight - 16)) });
    };
    place();
    element.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    window.addEventListener("resize", place);
    const observer = new ResizeObserver(place);
    observer.observe(element);
    return () => {
      observer.disconnect(); window.removeEventListener("resize", place);
      element.close(); trigger.focus({ preventScroll: true });
    };
  }, [trigger]);

  return createPortal(<dialog ref={dialog} className="airi-crew-dialog" aria-labelledby={titleId}
    style={{ ...agentColor(agent), ...position }} onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
    <div className="airi-crew-dialog__header"><span className="airi-crew-face"><Character agent={agent} state="idle" gaze={false} decorative size={36} /></span>
      <div><strong id={titleId}>{identity.name}</strong><small>{identity.role}</small></div>
      <button type="button" aria-label="Cerrar diálogo" onClick={onClose}>×</button></div>
    <p>{responsibilities[agent]}</p>
    <p><span className="airi-crew-muted">En este hilo · {STATUS[state.agents[agent]]}</span>{state.run.agent === agent && state.run.what ? `: ${state.run.what}` : ""}</p>
    <p className="airi-crew-muted">Actividad reciente del hilo actual; no representa el total del turno.</p>
    {latest.length ? <ul aria-label={`Rastro de ${identity.name}`}>{latest.map((row, i) => <li key={i}>
      <time>{row.timestamp === null ? "—" : new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(row.timestamp)}</time>
      <span>{row.message ?? traceLabels[row.type] ?? "Actividad del agente"}</span></li>)}</ul>
      : <p className="airi-crew-muted">Aún no hay acciones de {identity.name} en el rastro de esta conversación.</p>}
    {activity.latest && <p><strong>Última tarjeta · </strong>{activity.latest.card.title}. {activity.latest.card.state === "approved" ? "Aprobada." : activity.latest.card.state === "declined" ? "Rechazada." : activity.latest.card.state === "undone" ? "Revertida." : activity.latest.card.state === "delegated" ? "Delegada." : activity.latest.card.level === "auto" ? "Información consultada." : "Propuesta preparada; aún no aplicada."}</p>}
    <p><strong>{activity.resultOrdered ? "Último resultado aprobado" : "Resultado aprobado disponible"} · </strong>{activity.result?.card.result ?? "Sin resultado aprobado registrado en este hilo."}</p>
    <p><strong>Siguiente decisión · </strong>{activity.decision}</p>
    <div className="airi-crew-dialog__actions">{card && <button type="button" onClick={() => { onClose(); onOpenCard(card.id); }}>{activity.pending ? "Revisar propuesta" : "Ver su tarjeta"}</button>}
      <Link href="/agente" onClick={onClose}>Abrir el Rastro</Link></div>
  </dialog>, document.body);
}
