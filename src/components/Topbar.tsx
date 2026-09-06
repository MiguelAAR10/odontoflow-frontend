"use client";

import { Bell, Menu, Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getPatients, useMocks } from "../api";
import type { Patient } from "../types";
import { BrandLogo } from "./BrandLogo";
import { DemoIndicator } from "./DemoIndicator";
import { LocationContext } from "./LocationContext";
import { UserSlot } from "./UserSlot";

export function Topbar({ onNewAppointment, mobileOpen, onToggleSidebar }: { onNewAppointment: () => void; mobileOpen: boolean; onToggleSidebar: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);

  useEffect(() => { void getPatients().then(setPatients).catch(() => setPatients([])); }, []);
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 2) return [];
    return patients.filter((patient) => [patient.name, patient.dni, patient.phone].some((value) => value.toLowerCase().includes(normalized))).slice(0, 4);
  }, [patients, query]);
  const openPatient = (patient: Patient) => { setQuery(""); router.push(`/pacientes?patient=${patient.id}`); };

  return <header className="app-topbar">
    <button className="mobile-menu" type="button" onClick={onToggleSidebar} aria-label={mobileOpen ? "Cerrar navegación" : "Abrir navegación"} aria-expanded={mobileOpen}>{mobileOpen ? <X size={21} /> : <Menu size={21} />}</button>
    <button className="topbar-brand" type="button" onClick={() => router.push("/agenda")} aria-label="Ir a la agenda"><BrandLogo variant="horizontal" /></button>
    <div className="global-search">
      <Search size={19} aria-hidden="true" /><input name="patient-search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar paciente por DNI, nombre o teléfono" aria-label="Buscar paciente por DNI, nombre o teléfono" />
      {results.length > 0 && <div className="global-search__results">{results.map((patient) => <button key={patient.id} type="button" onClick={() => openPatient(patient)}><span className={`avatar avatar--${patient.tone}`}>{patient.initials}</span><span><strong>{patient.name}</strong><small>{patient.dni} · {patient.phone}</small></span></button>)}</div>}
    </div>
    <div className="topbar-context"><LocationContext />{useMocks && <DemoIndicator />}</div>
    <div className="topbar-actions"><button className="notification-button" type="button" aria-label="Notificaciones"><Bell size={19} /><span /></button><UserSlot /><button className="new-appointment-button" type="button" onClick={onNewAppointment}><Plus size={18} /> <span>Nueva cita</span></button></div>
  </header>;
}
