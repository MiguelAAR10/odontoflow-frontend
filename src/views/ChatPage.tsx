"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CalendarCheck, ChevronDown, MessageCircle, Plus, RotateCcw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { DEMO_NOW, DEMO_TIME_ZONE, demoDateKey, demoWeekWindow, toApiError, useMocks, useOdontoRepository, type DemoAppointment, type DemoLead, type DemoPatient, type OdontoSnapshot } from "../api";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { hasCapability } from "../roles";
import styles from "./ChatPage.module.css";

type ChatContact = {
  id: string;
  entityId: string;
  kind: "patient" | "lead";
  name: string;
  initials: string;
  phone: string;
  locationId: string | null;
  locationName: string;
  detail: string;
  source?: string;
  status?: string;
  patient: DemoPatient | null;
  lead: DemoLead | null;
  nextAppointment: DemoAppointment | null;
};

type DemoChatMessage = {
  id: string;
  contactId: string;
  sender: "contact" | "team";
  text: string;
  time: string;
};

type ChatServiceChoice = { id: string; name: string };

const filters = ["Todos", "Leads", "Con cita", "Sin cita", "Pacientes"] as const;

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
}

function formatAppointment(instant: string) {
  return new Intl.DateTimeFormat("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: DEMO_TIME_ZONE,
  }).format(new Date(instant));
}

function contactsFor(snapshot: OdontoSnapshot): ChatContact[] {
  const permittedLocationIds = snapshot.actor.role === "owner"
    ? new Set(snapshot.locations.map((location) => location.id))
    : new Set(snapshot.actor.locationId ? [snapshot.actor.locationId] : []);

  const nextFor = (kind: "patient" | "lead", id: string) => snapshot.appointments
    .filter((appointment) => appointment.state === "confirmed"
      && appointment.startAt >= DEMO_NOW
      && (kind === "patient" ? appointment.patientId === id : appointment.leadId === id))
    .sort((left, right) => left.startAt.localeCompare(right.startAt))[0] ?? null;

  const patients: ChatContact[] = snapshot.patients
    .filter((patient) => permittedLocationIds.has(patient.locationId))
    .map((patient) => {
      const nextAppointment = nextFor("patient", patient.id);
      return {
        id: `patient:${patient.id}`,
        entityId: patient.id,
        kind: "patient",
        name: patient.name,
        initials: initials(patient.name),
        phone: patient.phone,
        locationId: patient.locationId,
        locationName: snapshot.locations.find((location) => location.id === patient.locationId)?.name ?? "Sede",
        detail: patient.treatment,
        patient,
        lead: null,
        nextAppointment,
      };
    });

  const leads: ChatContact[] = snapshot.leads
    .filter((lead) => !lead.patientId && (lead.locationId ? permittedLocationIds.has(lead.locationId) : snapshot.actor.role === "owner"))
    .map((lead) => {
      const nextAppointment = nextFor("lead", lead.id);
      return {
        id: `lead:${lead.id}`,
        entityId: lead.id,
        kind: "lead",
        name: lead.name,
        initials: initials(lead.name),
        phone: lead.phone,
        locationId: lead.locationId,
        locationName: snapshot.locations.find((location) => location.id === lead.locationId)?.name ?? "Sede sin asignar",
        detail: lead.need,
        source: lead.source,
        status: lead.status,
        patient: null,
        lead,
        nextAppointment,
      };
    });

  return [...patients, ...leads];
}

function serviceChoices(snapshot: OdontoSnapshot) {
  const services = new Map<string, string>();
  snapshot.appointments.forEach((appointment) => services.set(appointment.serviceId, appointment.serviceName));
  return Array.from(services, ([id, name]) => ({ id, name }));
}

function normalizeServiceName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("es-PE");
}

function serviceForContact(contact: ChatContact | null, services: ChatServiceChoice[]) {
  if (!contact) return null;
  const normalizedNeed = normalizeServiceName(contact.detail);
  const alias = normalizedNeed === "evaluacion general" ? "evaluacion" : normalizedNeed;
  return services.find((service) => normalizeServiceName(service.name) === alias) ?? null;
}

function initialDemoConversation(contact: ChatContact): DemoChatMessage[] {
  const topic = contact.detail.trim().toLocaleLowerCase("es-PE");
  const contactId = contact.id;
  const location = contact.locationName;
  return [
    { id: `${contactId}:demo:1`, contactId, sender: "contact", text: `Hola, quisiera conversar sobre ${topic}.`, time: "09:12" },
    { id: `${contactId}:demo:2`, contactId, sender: "team", text: `Claro, podemos revisar opciones en ${location}.`, time: "09:14" },
    { id: `${contactId}:demo:3`, contactId, sender: "contact", text: "Perfecto, gracias.", time: "09:16" },
  ];
}

function defaultDate() {
  return demoDateKey(DEMO_NOW);
}

function maxBookingDate() {
  return new Date(new Date(demoWeekWindow().to).getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function unavailablePage() {
  return <section className="page chat-page">
    <div className="page-heading"><div><h1>Conversaciones</h1><p>Conversaciones no disponibles para esta conexión.</p></div></div>
    <p className={styles.disclosure} role="note">Los mensajes de demostración son locales: no se envían por Telegram ni WhatsApp. El modo API no muestra ni envía conversaciones.</p>
    <section className="chat-unavailable" role="status">
      <MessageCircle size={24} aria-hidden="true" />
      <h2>Chat no disponible en modo API</h2>
      <p>El backend conectado no ofrece un endpoint real de conversaciones o mensajes. No se cargan datos demo ni se simulan envíos.</p>
    </section>
  </section>;
}

export function ChatPage() {
  const router = useRouter();
  const { snapshot, dispatch } = useOdontoRepository();
  const contacts = useMemo(() => contactsFor(snapshot), [snapshot]);
  const services = useMemo(() => serviceChoices(snapshot), [snapshot]);
  const [selectedId, setSelectedId] = useState("patient:patient-ana");
  const [filter, setFilter] = useState<(typeof filters)[number]>("Todos");
  const [query, setQuery] = useState("");
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [appointmentServiceId, setAppointmentServiceId] = useState("");
  const [appointmentLocationId, setAppointmentLocationId] = useState("");
  const [appointmentPractitionerId, setAppointmentPractitionerId] = useState("");
  const [appointmentDate, setAppointmentDate] = useState(defaultDate);
  const [appointmentTime, setAppointmentTime] = useState("15:30");
  const [appointmentBusy, setAppointmentBusy] = useState(false);
  const [appointmentError, setAppointmentError] = useState("");
  const [createdAppointmentId, setCreatedAppointmentId] = useState("");
  const [notice, setNotice] = useState("");
  const [composerText, setComposerText] = useState("");
  const [demoThreads, setDemoThreads] = useState<Record<string, DemoChatMessage[]>>({});
  const localMessageSequence = useRef(0);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [mobileContactsOpen, setMobileContactsOpen] = useState(false);
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 850px)");
    const syncLayout = () => {
      setIsMobileLayout(media.matches);
      if (!media.matches) {
        setMobileContactsOpen(false);
        setMobileProfileOpen(false);
      }
    };
    syncLayout();
    media.addEventListener("change", syncLayout);
    return () => media.removeEventListener("change", syncLayout);
  }, []);

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es-PE");
    return contacts.filter((contact) => {
      const matchesQuery = !normalizedQuery || `${contact.name} ${contact.detail} ${contact.phone}`.toLocaleLowerCase("es-PE").includes(normalizedQuery);
      const matchesFilter = filter === "Todos"
        || (filter === "Pacientes" && contact.kind === "patient")
        || (filter === "Leads" && contact.kind === "lead")
        || (filter === "Con cita" && Boolean(contact.nextAppointment))
        || (filter === "Sin cita" && !contact.nextAppointment);
      return matchesQuery && matchesFilter;
    });
  }, [contacts, filter, query]);

  const selected = visible.find((contact) => contact.id === selectedId) ?? visible[0] ?? null;
  const canCreateAppointment = useMocks && hasCapability(snapshot.actor.role, "appointments.create");
  const requestedService = serviceForContact(selected, services);
  const appointmentServices = requestedService ? [requestedService] : services;
  const actorAppointmentLocations = snapshot.locations.filter((location) => snapshot.actor.role === "owner" || location.id === snapshot.actor.locationId);
  const hasServiceAtLocation = (serviceId: string, locationId: string) => snapshot.appointments.some((appointment) => appointment.serviceId === serviceId && appointment.locationId === locationId);
  const appointmentLocations = actorAppointmentLocations.filter((location) => appointmentServices.some((service) => hasServiceAtLocation(service.id, location.id)));
  const appointmentServicesAtLocation = appointmentServices.filter((service) => hasServiceAtLocation(service.id, appointmentLocationId));
  const appointmentPractitioners = snapshot.practitioners.filter((practitioner) => snapshot.appointments.some((appointment) =>
    appointment.serviceId === appointmentServiceId && appointment.locationId === appointmentLocationId && appointment.practitionerId === practitioner.id,
  ));
  const selectedMessages = selected ? demoThreads[selected.id] ?? initialDemoConversation(selected) : [];

  const openAppointment = () => {
    if (!selected || !canCreateAppointment) return;
    const preferredServiceId = requestedService?.id ?? selected.nextAppointment?.serviceId ?? "";
    const matchingLocation = appointmentLocations.find((location) => location.id === selected.locationId && appointmentServices.some((service) => service.id === preferredServiceId && hasServiceAtLocation(service.id, location.id)))
      ?? appointmentLocations.find((location) => appointmentServices.some((service) => service.id === preferredServiceId && hasServiceAtLocation(service.id, location.id)))
      ?? appointmentLocations.find((location) => appointmentServices.some((service) => hasServiceAtLocation(service.id, location.id)));
    const locationId = matchingLocation?.id ?? "";
    const servicesAtLocation = appointmentServices.filter((service) => hasServiceAtLocation(service.id, locationId));
    const service = servicesAtLocation.find((item) => item.id === preferredServiceId) ?? servicesAtLocation[0];
    const practitionersForPair = service
      ? snapshot.practitioners.filter((practitioner) => snapshot.appointments.some((appointment) => appointment.serviceId === service.id && appointment.locationId === locationId && appointment.practitionerId === practitioner.id))
      : [];
    const practitionerId = selected.patient?.practitionerId && practitionersForPair.some((practitioner) => practitioner.id === selected.patient?.practitionerId)
      ? selected.patient.practitionerId
      : practitionersForPair[0]?.id ?? "";
    setAppointmentServiceId(service?.id ?? "");
    setAppointmentLocationId(locationId);
    setAppointmentPractitionerId(practitionerId);
    setAppointmentDate(defaultDate());
    setAppointmentTime("15:30");
    setAppointmentError("");
    setAppointmentOpen(true);
  };

  const sendDemoMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = composerText.trim();
    if (!selected || !text) return;
    const message: DemoChatMessage = {
      id: `${selected.id}:local:${++localMessageSequence.current}`,
      contactId: selected.id,
      sender: "team",
      text,
      time: "Ahora",
    };
    setDemoThreads((current) => ({
      ...current,
      [selected.id]: [...(current[selected.id] ?? initialDemoConversation(selected)), message],
    }));
    setComposerText("");
    setNotice("");
  };

  const resetDemoConversation = () => {
    if (!selected) return;
    setDemoThreads((current) => {
      const next = { ...current };
      delete next[selected.id];
      return next;
    });
    setComposerText("");
    setNotice("");
  };

  const submitAppointment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !canCreateAppointment) return;
    const service = appointmentServicesAtLocation.find((item) => item.id === appointmentServiceId);
    const location = appointmentLocations.find((item) => item.id === appointmentLocationId);
    const practitioner = appointmentPractitioners.find((item) => item.id === appointmentPractitionerId);
    if (!service || !location || !practitioner || !appointmentDate || !appointmentTime) {
      setAppointmentError("Completa los datos con las opciones disponibles en el escenario.");
      return;
    }

    const startDate = new Date(`${appointmentDate}T${appointmentTime}:00-05:00`);
    if (!Number.isFinite(startDate.getTime()) || startDate.getTime() < new Date(DEMO_NOW).getTime()) {
      setAppointmentError("Elige una hora futura del escenario demo.");
      return;
    }
    const startAt = startDate.toISOString();
    const endAt = new Date(startDate.getTime() + 60 * 60_000).toISOString();
    const conflict = snapshot.appointments.some((appointment) => appointment.state === "confirmed"
      && appointment.locationId === location.id
      && appointment.practitionerId === practitioner.id
      && startDate.getTime() < new Date(appointment.endAt).getTime()
      && new Date(endAt).getTime() > new Date(appointment.startAt).getTime());
    if (conflict) {
      setAppointmentError("Ese profesional ya tiene una cita en ese horario. Elige otra hora.");
      return;
    }

    setAppointmentBusy(true);
    setAppointmentError("");
    try {
      const result = await dispatch({
        type: "createAppointment",
        ...(selected.patient ? { patientId: selected.entityId } : { leadId: selected.entityId }),
        serviceId: service.id,
        serviceName: service.name,
        locationId: location.id,
        practitionerId: practitioner.id,
        startAt,
        endAt,
        amount: 0,
      });
      if (!("id" in result)) {
        setAppointmentError(result.message);
        return;
      }
      setCreatedAppointmentId(result.id);
      setNotice("Cita creada en el escenario demo");
      setAppointmentOpen(false);
    } catch (caught) {
      setAppointmentError(toApiError(caught).message);
    } finally {
      setAppointmentBusy(false);
    }
  };

  if (!useMocks) return unavailablePage();

  const currentAppointment = selected?.nextAppointment;
  const createdAppointment = snapshot.appointments.find((appointment) => appointment.id === createdAppointmentId) ?? null;

  return (
    <section className="page chat-page">
      <div className="page-heading page-heading--with-actions">
        <div><h1>Conversaciones</h1><p>Mensajes de demostración locales.</p></div>
      </div>
      <p className={styles.disclosure} role="note">Lo que escribas se añade solo a esta conversación de demostración. No se envía por Telegram ni WhatsApp.</p>
      <div className="chat-workspace">
        <aside className="conversation-panel">
          <button type="button" className="chat-mobile-toggle" aria-expanded={!isMobileLayout || mobileContactsOpen} aria-controls="chat-contacts-content" onClick={() => setMobileContactsOpen((open) => !open)}>
            <span><strong>Contactos</strong>{selected && <small>{selected.name}</small>}</span><ChevronDown aria-hidden="true" />
          </button>
          <div id="chat-contacts-content" className={`conversation-panel__content ${isMobileLayout && !mobileContactsOpen ? "conversation-panel__content--collapsed" : ""}`}>
            <h2>Contactos</h2>
            <label className="search-control search-control--full"><Search size={18} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar contacto" aria-label="Buscar contacto" /></label>
            <div className="chat-filters" role="group" aria-label="Filtrar contactos">
              {filters.map((label) => <button key={label} type="button" className={filter === label ? "chat-filter--active" : ""} aria-pressed={filter === label} onClick={() => setFilter(label)}>{label}</button>)}
            </div>
            <div className="conversation-list">
              {visible.map((contact) => <button key={contact.id} type="button" className={`conversation-item ${contact.id === selected?.id ? "conversation-item--active" : ""}`} aria-pressed={contact.id === selected?.id} onClick={() => { setSelectedId(contact.id); setCreatedAppointmentId(""); setNotice(""); setComposerText(""); setMobileContactsOpen(false); }}>
                <span className={`avatar avatar--${contact.kind === "patient" ? "cyan" : "blue"}`}>{contact.initials}</span>
                <span className="conversation-item__copy"><strong>{contact.name}</strong><small>{contact.nextAppointment ? `Cita · ${formatAppointment(contact.nextAppointment.startAt)}` : contact.detail}</small><Badge tone={contact.kind === "patient" ? "green" : "blue"}>{contact.kind === "patient" ? "Paciente" : "Lead"}</Badge></span>
                <span className="conversation-item__meta"><small>{contact.locationName}</small></span>
              </button>)}
              {!visible.length && <div className="empty-state" role="status">No hay contactos para estos filtros.</div>}
            </div>
          </div>
        </aside>

        {selected ? <section className="message-panel" data-contact-id={selected.id}>
          <header className="message-header"><span className={`avatar avatar--${selected.kind === "patient" ? "cyan" : "blue"}`}>{selected.initials}</span><div><h2>{selected.name}</h2><span>{selected.kind === "patient" ? "Paciente" : "Lead"} · {selected.locationName}</span></div></header>
          <div className="agent-strip chat-demo-strip"><span><Badge tone="slate">Demo</Badge><small>Solo local</small></span><Button compact icon={RotateCcw} aria-label="Restablecer conversación demo" title="Volver a los mensajes iniciales de demostración" onClick={resetDemoConversation}>Restablecer</Button></div>
          <div className="message-history" role="log" aria-label={`Conversación demo con ${selected.name}`} data-thread-contact-id={selected.id}>
            {createdAppointment && <div className="appointment-confirmation"><CalendarCheck aria-hidden="true" /><div><strong>{createdAppointment.id === createdAppointmentId ? "Cita creada en demo" : "Próxima cita confirmada"}</strong><span>{formatAppointment(createdAppointment.startAt)}</span><span>{snapshot.locations.find((location) => location.id === createdAppointment.locationId)?.name ?? "Sede"} · {createdAppointment.serviceName}</span><Button compact onClick={() => router.push(`/agenda?appointment=${createdAppointment.id}`)}>Ver en agenda</Button></div></div>}
            {notice && <p className="context-help-answer" role="status">{notice}</p>}
            {selectedMessages.map((message) => <article key={message.id} className={`message-bubble ${message.sender === "team" ? "message-bubble--staff" : "message-bubble--contact"}`} data-contact-id={message.contactId}>
              <span className="chat-message-sender">{message.sender === "team" ? "Equipo · demo" : selected.kind === "patient" ? "Paciente · demo" : "Lead · demo"}</span>
              <p>{message.text}</p>
              <time>{message.time}</time>
            </article>)}
          </div>
          <form className="message-composer" onSubmit={sendDemoMessage}>
            <input value={composerText} onChange={(event) => setComposerText(event.target.value)} aria-label="Mensaje para añadir a la demo" placeholder="Escribe un mensaje para la demo" maxLength={280} />
            <Button type="submit" variant="primary" className="send-button" icon={Plus} aria-label="Añadir mensaje a la demo" title="Añadir solo a esta conversación de demostración" disabled={!composerText.trim()} />
          </form>
        </section> : <section className="message-panel empty-state" role="status">Selecciona un contacto</section>}

        <aside className="patient-panel">
          <button type="button" className="chat-mobile-toggle" aria-expanded={!isMobileLayout || mobileProfileOpen} aria-controls="chat-patient-content" onClick={() => setMobileProfileOpen((open) => !open)}>
            <span><strong>Ficha</strong>{selected && <small>{selected.name}</small>}</span><ChevronDown aria-hidden="true" />
          </button>
          <div id="chat-patient-content" className={`patient-panel__content ${isMobileLayout && !mobileProfileOpen ? "patient-panel__content--collapsed" : ""}`}>
            <h2>Ficha compartida</h2>
            {selected && <>
              <div className="patient-panel__hero"><span className={`avatar avatar--${selected.kind === "patient" ? "cyan" : "blue"}`}>{selected.initials}</span><div><h3>{selected.name}</h3><Badge tone={selected.kind === "patient" ? "green" : "blue"}>{selected.kind === "patient" ? "Paciente activo" : "Lead"}</Badge></div></div>
              <div className="patient-facts">
                <div><span>Teléfono</span><strong>{selected.phone || "No disponible"}</strong></div>
                <div><span>Sede</span><strong>{selected.locationName}</strong></div>
                {selected.patient?.practitionerId && <div><span>Profesional</span><strong>{snapshot.practitioners.find((item) => item.id === selected.patient?.practitionerId)?.name ?? "No asignado"}</strong></div>}
                {selected.lead && <div><span>Origen</span><strong>{selected.source}</strong></div>}
                {selected.lead && <div><span>Estado</span><strong>{selected.status}</strong></div>}
                <div><span>{selected.kind === "patient" ? "Tratamiento" : "Necesidad"}</span><strong>{selected.detail}</strong></div>
              </div>
              <h2 className="patient-panel__next-title">Próxima cita</h2>
              {currentAppointment ? <div className="next-appointment"><span><CalendarCheck aria-hidden="true" /></span><div><strong>{formatAppointment(currentAppointment.startAt)}</strong><small>{currentAppointment.serviceName} · {selected.locationName}</small><Badge tone="green">Confirmada</Badge><Button compact onClick={() => router.push(`/agenda?appointment=${currentAppointment.id}`)}>Ver en agenda</Button></div></div> : <p className="summary-empty">Sin cita futura confirmada.</p>}
              <div className="patient-panel__actions">
                <Button onClick={() => router.push(selected.patient ? `/pacientes?patient=${selected.entityId}` : "/pacientes?tab=leads")}>{selected.patient ? "Ver ficha" : "Ver leads"}</Button>
                {canCreateAppointment ? <Button variant="primary" onClick={openAppointment}>Crear cita</Button> : <p className="chat-permission-note">Este perfil puede consultar; no tiene permiso demo para crear citas.</p>}
              </div>
            </>}
          </div>
        </aside>
      </div>

      <Modal title="Crear cita desde el contacto" open={appointmentOpen} onClose={() => !appointmentBusy && setAppointmentOpen(false)} size="small" portal>
        {selected && <form className="form-grid" onSubmit={submitAppointment}>
          <div className="detail-list field--wide"><div><span>Contacto</span><strong>{selected.name} · {selected.patient ? "Paciente" : "Lead"}</strong></div></div>
          {appointmentError && <div className="form-error field--wide" role="alert">{appointmentError}</div>}
          <label className="field field--wide"><span>Servicio</span><select aria-label="Servicio" value={appointmentServiceId} onChange={(event) => { const nextServiceId = event.target.value; setAppointmentServiceId(nextServiceId); setAppointmentPractitionerId(snapshot.appointments.find((appointment) => appointment.serviceId === nextServiceId && appointment.locationId === appointmentLocationId)?.practitionerId ?? ""); }} required disabled={appointmentBusy}><option value="">Selecciona un servicio</option>{appointmentServicesAtLocation.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
          <label className="field"><span>Sede</span><select aria-label="Sede" value={appointmentLocationId} onChange={(event) => { const nextLocationId = event.target.value; const availableServices = appointmentServices.filter((service) => hasServiceAtLocation(service.id, nextLocationId)); const nextService = availableServices.find((service) => service.id === appointmentServiceId) ?? availableServices[0]; setAppointmentLocationId(nextLocationId); setAppointmentServiceId(nextService?.id ?? ""); setAppointmentPractitionerId(snapshot.appointments.find((appointment) => appointment.serviceId === nextService?.id && appointment.locationId === nextLocationId)?.practitionerId ?? ""); }} required disabled={appointmentBusy}>{appointmentLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
          <label className="field"><span>Odontólogo</span><select aria-label="Odontólogo" value={appointmentPractitionerId} onChange={(event) => setAppointmentPractitionerId(event.target.value)} required disabled={appointmentBusy}>{appointmentPractitioners.map((practitioner) => <option key={practitioner.id} value={practitioner.id}>{practitioner.name}</option>)}</select></label>
          <label className="field"><span>Fecha</span><input aria-label="Fecha" type="date" min={defaultDate()} max={maxBookingDate()} value={appointmentDate} onChange={(event) => setAppointmentDate(event.target.value)} required disabled={appointmentBusy} /></label>
          <label className="field"><span>Hora</span><input aria-label="Hora" type="time" value={appointmentTime} onChange={(event) => setAppointmentTime(event.target.value)} required disabled={appointmentBusy} /></label>
          <p className="modal-intro field--wide">Duración demo: 60 minutos. La cita se vincula por el ID de este contacto.</p>
          {!appointmentServicesAtLocation.length && <p className="form-error field--wide" role="status">No hay un servicio de esta necesidad disponible en esa sede dentro del escenario demo.</p>}
          <div className="form-actions field--wide"><Button type="button" onClick={() => setAppointmentOpen(false)} disabled={appointmentBusy}>Cancelar</Button><Button type="submit" variant="primary" disabled={appointmentBusy || !appointmentServicesAtLocation.length || !appointmentLocations.length || !appointmentPractitioners.length}>{appointmentBusy ? "Creando…" : "Crear cita en demo"}</Button></div>
        </form>}
      </Modal>
    </section>
  );
}
