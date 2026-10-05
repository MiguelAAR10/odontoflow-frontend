"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarPlus, Eye, Plus, Search, Send, UserRoundPlus } from "lucide-react";
import { useOdontoRepository, createLeadRecord, getLeadRecord, getLeads, toApiError, useMocks, type DemoAppointment, type DemoLead } from "../api";
import type { LeadRead } from "../api";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import styles from "./LeadsWorkspace.module.css";

type LeadRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  source: string;
  need: string;
  status: string;
  locationId: string | null;
  patientId: string | null;
};

const sourceLabel = (source: string) => ({ promotion: "Promoción", referral: "Referido", direct: "Directo" }[source] ?? source);
const statusLabel = (status: string) => ({ new: "Nuevo", contacted: "Contactado", scheduled: "Con cita", patient: "Paciente" }[status] ?? status);
const statusTone = (status: string): "green" | "amber" | "cyan" | "slate" => status === "patient" || status === "scheduled" ? "green" : status === "contacted" ? "amber" : status === "new" ? "cyan" : "slate";
const dateLabel = (value: string) => new Intl.DateTimeFormat("es-PE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" }).format(new Date(value));

function fromDemo(lead: DemoLead): LeadRow {
  return { id: lead.id, name: lead.name, phone: lead.phone, email: lead.email ?? null, source: lead.source, need: lead.need, status: lead.status, locationId: lead.locationId, patientId: lead.patientId };
}

function fromApi(lead: LeadRead): LeadRow {
  return {
    id: String(lead.id), name: lead.full_name, phone: lead.contact_phone ?? "", email: lead.contact_email,
    source: sourceLabel(lead.acquisition_source), need: lead.service_need_id === null ? "Necesidad no informada" : `Necesidad #${lead.service_need_id}`,
    status: lead.commercial_status, locationId: null, patientId: null,
  };
}

export function LeadsWorkspace() {
  const { snapshot, dispatch } = useOdontoRepository();
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("all");
  const [location, setLocation] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<LeadRow | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError("");
    if (useMocks) {
      setRows(snapshot.leads.map(fromDemo));
      setLoading(false);
      return;
    }
    let cancelled = false;
    void getLeads().then((leads) => { if (!cancelled) setRows(leads.map(fromApi)); })
      .catch((caught) => { if (!cancelled) setError(toApiError(caught).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [snapshot.leads]);

  const visible = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("es");
    return rows.filter((lead) =>
      (!search || `${lead.name} ${lead.phone} ${lead.source} ${lead.need}`.toLocaleLowerCase("es").includes(search)) &&
      (stage === "all" || lead.status === stage) &&
      (location === "all" || (location === "unassigned" ? !lead.locationId : lead.locationId === location)),
    );
  }, [rows, query, stage, location]);

  const relatedAppointment = (lead: LeadRow): DemoAppointment | undefined => useMocks ? snapshot.appointments.find((appointment) => appointment.leadId === lead.id) : undefined;

  const openDetails = async (lead: LeadRow) => {
    setSelected(lead);
    if (useMocks) return;
    try {
      const detail = await getLeadRecord(Number(lead.id));
      setSelected(fromApi(detail));
    } catch (caught) {
      setError(toApiError(caught).message);
    }
  };

  const assignLocation = async (lead: LeadRow, locationId: string) => {
    try {
      const result = await dispatch({ type: "assignLeadLocation", leadId: lead.id, locationId });
      setNotice(result.message);
    } catch (caught) {
      setError(toApiError(caught).message);
    }
  };

  const contactLead = async (lead: LeadRow) => {
    try {
      const result = await dispatch({ type: "recordLeadContact", leadId: lead.id, label: "Contacto registrado por recepción" });
      setNotice(result.message);
    } catch (caught) {
      setError(toApiError(caught).message);
    }
  };

  const promoteLead = async (lead: LeadRow) => {
    if (!lead.locationId) return;
    try {
      const result = await dispatch({ type: "promoteLeadToPatient", leadId: lead.id, locationId: lead.locationId });
      setNotice(result.message);
    } catch (caught) {
      setError(toApiError(caught).message);
    }
  };

  const submitLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name")).trim();
    const phone = String(form.get("phone")).trim();
    const email = String(form.get("email") ?? "").trim();
    const source = String(form.get("source"));
    try {
      if (useMocks) {
        const result = await dispatch({ type: "createLead", name, phone, email, source, need: String(form.get("need")).trim() });
        setNotice(result.message);
      } else {
        const rawNeedId = String(form.get("serviceNeedId") ?? "").trim();
        const created = await createLeadRecord({
          full_name: name,
          contact_phone: phone,
          contact_email: email || null,
          acquisition_source: source as LeadRead["acquisition_source"] & ("promotion" | "referral" | "direct"),
          ...(rawNeedId ? { service_need_id: Number(rawNeedId) } : {}),
        });
        setRows((current) => [fromApi(created), ...current]);
        setNotice("Lead creado en la API");
      }
      setNewOpen(false);
    } catch (caught) {
      setError(toApiError(caught).message);
    }
  };

  const leadForDetails = selected ? rows.find((lead) => lead.id === selected.id) ?? selected : null;
  const appointmentForDetails = leadForDetails ? relatedAppointment(leadForDetails) : undefined;
  const linkedPatient = leadForDetails?.patientId ? snapshot.patients.find((patient) => patient.id === leadForDetails.patientId) : undefined;
  const activity = leadForDetails && useMocks
    ? snapshot.leadEvents.filter((event) => event.leadId === leadForDetails.id).sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    : [];
  const canManageDemoLeads = useMocks && snapshot.actor.role === "admin";
  const canCreateLead = !useMocks || snapshot.actor.capabilities.includes("leads.create");

  return <div className={styles.leadsWorkspace}>
    <div className={styles.toolbar}>
      <label className={styles.search}><Search size={17} aria-hidden="true" /><input aria-label="Buscar leads" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nombre, teléfono u origen" /></label>
      <label className={styles.filter}><span>Estado</span><select aria-label="Filtrar leads por estado" value={stage} onChange={(event) => setStage(event.target.value)}><option value="all">Todos</option><option value="new">Nuevos</option><option value="contacted">Contactados</option><option value="scheduled">Con cita</option><option value="patient">Paciente</option></select></label>
      {useMocks && <label className={styles.filter}><span>Sede</span><select aria-label="Filtrar leads por sede" value={location} onChange={(event) => setLocation(event.target.value)}><option value="all">Todas</option>{snapshot.locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="unassigned">Sin asignar</option></select></label>}
      <span className={styles.count}>{visible.length} leads</span>
      {canCreateLead && <Button variant="primary" icon={Plus} onClick={() => setNewOpen(true)}>Nuevo lead</Button>}
    </div>
    {notice && <div className={styles.notice} role="status">{notice}</div>}
    {error && <div className={styles.error} role="alert">{error}</div>}
    <div className={`${styles.listHead} ${useMocks ? "" : styles.listHeadApi}`} aria-hidden="true"><span>Lead y necesidad</span>{useMocks && <><span>Origen y sede</span><span>Próxima cita</span></>}<span>Estado</span><span>Acciones</span></div>
    {loading ? <div className={styles.state} role="status">Cargando leads…</div> : visible.length === 0 ? <div className={styles.state}>No hay leads para estos filtros.</div> : <div className={styles.list}>
      {visible.map((lead) => {
        const appointment = relatedAppointment(lead);
        const branchName = snapshot.locations.find((item) => item.id === lead.locationId)?.name ?? "Sin asignar";
        return <article className={`${styles.row} ${useMocks ? "" : styles.rowApi}`} key={lead.id}>
          <div className={styles.identity}><button className={styles.name} type="button" onClick={() => void openDetails(lead)}><strong>{lead.name}</strong><Eye size={15} aria-hidden="true" /></button><span>{lead.phone || "Sin teléfono"}</span><small>{lead.need}</small></div>
          {useMocks && <><div className={styles.meta}><span>{lead.source}</span>{canManageDemoLeads ? <label className={styles.assignment}><span className="sr-only">Asignar sede a {lead.name}</span><select aria-label={`Sede de ${lead.name}`} value={lead.locationId ?? "unassigned"} onChange={(event) => { if (event.target.value !== "unassigned") void assignLocation(lead, event.target.value); }}><option value="unassigned">Sin asignar</option>{snapshot.locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : <small>{branchName}</small>}</div>
          <div className={styles.appointment}>{appointment ? <Link href={`/agenda?appointment=${appointment.id}`}>{dateLabel(appointment.startAt)} <ArrowUpRight size={13} /></Link> : <span>Sin cita vinculada</span>}</div></>}
          <div className={styles.status}><Badge tone={statusTone(lead.status)}>{statusLabel(lead.status)}</Badge></div>
          <div className={styles.actions}>
            <Button compact icon={Eye} onClick={() => void openDetails(lead)}>Ficha</Button>
            {canManageDemoLeads && <>
              <Button compact icon={Send} onClick={() => void contactLead(lead)}>Contactar</Button>
              {!lead.patientId && <Button compact variant="primary" icon={UserRoundPlus} disabled={!lead.locationId} onClick={() => void promoteLead(lead)}>Promover</Button>}
            </>}
          </div>
        </article>;
      })}
    </div>}
    {!useMocks && <p className={styles.apiNote}>La API entrega nombre, contacto, origen, necesidad y estado. No incluye sede, citas vinculadas ni eventos de actividad.</p>}

    <Modal title="Registrar lead" open={newOpen} onClose={() => setNewOpen(false)}>
      <form className="form-grid" onSubmit={submitLead}>
        <label className="field field--wide"><span>Nombre completo</span><input name="name" required maxLength={160} autoFocus /></label>
        <label className="field"><span>Teléfono</span><input name="phone" type="tel" required /></label>
        <label className="field"><span>Correo (opcional)</span><input name="email" type="email" /></label>
        <label className="field field--wide"><span>Origen</span><select name="source" defaultValue={useMocks ? "Referido" : "referral"}>{useMocks ? <><option>Referido</option><option>Google</option><option>Instagram</option><option>Web</option></> : <><option value="promotion">Promoción</option><option value="referral">Referido</option><option value="direct">Directo</option></>}</select></label>
        {useMocks ? <label className="field field--wide"><span>Necesidad de servicio</span><input name="need" required maxLength={120} placeholder="Ej. Evaluación, ortodoncia" /></label> : <label className="field field--wide"><span>ID de necesidad (opcional)</span><input name="serviceNeedId" type="number" min="1" step="1" placeholder="El catálogo de necesidades no está disponible" /></label>}
        <div className="form-actions field--wide"><Button type="button" onClick={() => setNewOpen(false)}>Cancelar</Button><Button type="submit" variant="primary">Registrar lead</Button></div>
      </form>
    </Modal>

    <Modal title="Ficha del lead" open={Boolean(leadForDetails)} onClose={() => setSelected(null)}>
      {leadForDetails && <div className={styles.detail}>
        <div className={styles.detailHero}><span><strong>{leadForDetails.name}</strong><small>{leadForDetails.phone || "Sin teléfono"}</small></span><Badge tone={statusTone(leadForDetails.status)}>{statusLabel(leadForDetails.status)}</Badge></div>
        <dl><div><dt>Origen</dt><dd>{leadForDetails.source}</dd></div><div><dt>Necesidad</dt><dd>{leadForDetails.need}</dd></div>{useMocks && <div><dt>Sede</dt><dd>{snapshot.locations.find((item) => item.id === leadForDetails.locationId)?.name ?? "Sin asignar"}</dd></div>}<div><dt>Correo</dt><dd>{leadForDetails.email ?? "No informado"}</dd></div></dl>
        {useMocks && <><section><h3>Cita vinculada</h3>{appointmentForDetails ? <Link href={`/agenda?appointment=${appointmentForDetails.id}`} onClick={() => setSelected(null)}>{dateLabel(appointmentForDetails.startAt)} · {appointmentForDetails.serviceName} <ArrowUpRight size={14} /></Link> : <p>Este lead no tiene una cita vinculada.</p>}</section>
        <section><h3>Actividad registrada</h3>{activity.length ? <ul>{activity.map((event) => <li key={event.id}><strong>{event.label}</strong><time>{dateLabel(event.createdAt)}</time></li>)}</ul> : <p>Sin eventos registrados.</p>}</section></>}
        {linkedPatient && <Link href={`/pacientes?patient=${encodeURIComponent(linkedPatient.id)}`} onClick={() => setSelected(null)}>Abrir paciente · {linkedPatient.name} <ArrowUpRight size={14} /></Link>}
        {canManageDemoLeads && !leadForDetails.patientId && !appointmentForDetails && <Button variant="primary" icon={CalendarPlus} onClick={() => { window.dispatchEvent(new CustomEvent("odonto:new-appointment", { detail: { leadId: leadForDetails.id } })); setSelected(null); }}>Crear cita</Button>}
      </div>}
    </Modal>
  </div>;
}
