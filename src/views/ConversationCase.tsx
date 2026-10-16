"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { loadConversationContext, newIdempotencyKey, returnConversationToAgent, sendConversationReply, toApiError } from "../api";
import type { ConversationContext } from "../contracts/client";
import type { ChatConversation } from "../types";
import { Button } from "../components/Button";
import { usePersona } from "../components/PersonaContext";
import { createLatestRequest } from "../session";
import { CanonicalProposalCard } from "./CanonicalProposalCard";

const automation = { active: "Automatización activa", paused: "Automatización pausada · atiende el equipo", closed: "Conversación cerrada" };
const stateLabels: Record<string, string> = { pending: "Pendiente de decisión", approved: "Aprobada", executed: "Aplicada", confirmed: "Confirmada", cancelled: "Cancelada", completed: "Atendida", no_show: "Ausente", arrived: "Llegó", in_consultation: "En consulta", declined: "Declinada", expired: "Vencida", failed: "Con error", superseded: "Reemplazada", undone: "Revertida" };
const deliveryLabels: Record<string, string> = { pending: "En cola de envío", processing: "En proceso de envío", sent: "Enviado", delivered: "Entregado", read: "Leído", failed: "No se entregó", dead_letter: "No se entregó" };
const stamp = (iso: string) => new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

type CaseProps = { conversation: ChatConversation; reloadToken: number; onChanged: () => void };
export function ConversationCase(props: CaseProps) {
  const { version } = usePersona();
  return <CaseRead key={`${version}:${props.conversation.id}`} {...props} />;
}

function CaseRead({ conversation, reloadToken, onChanged }: CaseProps) {
  const { identity } = usePersona();
  const [context, setContext] = useState<ConversationContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const reads = useRef(createLatestRequest());
  useEffect(() => {
    const isCurrent = reads.current.begin();
    setContext(null); setLoading(true); setError("");
    void loadConversationContext(conversation.id).then(data => { if (isCurrent()) setContext(data); })
      .catch(caught => { if (isCurrent()) setError(toApiError(caught).message); })
      .finally(() => { if (isCurrent()) setLoading(false); });
    return () => reads.current.invalidate();
  }, [conversation.id, reloadToken, revision]);
  if (loading) return <p role="status">Cargando contexto del caso…</p>;
  if (error) return <p role="alert">{error} <Button compact onClick={() => setRevision(value => value + 1)}>Reintentar contexto</Button></p>;
  if (!context) return <p className="field-note">Esta conversación de demostración no incluye vínculos canónicos con pacientes, leads, propuestas o citas.</p>;
  return <>
    <dl className="patient-facts chat-facts">
      <div><dt>Origen</dt><dd>{context.origin.channel_display_name} · {context.origin.channel_provider}</dd></div>
      <div><dt>Automatización</dt><dd>{automation[context.conversation.automation]}</dd></div>
      <div><dt>Responsable</dt><dd>{context.responsible?.display_name ?? "Sin persona asignada"}</dd></div>
      <div><dt>Paciente</dt><dd>{context.patient ? <Link href={`/pacientes?patient=${context.patient.id}&conversation=${context.conversation.id}`}>{context.patient.full_name} · #{context.patient.id}</Link> : "Sin paciente vinculado"}</dd></div>
      <div><dt>Lead</dt><dd>{context.lead ? `${context.lead.full_name} · #${context.lead.id}` : "Sin lead vinculado"}</dd></div>
      <div><dt>Sede del caso</dt><dd>{context.location?.name ?? (context.location_state === "ambiguous" ? "El caso incluye varias sedes" : "Sin sede confirmada")}</dd></div>
    </dl>
    {context.lead && identity?.principalType === "human" && <Button compact onClick={() => window.dispatchEvent(new CustomEvent("open-new-appointment", { detail: {
      conversationId: context.conversation.id, contactIdentityId: context.contact.contact_identity_id,
      displayName: context.lead!.full_name, leadId: context.lead!.id, ...(context.patient ? { patientId: context.patient.id } : {}),
    } }))}>Crear cita para este lead</Button>}
    <h3>Propuestas del caso</h3>
    {context.proposals.length === 0 && <p className="field-note">No hay propuestas visibles con tus permisos.</p>}
    {context.proposals.map(proposal => <div key={`${proposal.source}:${proposal.id}`}>
      <strong>{proposal.summary}</strong><br />{stateLabels[proposal.status] ?? proposal.status} · #{proposal.id}<br />
      {proposal.source === "agent_proposal" && (proposal.status === "undone" || !identity?.permissions.includes("proposals.read"))
        ? <CaseCard proposalId={proposal.id} />
        : proposal.source === "appointment_proposal" && !identity?.permissions.includes("proposals.read")
        ? <span className="field-note">Esta propuesta de cita es visible en el caso, pero Bandeja requiere acceso global. No puedes confirmarla desde esta vista.</span>
        : (proposal.source === "agent_proposal" || proposal.source === "appointment_proposal")
        ? <Link href={`/aprobaciones?proposal=${encodeURIComponent(`${proposal.source}:${proposal.id}`)}&status=${proposal.status === "confirmed" ? "executed" : encodeURIComponent(proposal.status)}&conversation=${context.conversation.id}`}>Abrir esta propuesta en Bandeja</Link>
        : <span className="field-note">La decisión de este tipo de propuesta no está disponible en esta vista.</span>}
    </div>)}
    {context.proposals.length === 20 && <p className="field-note">Esta fuente muestra hasta 20 propuestas.</p>}
    <h3>Citas vinculadas</h3>
    {context.appointments.length === 0 && <p className="field-note">No hay citas visibles con tus permisos.</p>}
    {context.appointments.map(appointment => <p key={appointment.id}><Link href={`/agenda?appointment=${appointment.id}&conversation=${context.conversation.id}`}>{appointment.service_name} · {stamp(appointment.start_utc)}</Link><br />{appointment.location_name} · {appointment.practitioner_name} · {stateLabels[appointment.state] ?? appointment.state}<br /><small>{appointment.relations.includes("conversation_proposal") ? "Vinculada a una propuesta de esta conversación" : appointment.relations.includes("linked_patient") ? "Del paciente vinculado" : appointment.relations.includes("linked_lead") ? "Del lead vinculado" : "Relación informada por el backend"}</small></p>)}
    {context.appointments.length === 20 && <p className="field-note">Esta fuente muestra hasta 20 citas.</p>}
    <ConversationActions key={context.conversation.id} context={context} onChanged={onChanged} />
  </>;
}

function CaseCard({ proposalId }: { proposalId: number }) {
  const [open, setOpen] = useState(false);
  return open ? <CanonicalProposalCard proposalId={proposalId} /> : <Button compact onClick={() => setOpen(true)}>Ver tarjeta de esta propuesta</Button>;
}

function ConversationActions({ context, onChanged }: { context: ConversationContext; onChanged: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const intent = useRef<{ operation: "reply" | "resume"; text: string; key: string } | null>(null);
  const writes = useRef(createLatestRequest());
  useEffect(() => () => writes.current.invalidate(), []);
  const act = async (operation: "reply" | "resume") => {
    if (busy || !context.actions.includes(operation)) return;
    const body = operation === "reply" ? text.trim() : "";
    if (operation === "reply" && !body) return;
    if (intent.current?.operation !== operation || intent.current.text !== body) intent.current = { operation, text: body, key: newIdempotencyKey() };
    const isCurrent = writes.current.begin();
    setBusy(true); setError(""); setNotice("");
    try {
      if (operation === "reply") {
        const receipt = await sendConversationReply(context.conversation.id, { text: body }, intent.current.key);
        if (!isCurrent()) return;
        setText(""); setNotice(`Respuesta registrada · ${deliveryLabels[receipt.status] ?? "Estado de entrega no disponible"}. Consulta su entrega en el historial.`);
      } else {
        await returnConversationToAgent(context.conversation.id, intent.current.key);
        if (!isCurrent()) return;
        setNotice("Conversación devuelta a la automatización.");
      }
      intent.current = null;
      // Keep the receipt visible until the person refreshes; no optimistic delivery.
    } catch (caught) { if (isCurrent()) setError(toApiError(caught).message); }
    finally { if (isCurrent()) setBusy(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void act("reply"); };
  return <div className="chat-scope">
    {notice ? <p role="status">{notice} <Button compact onClick={onChanged}>Actualizar caso e historial</Button></p> : <>
      {context.actions.includes("reply") && <form onSubmit={submit}><label className="field"><span>Respuesta al contacto</span><textarea required maxLength={4096} value={text} disabled={busy} onChange={event => setText(event.target.value)} /></label><Button type="submit" compact disabled={busy || !text.trim()}>{busy ? "Registrando…" : "Enviar respuesta"}</Button></form>}
      {context.actions.includes("resume") && <Button compact disabled={busy} onClick={() => void act("resume")}>Devolver al agente</Button>}
      {context.actions.includes("claim") && <p>Primero toma la conversación para poder responder.</p>}
    </>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
