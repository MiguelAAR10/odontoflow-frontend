"use client";

import { Bell, Menu, Moon, Plus, Search, Sun, MessageCircle, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { getPatients, loadCanonicalLocations, toApiError } from "../api";
import type { Patient } from "../types";
import { Drawer } from "./Drawer";
import { SHELL_ROLES, type ShellRole } from "../nav";
import { useShellContext } from "./shell/ShellContext";
import { usePersona } from "./PersonaContext";
import type { LocationRead } from "../contracts/client";

export function Topbar({ onNewAppointment, mobileOpen, onToggleSidebar, panelOpen, onTogglePanel, canvas }: { onNewAppointment: () => void; mobileOpen: boolean; onToggleSidebar: () => void; panelOpen: boolean; onTogglePanel: () => void; canvas: boolean }) {
  const router = useRouter();
  const { role, setRole, locationId, setLocationId } = useShellContext();
  const { version } = usePersona();
  const [locations, setLocations] = useState<LocationRead[]>([]);
  const [locationError, setLocationError] = useState("");
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    let saved: string | null = null;
    try { saved = localStorage.getItem("airi.shell.theme.v1"); } catch { /* Storage can be unavailable. */ }
    const sync = () => {
      const chosen = saved === "light" || saved === "dark" ? saved : media.matches ? "dark" : "light";
      document.documentElement.dataset.theme = chosen;
      setDark(chosen === "dark");
    };
    sync();
    const changed = () => {
      try { saved = localStorage.getItem("airi.shell.theme.v1"); } catch { /* Use system theme. */ }
      sync();
    };
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  const toggleTheme = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setDark(!dark);
    try { localStorage.setItem("airi.shell.theme.v1", next); } catch { /* Keep this session's theme. */ }
  };
  useEffect(() => {
    let current = true;
    setLocationId("");
    setLocations([]);
    setLocationError("");
    void loadCanonicalLocations().then(rows => { if (current) setLocations(rows.filter(row => row.is_active)); })
      .catch(caught => { if (current) setLocationError(toApiError(caught).message); });
    return () => { current = false; };
  }, [version, setLocationId]);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!searchOpen) return;
    searchInput.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector('[aria-modal="true"]')) return;
      setSearchOpen(false);
      searchTrigger.current?.focus();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [searchOpen]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationTab, setNotificationTab] = useState("Todos");

  useEffect(() => {
    let current = true;
    setPatients([]);
    setQuery("");
    void getPatients().then(rows => { if (current) setPatients(rows); }).catch(() => { if (current) setPatients([]); });
    return () => { current = false; };
  }, [version]);
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 2) return [];
    return patients.filter((patient) => [patient.name, patient.dni, patient.phone].some((value) => value.toLowerCase().includes(normalized))).slice(0, 4);
  }, [patients, query]);
  const openPatient = (patient: Patient) => { setQuery(""); setSearchOpen(false); router.push(`/pacientes?patient=${patient.id}`); };

  return <header className="app-topbar">
    <Link href="/home" className="shell-brand" aria-label="AIRI, inicio"><span className="shell-logo" aria-hidden="true" /></Link>
    <button className="mobile-menu" type="button" onClick={onToggleSidebar} aria-label={mobileOpen ? "Cerrar navegación" : "Abrir navegación"} aria-expanded={mobileOpen} aria-controls="app-sidebar">{mobileOpen ? <X size={21} /> : <Menu size={21} />}</button>
    <div id="global-patient-search" className={`global-search ${searchOpen ? "global-search--open" : ""}`}>
      <Search size={19} aria-hidden="true" /><input ref={searchInput} name="patient-search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar paciente por DNI, nombre o teléfono" aria-label="Buscar paciente por DNI, nombre o teléfono" />
      {results.length > 0 && <div className="global-search__results">{results.map((patient) => <button key={patient.id} type="button" onClick={() => openPatient(patient)}><span className={`avatar avatar--${patient.tone}`}>{patient.initials}</span><span><strong>{patient.name}</strong><small>{patient.dni} · {patient.phone}</small></span></button>)}</div>}
    </div>
    <div id="crew" className="shell-crew" role="region" aria-label="Equipo de agentes" />
    <div className="shell-roles" role="group" aria-label="Ver como">{SHELL_ROLES.map(item => <button key={item.value} type="button" aria-pressed={role === item.value} onClick={() => setRole(item.value)}>{item.label}</button>)}</div>
    <select className="shell-role-select" aria-label="Ver como" value={role} onChange={event => setRole(event.target.value as ShellRole)}>{SHELL_ROLES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
    <select className="shell-location-select" aria-label="Sede" title={locationError || "Sede"} value={locationId} onChange={event => setLocationId(event.target.value)}><option value="">Todas las sedes</option>{locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select>
    <button type="button" className="shell-icon-button shell-theme" aria-label={dark ? "Usar tema claro" : "Usar tema oscuro"} onClick={toggleTheme}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
    {!canvas && <button type="button" className="shell-icon-button shell-assistant" aria-label={panelOpen ? "Cerrar asistente" : "Abrir asistente"} aria-expanded={panelOpen} aria-controls="agent-panel" onClick={onTogglePanel}><MessageCircle size={18} aria-hidden="true" /><span>Asistente</span></button>}
    {locationError && <span className="shell-location-error" role="alert">{locationError}</span>}
    <button ref={searchTrigger} type="button" className="shell-icon-button shell-mobile-search" aria-label="Buscar paciente" aria-expanded={searchOpen} aria-controls="global-patient-search" onClick={() => setSearchOpen(value => !value)}><Search size={18} aria-hidden="true" /></button>
    <div className="topbar-actions"><button className="notification-button" type="button" aria-label="Notificaciones" onClick={() => setNotificationsOpen(true)}><Bell size={19} /></button><button className="new-appointment-button" aria-label="Nueva cita" type="button" onClick={onNewAppointment}><Plus size={18} /> <span>Nueva cita</span></button></div>
    <Drawer title="Notificaciones" open={notificationsOpen} onClose={() => setNotificationsOpen(false)}>
      <div className="notification-tabs" role="tablist" aria-label="Categorías de notificaciones">{["Todos", "Citas", "Pagos", "Otros"].map((tab) => <button key={tab} type="button" role="tab" aria-selected={notificationTab === tab} aria-controls="notifications-content" onClick={() => setNotificationTab(tab)}>{tab}</button>)}</div>
      <div id="notifications-content" className="notification-empty" role="tabpanel" aria-label={notificationTab}><Bell size={30} /><h3>Sin notificaciones</h3><p>El servicio de notificaciones aún no está conectado.</p></div>
    </Drawer>
  </header>;
}
