"use client";

import { Bell, Menu, Plus, Search, UsersRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { confirmationQueue, getPatients, useMocks, useOdontoRepository } from "../api";
import type { Patient } from "../types";
import { canAccessPath, roleOptions, useDemoRole, type ProductRole } from "../roles";
import { BrandLogo } from "./BrandLogo";
import { DemoIndicator } from "./DemoIndicator";
import { LocationContext } from "./LocationContext";
import { UserSlot } from "./UserSlot";
import styles from "./Topbar.module.css";

export function Topbar({ onNewAppointment, mobileOpen, onToggleSidebar }: { onNewAppointment: () => void; mobileOpen: boolean; onToggleSidebar: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [role, setRole, roleReady] = useDemoRole();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { snapshot } = useOdontoRepository();
  const confirmationAppointments = !roleReady || role === "collaborator" ? [] : confirmationQueue(snapshot, role === "admin" ? snapshot.actor.locationId : null);
  const confirmationCount = confirmationAppointments.length;

  useEffect(() => {
    if (useMocks || !roleReady || !canAccessPath(role, "/pacientes")) {
      setPatients([]);
      setQuery("");
      return;
    }
    void getPatients().then(setPatients).catch(() => setPatients([]));
  }, [role, roleReady]);
  const sharedPatients = useMemo<Patient[]>(() => {
    if (!useMocks) return patients;
    return snapshot.patients
      .filter((patient) => snapshot.actor.role === "owner" || snapshot.actor.role === "admin" ? patient.locationId === snapshot.actor.locationId || snapshot.actor.role === "owner" : patient.practitionerId === snapshot.actor.practitionerId)
      .map((patient) => ({
        id: patient.id,
        initials: patient.name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
        name: patient.name,
        dni: "",
        phone: patient.phone,
        branch: snapshot.locations.find((location) => location.id === patient.locationId)?.name ?? "Sede",
        nextAppointment: "Sin cita",
        treatment: patient.treatment,
        status: "Activo",
        tone: "cyan",
        origin: patient.leadId ? "Lead convertido" : "Registro clínico",
        interest: "En seguimiento",
      }));
  }, [patients, snapshot]);
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 2) return [];
    return sharedPatients.filter((patient) => [patient.name, patient.dni, patient.phone].some((value) => value.toLowerCase().includes(normalized))).slice(0, 4);
  }, [query, sharedPatients]);
  const openPatient = (patient: Patient) => { setQuery(""); router.push(`/pacientes?patient=${patient.id}`); };

  return <header className="app-topbar">
    <button className="mobile-menu" type="button" onClick={onToggleSidebar} aria-label={mobileOpen ? "Cerrar navegación" : "Abrir navegación"} aria-expanded={mobileOpen}>{mobileOpen ? <X size={21} /> : <Menu size={21} />}</button>
    <button className="topbar-brand" type="button" onClick={() => router.push(role === "collaborator" ? "/mi-dia" : "/")} aria-label="Ir al inicio"><BrandLogo variant="horizontal" /></button>
    {roleReady && canAccessPath(role, "/pacientes") ? <div className="global-search">
      <Search size={19} aria-hidden="true" /><input name="patient-search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar paciente por DNI, nombre o teléfono" aria-label="Buscar paciente por DNI, nombre o teléfono" />
      {results.length > 0 && <div className="global-search__results">{results.map((patient) => <button key={patient.id} type="button" onClick={() => openPatient(patient)}><span className={`avatar avatar--${patient.tone}`}>{patient.initials}</span><span><strong>{patient.name}</strong><small>{patient.dni} · {patient.phone}</small></span></button>)}</div>}
    </div> : <div className="topbar-spacer" aria-hidden="true" />}
    <div className="topbar-context">
      {roleReady ? <label className="role-switcher">
        <span>Rol demo</span>
        <select value={role} onChange={(event) => setRole(event.target.value as ProductRole)}>
          {roleOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label> : <span className="role-switcher role-switcher--loading">Preparando sesión</span>}
      {roleReady && <LocationContext />}
      {useMocks && roleReady && <DemoIndicator />}
    </div>
    <div className="topbar-actions">{roleReady && <label className={`role-switcher ${styles.compactRole}`}>
      <UsersRound size={16} aria-hidden="true" />
      <select aria-label="Cambiar rol demo" value={role} onChange={(event) => setRole(event.target.value as ProductRole)}>
        {roleOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>}<div className="notification-wrap"><button className="notification-button" type="button" aria-label="Próximas citas" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((current) => !current)}><Bell size={19} />{confirmationCount > 0 && <span />}</button>{notificationsOpen && <div className="notification-popover" role="status"><strong>Próximas citas</strong>{confirmationAppointments.length ? <div className="notification-list">{confirmationAppointments.map((appointment) => { const patient = snapshot.patients.find((item) => item.id === appointment.patientId); const location = snapshot.locations.find((item) => item.id === appointment.locationId); return <button className="notification-item" type="button" key={appointment.id} onClick={() => { setNotificationsOpen(false); router.push(`/agenda?appointment=${appointment.id}`); }}><strong>{patient?.name ?? "Paciente"}</strong><small>{new Intl.DateTimeFormat("es-PE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Lima" }).format(new Date(appointment.startAt))} · {location?.name ?? "Sede"}</small></button>; })}</div> : <p>No hay citas próximas.</p>}<button type="button" onClick={() => setNotificationsOpen(false)}>Cerrar</button></div>}</div><UserSlot />{useMocks && roleReady && role === "admin" && <button className={`new-appointment-button ${styles.desktopAction}`} type="button" onClick={onNewAppointment}><Plus size={18} /> <span>Nueva cita</span></button>}</div>
  </header>;
}
