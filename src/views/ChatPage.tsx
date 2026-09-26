"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Bot, CalendarCheck, ChartNoAxesColumnIncreasing, Check, ChevronDown, Facebook, IdCard, Instagram, MapPin, MessageCircle, MoreVertical, Paperclip, Phone, Search, Send, Smile, ThumbsUp, UserRound, UserRoundCheck, UsersRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { getConversations, getPatients, loadAgenda, sendMessage, useMocks } from "../api";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import type { Appointment, Conversation, Patient } from "../types";

const filters = ["Todos", "Leads", "Leads (con cita)", "Leads (sin cita)", "Pacientes"];
const moreFilters = ["Pac. con cita hoy", "Pac. con cita mañana", "No confirman cita de mañana", "Chats sin responder", "Chats para ayuda humana", "Chats archivados"];

function appointmentIsOn(appointment: Appointment, offset: number) {
  const target = new Date();
  target.setDate(target.getDate() + offset);
  if (appointment.startUtc) {
    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: appointment.timeZone ?? "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" });
    return formatter.format(new Date(appointment.startUtc)) === formatter.format(target);
  }
  // Design fixtures use the same Monday–Saturday grid as the demo agenda.
  return useMocks && target.getDay() !== 0 && appointment.day === target.getDay() - 1;
}

export function ChatPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [selectedId, setSelectedId] = useState("conv-ana");
  const [filter, setFilter] = useState("Todos");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [transferOpen, setTransferOpen] = useState(false);
  const [secretary, setSecretary] = useState("");
  const [notice, setNotice] = useState("");

  const load = () => { void Promise.all([getConversations(), getPatients(), loadAgenda()]).then(([conversationData, patientData, appointmentData]) => { setConversations(conversationData); setPatients(patientData); setAppointments(appointmentData); }).catch(() => setNotice("No se pudieron cargar las conversaciones y sus citas.")); };
  useEffect(load, []);
  useEffect(() => {
    if (!moreOpen) return;
    const closeOutside = (event: PointerEvent) => { if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false); };
    const closeWithEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setMoreOpen(false); moreButtonRef.current?.focus(); } };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeWithEscape); };
  }, [moreOpen]);
  useEffect(() => {
    const refresh = () => load();
    window.addEventListener("appointment-created", refresh);
    return () => window.removeEventListener("appointment-created", refresh);
  }, []);
  const selected = conversations.find((item) => item.id === selectedId) ?? conversations[0];
  const patient = patients.find((item) => item.id === selected?.patientId);
  const owner = selected ? assignments[selected.id] : undefined;
  const human = Boolean(owner);
  const visible = useMemo(() => conversations.filter((item) => {
    const contact = patients.find((entry) => entry.id === item.patientId);
    if (query.trim() && ![item.name, contact?.dni, contact?.phone].filter(Boolean).join(" ").toLowerCase().includes(query.trim().toLowerCase())) return false;
    const patientAppointments = appointments.filter((entry) => entry.patient === item.name && entry.status !== "Cancelada");
    switch (filter) {
      case "Leads": return item.tag === "Lead";
      case "Leads (con cita)": return item.tag === "Lead" && patientAppointments.length > 0;
      case "Leads (sin cita)": return item.tag === "Lead" && patientAppointments.length === 0;
      case "Pacientes": return item.tag === "Paciente";
      case "Pac. con cita hoy": return patientAppointments.some((entry) => appointmentIsOn(entry, 0));
      case "Pac. con cita mañana": return patientAppointments.some((entry) => appointmentIsOn(entry, 1));
      case "No confirman cita de mañana": return patientAppointments.some((entry) => appointmentIsOn(entry, 1) && (entry.status === "Por confirmar" || entry.status === "No respondió"));
      case "Chats sin responder": return item.messages.at(-1)?.from === "patient";
      case "Chats para ayuda humana": return Boolean(assignments[item.id]);
      default: return true;
    }
  }), [conversations, patients, appointments, assignments, query, filter]);

  const submitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = message.trim();
    if (!text || !selected) return;
    await sendMessage(selected.id, text);
    setMessage(""); load();
  };

  const transferConversation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !secretary || !useMocks) return;
    setAssignments((current) => ({ ...current, [selected.id]: secretary }));
    setNotice(`Conversación asignada a ${secretary} en esta demostración.`);
    setTransferOpen(false);
  };

  return (
    <section className="page chat-page">
      <div className="page-heading page-heading--with-actions"><div><h1>Centro de conversaciones</h1><p>WhatsApp integrado con pacientes y leads</p></div><span className="whatsapp-status"><i />WhatsApp conectado</span></div>
      <div className="chat-workspace">
        <aside className="conversation-panel">
          <h2>Conversaciones</h2>
          <label className="search-control search-control--full chat-patient-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar paciente" aria-label="Buscar paciente en conversaciones" /><Search size={18} aria-hidden="true" /></label>
          <div className="chat-filter-toolbar">
            <div className="chat-filters">{filters.map((label) => <button type="button" key={label} aria-pressed={filter === label} className={filter === label ? "chat-filter--active" : ""} onClick={() => setFilter(label)}>{label}</button>)}</div>
            <div className="chat-more" ref={moreRef}>
              <button ref={moreButtonRef} className={`chat-more__trigger ${moreFilters.includes(filter) ? "chat-more__trigger--active" : ""}`} type="button" aria-expanded={moreOpen} aria-controls="chat-more-filters" onClick={() => setMoreOpen((value) => !value)}>Más<ChevronDown size={14} aria-hidden="true" /></button>
              {moreOpen && <div className="chat-more__dropdown" id="chat-more-filters" aria-label="Más filtros de conversaciones">{moreFilters.map((label) => <button type="button" key={label} disabled={label === "Chats archivados"} title={label === "Chats archivados" ? "Disponible cuando se conecte el archivo de conversaciones" : undefined} aria-pressed={filter === label} onClick={() => { setFilter(label); setMoreOpen(false); moreButtonRef.current?.focus(); }}>{label}{filter === label && <Check size={14} aria-hidden="true" />}</button>)}<p>El archivo de conversaciones aún no está conectado.</p></div>}
            </div>
          </div>
          {moreFilters.includes(filter) && <div className="chat-active-filter"><span>{filter}</span><button type="button" aria-label="Quitar filtro adicional" onClick={() => setFilter("Todos")}><X size={14} /></button></div>}
          <div className="conversation-list">
            {visible.length === 0 && <p className="chat-filter-empty">No hay conversaciones que coincidan con este filtro.</p>}
            {visible.map((conversation) => <button key={conversation.id} className={`conversation-item ${conversation.id === selected?.id ? "conversation-item--active" : ""}`} onClick={() => { setSelectedId(conversation.id); setNotice(""); }}>
              <span className={`avatar avatar--${conversation.tone}`}>{conversation.initials}<i /></span>
              <span className="conversation-item__copy"><strong>{conversation.name}</strong><small>{conversation.preview}</small><Badge tone={conversation.tag === "Paciente" ? "green" : "blue"}>{conversation.tag}</Badge></span>
              <span className="conversation-item__meta"><time>{conversation.time}</time>{conversation.unread > 0 && <b>{conversation.unread}</b>}</span>
            </button>)}
          </div>
        </aside>

        {selected ? <section className="message-panel">
          <header className="message-header"><span className={`avatar avatar--${selected.tone}`}>{selected.initials}<i /></span><div><h2>{selected.name}</h2><span>{patient?.phone ?? "Teléfono no disponible"} <Badge tone={selected.tag === "Paciente" ? "green" : "blue"}>{selected.tag}</Badge></span></div><button className="icon-button" type="button" aria-label="Transferir conversación" title="Transferir a otra secretaria" onClick={() => { setSecretary(""); setTransferOpen(true); }}><MoreVertical /></button></header>
          <div className="agent-strip"><span>{human ? <UserRoundCheck /> : <Bot />} {human ? `Asignada a ${owner}` : "Agente automático activo"}</span>{human ? <Button compact onClick={() => { setAssignments((current) => { const next = { ...current }; delete next[selected.id]; return next; }); setNotice(""); }}>Devolver al agente</Button> : <Button compact onClick={() => { setSecretary(""); setTransferOpen(true); }}>Transferir a humano</Button>}</div>
          <div className="message-history">
            {notice && <p className="chat-assignment-notice" role="status">{notice}</p>}
            {selected.messages.map((item) => <div key={item.id} className={`message-bubble message-bubble--${item.from}`}><p>{item.text}</p><time>{item.time}</time>{item.from !== "patient" && <small>{item.from === "agent" ? "Agente" : "Equipo clínico"}</small>}</div>)}
            {selected.patientId === "ana" && <div className="appointment-confirmation"><Check /><div><strong>Cita confirmada</strong><span>15 agosto 2026 · 10:30 a. m.</span><span>Sede Lince</span><Button compact onClick={() => router.push("/agenda")}>Ver en agenda</Button></div><time>10:42</time></div>}
          </div>
          <form className="message-composer" onSubmit={submitMessage}><button type="button" aria-label="Adjuntar archivo"><Paperclip /></button><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Escribe un mensaje" aria-label="Mensaje" /><button type="button" aria-label="Insertar emoji"><Smile /></button><button className="send-button" type="submit" disabled={!message.trim()} aria-label="Enviar mensaje"><Send /></button></form>
        </section> : <section className="message-panel empty-state">Selecciona una conversación</section>}

        <aside className="patient-panel">
          <h2>Datos del paciente</h2>
          {patient && <>
            <div className="patient-panel__hero"><span className={`avatar avatar--${patient.tone}`}>{patient.initials}</span><div><h3>{patient.name}</h3><Badge tone="green">{patient.status === "Activo" ? "Paciente activo" : patient.status}</Badge></div></div>
            <div className="patient-facts">
              <div><span><IdCard size={16} aria-hidden="true" />DNI</span><strong>{patient.dni}</strong></div>
              <div><span><Phone size={16} aria-hidden="true" />Teléfono</span><strong>{patient.phone}</strong></div>
              <div><span><Bot size={16} aria-hidden="true" />Origen</span><strong>{patient.origin === "Instagram" ? <Instagram className="fact-icon--instagram" size={16} aria-hidden="true" /> : patient.origin === "Facebook" ? <Facebook size={16} aria-hidden="true" /> : <MessageCircle size={16} aria-hidden="true" />}{patient.origin}</strong></div>
              <div><span><ThumbsUp size={16} aria-hidden="true" />Interés</span><strong><ChartNoAxesColumnIncreasing className="fact-icon--interest" size={16} aria-hidden="true" />{patient.interest}</strong></div>
              <div><span><MapPin size={16} aria-hidden="true" />Sede preferida</span><strong><MapPin className="fact-icon--location" size={16} aria-hidden="true" />{patient.branch}</strong></div>
            </div>
            <div className="patient-panel__actions"><Button onClick={() => router.push(`/pacientes?patient=${patient.id}`)}><UserRound size={16} />Ver ficha</Button><Button variant="primary" onClick={() => window.dispatchEvent(new CustomEvent("open-new-appointment", { detail: { patient: patient.name } }))}><CalendarCheck size={16} />Crear cita</Button></div>
            <h2 className="patient-panel__next-title">Próxima cita</h2>
            <div className="next-appointment"><span><CalendarCheck /></span><div><strong>{patient.nextAppointment}</strong><small>{patient.treatment}</small><Badge tone="green">Confirmada</Badge></div></div>
          </>}
        </aside>
      </div>
      <Modal title="Transferir conversación" open={transferOpen} onClose={() => setTransferOpen(false)} size="small">
        <form className="transfer-form" onSubmit={transferConversation}>
          <p><UsersRound size={20} aria-hidden="true" />Asigna la conversación de <strong>{selected?.name}</strong> a otra secretaria.</p>
          {useMocks ? <><p className="transfer-demo-note">Demostración: las secretarias son de ejemplo y la asignación dura mientras esta pantalla esté abierta.</p><label className="field"><span>Secretaria destinataria</span><select required value={secretary} onChange={(event) => setSecretary(event.target.value)} autoFocus><option value="">Seleccionar secretaria</option>{["María López", "Carla Mendoza", "Sofía Torres"].filter((name) => name !== owner).map((name) => <option key={name}>{name}</option>)}</select></label></> : <p>La transferencia estará disponible cuando se conecte la gestión de usuarios y conversaciones.</p>}
          <div className="form-actions"><Button type="button" onClick={() => setTransferOpen(false)}>Cancelar</Button><Button type="submit" variant="primary" disabled={!useMocks || !secretary}>Transferir conversación</Button></div>
        </form>
      </Modal>
    </section>
  );
}
