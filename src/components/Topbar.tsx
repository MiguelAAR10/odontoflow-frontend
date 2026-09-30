"use client";

import { Bell, Menu, Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getPatients } from "../api";
import type { Patient } from "../types";
import { Drawer } from "./Drawer";
import { LocationContext } from "./LocationContext";

export function Topbar({ onNewAppointment, mobileOpen, onToggleSidebar }: { onNewAppointment: () => void; mobileOpen: boolean; onToggleSidebar: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationTab, setNotificationTab] = useState("Todos");

  useEffect(() => { void getPatients().then(setPatients).catch(() => setPatients([])); }, []);
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 2) return [];
    return patients.filter((patient) => [patient.name, patient.dni, patient.phone].some((value) => value.toLowerCase().includes(normalized))).slice(0, 4);
  }, [patients, query]);
  const openPatient = (patient: Patient) => { setQuery(""); router.push(`/pacientes?patient=${patient.id}`); };

  return <header className="app-topbar">
    <button className="mobile-menu" type="button" onClick={onToggleSidebar} aria-label={mobileOpen ? "Cerrar navegación" : "Abrir navegación"} aria-expanded={mobileOpen}>{mobileOpen ? <X size={21} /> : <Menu size={21} />}</button>
    <div className="global-search">
      <Search size={19} aria-hidden="true" /><input name="patient-search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar paciente por DNI, nombre o teléfono" aria-label="Buscar paciente por DNI, nombre o teléfono" />
      {results.length > 0 && <div className="global-search__results">{results.map((patient) => <button key={patient.id} type="button" onClick={() => openPatient(patient)}><span className={`avatar avatar--${patient.tone}`}>{patient.initials}</span><span><strong>{patient.name}</strong><small>{patient.dni} · {patient.phone}</small></span></button>)}</div>}
    </div>
    <div className="topbar-context"><LocationContext /></div>
    <div className="topbar-actions"><button className="notification-button" type="button" aria-label="Notificaciones" onClick={() => setNotificationsOpen(true)}><Bell size={19} /></button><button className="new-appointment-button" type="button" onClick={onNewAppointment}><Plus size={18} /> <span>Nueva cita</span></button></div>
    <Drawer title="Notificaciones" open={notificationsOpen} onClose={() => setNotificationsOpen(false)}>
      <div className="notification-tabs" role="tablist" aria-label="Categorías de notificaciones">{["Todos", "Citas", "Pagos", "Otros"].map((tab) => <button key={tab} type="button" role="tab" aria-selected={notificationTab === tab} aria-controls="notifications-content" onClick={() => setNotificationTab(tab)}>{tab}</button>)}</div>
      <div id="notifications-content" className="notification-empty" role="tabpanel" aria-label={notificationTab}><Bell size={30} /><h3>Sin notificaciones</h3><p>El servicio de notificaciones aún no está conectado.</p></div>
    </Drawer>
  </header>;
}
