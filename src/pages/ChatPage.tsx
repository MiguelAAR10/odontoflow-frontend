import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Bot, CalendarCheck, Check, Clock3, MessageCircle, MoreVertical, Paperclip, Search, Send, Smile, UserRoundCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createAppointment, getConversations, getPatients, sendMessage } from "../api";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import type { Conversation, Patient } from "../types";

const filters = ["Todos", "Leads", "Con cita", "Sin cita", "Pacientes"];

export function ChatPage() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedId, setSelectedId] = useState("conv-ana");
  const [filter, setFilter] = useState("Todos");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [human, setHuman] = useState(false);
  const [appointmentOpen, setAppointmentOpen] = useState(false);

  const load = () => { void Promise.all([getConversations(), getPatients()]).then(([conversationData, patientData]) => { setConversations(conversationData); setPatients(patientData); }); };
  useEffect(load, []);
  const selected = conversations.find((item) => item.id === selectedId) ?? conversations[0];
  const patient = patients.find((item) => item.id === selected?.patientId);
  const visible = useMemo(() => conversations.filter((item) =>
    (!query.trim() || `${item.name} ${item.preview}`.toLowerCase().includes(query.toLowerCase())) &&
    (filter === "Todos" || filter === "Pacientes" && item.tag === "Paciente" || filter === "Leads" && item.tag === "Lead" || filter === "Con cita" && item.tag === "Paciente" || filter === "Sin cita" && item.tag === "Lead")
  ), [conversations, query, filter]);

  const submitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = message.trim();
    if (!text || !selected) return;
    await sendMessage(selected.id, text);
    setMessage(""); load();
  };

  const createSelectedAppointment = async () => {
    if (!selected) return;
    await createAppointment({ patient: selected.name, treatment: "Evaluación dental", doctor: "Dra. Valeria Ruiz", branch: patient?.branch ?? "Lince", date: "2026-08-17", time: "10:30" });
    setAppointmentOpen(false);
  };

  return (
    <section className="page chat-page">
      <div className="page-heading page-heading--with-actions"><div><h1>Centro de conversaciones</h1><p>WhatsApp integrado con pacientes y leads</p></div><span className="whatsapp-status"><i />WhatsApp conectado</span></div>
      <div className="chat-workspace">
        <aside className="conversation-panel">
          <h2>Conversaciones</h2>
          <label className="search-control search-control--full"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar conversación" aria-label="Buscar conversación" /></label>
          <div className="chat-filters">{filters.map((label) => <button key={label} className={filter === label ? "chat-filter--active" : ""} onClick={() => setFilter(label)}>{label}</button>)}</div>
          <div className="conversation-list">
            {visible.map((conversation) => <button key={conversation.id} className={`conversation-item ${conversation.id === selected?.id ? "conversation-item--active" : ""}`} onClick={() => { setSelectedId(conversation.id); setHuman(false); }}>
              <span className={`avatar avatar--${conversation.tone}`}>{conversation.initials}<i /></span>
              <span className="conversation-item__copy"><strong>{conversation.name}</strong><small>{conversation.preview}</small><Badge tone={conversation.tag === "Paciente" ? "green" : "blue"}>{conversation.tag}</Badge></span>
              <span className="conversation-item__meta"><time>{conversation.time}</time>{conversation.unread > 0 && <b>{conversation.unread}</b>}</span>
            </button>)}
          </div>
        </aside>

        {selected ? <section className="message-panel">
          <header className="message-header"><span className={`avatar avatar--${selected.tone}`}>{selected.initials}<i /></span><div><h2>{selected.name}</h2><span>{patient?.phone ?? "+51 900 000 000"} <Badge tone={selected.tag === "Paciente" ? "green" : "blue"}>{selected.tag}</Badge></span></div><button className="icon-button"><Search /></button><button className="icon-button"><MoreVertical /></button></header>
          <div className="agent-strip"><span>{human ? <UserRoundCheck /> : <Bot />} {human ? "Atención humana activa" : "Agente automático activo"}</span><Button compact onClick={() => setHuman((value) => !value)}>{human ? "Devolver al agente" : "Transferir a humano"}</Button></div>
          <div className="message-history">
            {selected.messages.map((item) => <div key={item.id} className={`message-bubble message-bubble--${item.from}`}><p>{item.text}</p><time>{item.time}</time>{item.from !== "patient" && <small>{item.from === "agent" ? "Agente" : "Leonardo"}</small>}</div>)}
            {selected.patientId === "ana" && <div className="appointment-confirmation"><Check /><div><strong>Cita confirmada</strong><span>15 agosto 2026 · 10:30 a. m.</span><span>Sede Lince</span><Button compact onClick={() => navigate("/agenda")}>Ver en agenda</Button></div><time>10:42</time></div>}
          </div>
          <form className="message-composer" onSubmit={submitMessage}><button type="button" aria-label="Adjuntar archivo"><Paperclip /></button><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Escribe un mensaje" aria-label="Mensaje" /><button type="button" aria-label="Insertar emoji"><Smile /></button><button className="send-button" type="submit" disabled={!message.trim()} aria-label="Enviar mensaje"><Send /></button></form>
        </section> : <section className="message-panel empty-state">Selecciona una conversación</section>}

        <aside className="patient-panel">
          <h2>Datos del paciente</h2>
          {patient && <>
            <div className="patient-panel__hero"><span className={`avatar avatar--${patient.tone}`}>{patient.initials}</span><div><h3>{patient.name}</h3><Badge tone="green">{patient.status === "Activo" ? "Paciente activo" : patient.status}</Badge></div></div>
            <div className="patient-facts"><div><span>DNI</span><strong>{patient.dni}</strong></div><div><span>Teléfono</span><strong>{patient.phone}</strong></div><div><span>Origen</span><strong>{patient.origin}</strong></div><div><span>Interés</span><strong>{patient.interest}</strong></div><div><span>Sede preferida</span><strong>{patient.branch}</strong></div></div>
            <h2 className="patient-panel__next-title">Próxima cita</h2>
            <div className="next-appointment"><span><CalendarCheck /></span><div><strong>{patient.nextAppointment}</strong><small>{patient.treatment}</small><Badge tone="green">Confirmada</Badge></div></div>
            <div className="patient-panel__actions"><Button onClick={() => navigate(`/pacientes?patient=${patient.id}`)}>Ver ficha</Button><Button variant="primary" onClick={() => setAppointmentOpen(true)}>Crear cita</Button></div>
          </>}
        </aside>
      </div>
      <Modal title="Crear cita desde la conversación" open={appointmentOpen} onClose={() => setAppointmentOpen(false)} size="small">
        <div className="confirmation-message"><CalendarCheck /><h3>{selected?.name}</h3><p>Se reservará una evaluación el 17 de agosto a las 10:30 a. m. en {patient?.branch ?? "Lince"}.</p><div className="form-actions"><Button onClick={() => setAppointmentOpen(false)}>Cancelar</Button><Button variant="primary" onClick={() => void createSelectedAppointment()}>Crear cita</Button></div></div>
      </Modal>
    </section>
  );
}
