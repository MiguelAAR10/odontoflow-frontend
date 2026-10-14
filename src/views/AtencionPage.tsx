"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toApiError, useMocks } from "../api";
import { useAgent } from "../agui/useAgent";
import { useDoctorDay } from "../../app/(shell)/atencion/useDoctorDay";
import { DoctorStyles } from "../../app/(shell)/atencion/DoctorStyles";
import { briefBlocks, limaDate, limaTime, nextPatient, pendingFields, scenarioDraft, type DoctorAppointment } from "../../app/(shell)/atencion/doctor";
import { acceptScenarioDraft, cancelSimulatedReview, editSimulatedNote, reviewSimulatedNote, signSimulatedNote, useSimulatedNote } from "../../app/(shell)/atencion/draft";

export function AtencionPage({ appointmentId }: { appointmentId?: string }) {
  const day = useDoctorDay();
  const row = day.data ? appointmentId ? day.data.rows.find(item => item.id === appointmentId) : nextPatient(day.data.rows, day.data.cut) : undefined;
  return <section className="airi-doctor-view" aria-label="Atención clínica"><DoctorStyles />
    {day.role !== "doctor" ? <><h1>Atención</h1><p role="note">Solo el doctor revisa y firma la evolución. Elige Doctor en «Ver como».</p></>
      : !useMocks ? <><h1>Atención</h1><div className="airi-doctor-card airi-doctor-empty"><p>La ficha clínica y la firma todavía no están disponibles en esta fuente.</p><p>No hay una atención registrada ni un borrador clínico para mostrar.</p><button className="airi-doctor-button" disabled>Revisar y firmar</button></div></>
      : day.error ? <p role="alert">{day.error} <button className="airi-doctor-button" onClick={day.retry}>Reintentar</button></p>
      : !day.data ? <p role="status">Cargando la atención…</p>
      : !row ? <><h1>Atención</h1><p>No hay una cita disponible para esta atención en tu jornada y sede.</p><Link className="airi-doctor-button" href="/jornada">Volver a Mi jornada</Link></>
      : <PatientAttention key={`${day.scope}:${row.id}`} row={row} cut={day.data.cut} scope={day.noteScope} />}
  </section>;
}

function PatientAttention({ row, cut, scope }: { row: DoctorAppointment; cut: string; scope: string }) {
  const agent = useAgent();
  const [error, setError] = useState("");
  const [reviewRequested, setReviewRequested] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const reviewRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const noteKey = `${scope}:${row.id}`;
  const note = useSimulatedNote(noteKey);
  // These official scenarios target Ana's fixture visit only. Never apply their
  // unscoped clinical output to another patient or to a real-mode appointment.
  const supported = useMocks && row.id === "c7" && row.patient === "Ana Torres";
  const parts = supported ? agent.thread.flatMap(turn => turn.role === "assistant" && turn.agent === "espejo"
    ? turn.parts.flatMap((part, index) => part.type === "part" ? [{ id: `${turn.id}:${index}`, key: part.key, props: part.props }] : []) : []) : [];
  const briefReady = parts.some(part => part.key === "doctor-brief" && typeof part.props === "object" && part.props !== null && "briefReady" in part.props && part.props.briefReady === true);
  const evolution = parts.filter(part => part.key === "doctor-evolution").at(-1);
  const draft = evolution ? scenarioDraft(evolution.props) : null;
  useEffect(() => {
    if (supported && draft && evolution) acceptScenarioDraft(noteKey, "doctor", draft, evolution.id);
  }, [noteKey, supported, draft, evolution?.id]);
  useEffect(() => {
    if (reviewRequested && note.reviewedText !== null) confirmRef.current?.focus();
  }, [reviewRequested, note.reviewedText]);
  const ask = (text: string) => {
    if (!supported || agent.working) return;
    setError("");
    const pending = agent.send(text, { role: "doctor", view: "atencion", viewing: `Atención de ${row.patient} · ${row.procedure}` });
    agent.closePanel();
    void pending.catch(caught => setError(toApiError(caught).message));
  };
  const missing = pendingFields(note.text);
  const state = note.signedAt ? "firmado" : note.reviewedText !== null ? "pendiente de revisión" : "borrador";
  const cancel = () => { cancelSimulatedReview(noteKey); setReviewRequested(false); reviewRef.current?.focus(); };
  const sign = () => { signSimulatedNote(noteKey, "doctor"); setReviewRequested(false); textareaRef.current?.focus(); };
  return <>
    <header className="airi-doctor-card airi-doctor-identity"><h1>{row.patient}</h1><span className="airi-doctor-meta">{row.procedure}</span><span className="airi-doctor-chip blue">Visita {limaDate(row.start_at)} · {limaTime(row.start_at)} · {row.sede}</span><span className="airi-doctor-chip">{row.practitioner_name}</span></header>
    <p className="airi-doctor-note">Identidad y visita siempre visibles. «No consta» nunca significa «sin alergias». Espejo prepara; la firma es tuya y deliberada.</p>
    <h2 className="airi-doctor-brief-head"><span><img src="/personajes/svg/06-espejo-flat.svg" width={26} height={26} alt="" />Brief <span className="airi-doctor-meta">{briefReady ? "Preparado por Espejo" : "Seis bloques con fuente"}</span></span>{supported ? briefReady ? <span className="airi-doctor-chip ok">Automático · solo lee</span> : <button className="airi-doctor-button" disabled={agent.working} onClick={() => ask("Prepara el brief de Ana Torres")}>Preparar brief</button> : <span className="airi-doctor-chip">Datos de la agenda</span>}</h2>
    <div className="airi-doctor-card airi-doctor-brief" aria-label="Brief del paciente">
      {briefBlocks(row, cut).map((block, index) => <article className="airi-doctor-block" data-brief-block key={block.title}><h3>{index + 1} · {block.title}</h3>{!supported || briefReady ? <><p>{block.text}</p><span className={`airi-doctor-chip ${block.missing ? "missing" : "ok"}`}>{block.status}</span><small className="airi-doctor-source">{block.source}</small></> : <><div className="airi-doctor-block-placeholder" aria-hidden="true" /><div className="airi-doctor-block-placeholder" aria-hidden="true" /><span className="airi-doctor-meta">Pendiente de preparar</span></>}</article>)}
    </div>
    {supported && agent.working ? <p role="status" className="airi-doctor-meta">{agent.run.what || "Espejo está preparando la información…"} <button className="airi-doctor-button" onClick={agent.stop}>Detener</button></p> : null}
    {(error || agent.run.status === "error") ? <p role="alert">{error || agent.run.what}</p> : null}
    <div className="airi-doctor-clinical"><section className="airi-doctor-card airi-doctor-odo" aria-labelledby="airi-doctor-odontogram"><h2 id="airi-doctor-odontogram">Odontograma</h2><div className="airi-doctor-odo-empty"><p>No consta un odontograma en esta fuente.</p><p>Revisa la historia antes de registrar hallazgos.</p></div><p className="airi-doctor-meta airi-doctor-source">Historia clínica no disponible en este corte · {limaDate(cut)}</p><p className="airi-doctor-meta">La cita de agenda permanece «{row.state}». Un borrador o una firma simulada no la cierran.</p></section>
      <section className="airi-doctor-card airi-doctor-evolution" aria-labelledby="airi-doctor-evolution-title"><h2 id="airi-doctor-evolution-title">Evolución de la visita</h2><span className={`airi-doctor-chip ${note.signedAt ? "ok" : "warning"}`}>{note.signedAt ? "Firmada en simulación" : note.text ? "Borrador · para revisar" : "Sin contenido"}</span>
        <div className="airi-doctor-steps" aria-label="Estado de la evolución">{["borrador", "pendiente de revisión", "firmado"].map(step => <span key={step} aria-current={state === step ? "step" : undefined}>{step}</span>)}</div>
        <label htmlFor="airi-doctor-evolution">Evolución de {row.patient}</label><textarea ref={textareaRef} id="airi-doctor-evolution" placeholder="Escribe o pide un borrador. Confirma los campos pendientes antes de firmar." value={note.text} readOnly={!!note.signedAt || note.reviewedText !== null} onChange={event => editSimulatedNote(noteKey, "doctor", event.target.value)} aria-describedby="airi-doctor-note-state" />
        <p id="airi-doctor-note-state" className="airi-doctor-meta" role="status">{note.signedAt ? <span className="airi-doctor-stamp">Firmado por {row.practitioner_name} · {limaDate(note.signedAt)} {limaTime(note.signedAt)} (Lima) · simulación</span> : <>{note.text ? "Borrador conservado en esta sesión · no es una atención registrada" : "Todavía no hay evolución"}{missing ? <span className="airi-doctor-warning"> · {missing} campos por confirmar</span> : null}</>}</p>
        <p className="airi-doctor-meta">Simulación: esta nota y su firma se conservan durante la navegación, sin guardar una atención en la historia clínica.</p>
        {!note.signedAt ? <>
          <div className="airi-doctor-actions">{supported ? <button className="airi-doctor-button" disabled={agent.working || !!note.text.trim() || note.reviewedText !== null} onClick={() => ask("Ayúdame con la evolución")}>Ayúdame con la evolución</button> : <span className="airi-doctor-meta">Espejo no tiene un escenario clínico para este paciente.</span>}<button ref={reviewRef} className="airi-doctor-button primary" disabled={agent.working || !note.text.trim() || missing > 0 || note.reviewedText !== null} onClick={() => { reviewSimulatedNote(noteKey, "doctor"); setReviewRequested(true); }}>Revisar y firmar</button></div>
          {note.reviewedText !== null ? <div className="airi-doctor-review" role="group" aria-label="Confirmar firma"><p>¿Firmar esta evolución como {row.practitioner_name} para {row.patient}, visita del {limaDate(row.start_at)}?</p><p>La firma se realizará en simulación.</p><div className="airi-doctor-actions"><button className="airi-doctor-button" onClick={cancel}>Volver a editar</button><button ref={confirmRef} className="airi-doctor-button primary" onClick={sign}>Firmar</button></div></div> : null}
        </> : null}
      </section></div>
    <div className="airi-doctor-actions"><Link className="airi-doctor-button" href="/jornada">Volver a Mi jornada</Link></div>
  </>;
}
