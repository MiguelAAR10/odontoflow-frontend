import { useEffect, useMemo, useState } from "react";
import { Bell, ChevronDown, HeartPulse, Menu, Plus, Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getPatients } from "../api";
import type { Patient } from "../types";
import { Navbar } from "./Navbar";

export function Header({ onNewAppointment }: { onNewAppointment: () => void }) {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);

  useEffect(() => { void getPatients().then(setPatients); }, []);
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 2) return [];
    return patients.filter((patient) => [patient.name, patient.dni, patient.phone].some((value) => value.toLowerCase().includes(normalized))).slice(0, 4);
  }, [patients, query]);

  const openPatient = (patient: Patient) => {
    setQuery("");
    navigate(`/pacientes?patient=${patient.id}`);
  };

  return (
    <header className="app-header">
      <div className="topbar">
        <button className="mobile-menu" onClick={() => setMobileOpen((value) => !value)} aria-label="Abrir navegación" aria-expanded={mobileOpen}>
          {mobileOpen ? <X /> : <Menu />}
        </button>
        <button className="brand" onClick={() => navigate("/agenda")} aria-label="Ir a la agenda">
          <span className="brand__mark"><HeartPulse size={27} strokeWidth={2.1} /></span>
          <span>ODONTO<strong>SMART</strong></span><small className="demo-label">DEMO</small>
        </button>
        <div className="global-search">
          <Search size={21} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar paciente por DNI, nombre o teléfono" aria-label="Buscar paciente por DNI, nombre o teléfono" />
          {results.length > 0 && <div className="global-search__results">{results.map((patient) => (
            <button key={patient.id} onClick={() => openPatient(patient)}><span className={`avatar avatar--${patient.tone}`}>{patient.initials}</span><span><strong>{patient.name}</strong><small>{patient.dni} · {patient.phone}</small></span></button>
          ))}</div>}
        </div>
        <div className="profile-actions">
          <button className="notification-button" aria-label="Notificaciones"><Bell size={25} /><span /></button>
          <button className="profile-button" aria-label="Abrir perfil">
            <span className="profile-avatar">LP</span>
            <span className="profile-copy"><strong>Leonardo Panduro</strong><small>Administrador</small></span>
            <ChevronDown size={20} />
          </button>
        </div>
      </div>
      <div className="nav-row">
        <Navbar mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />
        <button className="new-appointment-button" onClick={onNewAppointment}><Plus size={24} /> Nueva cita</button>
      </div>
    </header>
  );
}
