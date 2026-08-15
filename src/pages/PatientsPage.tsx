import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronDown, Eye, Plus, Search, UserRoundPlus, Users } from "lucide-react";
import { useLocation } from "react-router-dom";
import { createPatient, getPatients } from "../api";
import { Badge, statusTone } from "../components/Badge";
import { Button } from "../components/Button";
import { type Column, DataTable } from "../components/DataTable";
import { KpiCard } from "../components/KpiCard";
import { Modal } from "../components/Modal";
import type { Patient } from "../types";

export function PatientsPage() {
  const location = useLocation();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("Todas las sedes");
  const [status, setStatus] = useState("Todos los estados");
  const [selected, setSelected] = useState<Patient | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => { void getPatients().then((data) => {
    setPatients(data);
    const patientId = new URLSearchParams(location.search).get("patient");
    if (patientId) setSelected(data.find((item) => item.id === patientId) ?? null);
  }); }, [location.search]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return patients.filter((patient) =>
      (!normalized || [patient.name, patient.dni, patient.phone].some((value) => value.toLowerCase().includes(normalized))) &&
      (branch === "Todas las sedes" || patient.branch === branch) &&
      (status === "Todos los estados" || patient.status === status)
    );
  }, [patients, query, branch, status]);

  const submitPatient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const saved = await createPatient({
      name: String(form.get("name")), dni: String(form.get("dni")), phone: String(form.get("phone")),
      branch: String(form.get("branch")), status: "Activo", nextAppointment: "Sin cita", treatment: "Por definir", origin: "Registro manual", interest: "Por validar",
    });
    setPatients((current) => [saved, ...current]);
    setNewOpen(false);
  };

  const columns: Column<Patient>[] = [
    { key: "name", header: "Paciente", width: "24%", render: (patient) => <span className="person-cell"><span className={`avatar avatar--${patient.tone}`}>{patient.initials}</span><span><strong>{patient.name}</strong><small>{patient.treatment}</small></span></span> },
    { key: "dni", header: "DNI", render: (patient) => patient.dni },
    { key: "phone", header: "Teléfono", render: (patient) => patient.phone },
    { key: "branch", header: "Sede", render: (patient) => patient.branch },
    { key: "next", header: "Próxima cita", width: "19%", render: (patient) => patient.nextAppointment },
    { key: "status", header: "Estado", render: (patient) => <Badge tone={statusTone(patient.status)}>{patient.status}</Badge> },
    { key: "actions", header: "", render: (patient) => <Button compact icon={Eye} onClick={() => setSelected(patient)}>Ver ficha</Button> },
  ];

  return (
    <section className="page">
      <div className="page-heading page-heading--with-actions"><div><h1>Pacientes</h1><p>Directorio clínico de las tres sedes</p></div><Button variant="primary" icon={Plus} onClick={() => setNewOpen(true)}>Nuevo paciente</Button></div>
      <div className="kpi-grid kpi-grid--patients">
        <KpiCard icon={Users} value={1284} label="Pacientes registrados" tone="blue" />
        <KpiCard icon={UserRoundPlus} value={37} label="Nuevos este mes" tone="cyan" />
        <KpiCard icon={Users} value={16} label="Leads por contactar" tone="amber" />
      </div>
      <section className="panel table-panel">
        <div className="table-toolbar">
          <label className="search-control"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, DNI o teléfono" aria-label="Buscar pacientes" /></label>
          <label className="select-control"><select value={branch} onChange={(event) => setBranch(event.target.value)} aria-label="Filtrar por sede"><option>Todas las sedes</option><option>Lince</option><option>Jesús María</option><option>Magdalena</option></select><ChevronDown size={16} /></label>
          <label className="select-control"><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrar por estado"><option>Todos los estados</option><option>Activo</option><option>Lead</option><option>Pendiente</option></select><ChevronDown size={16} /></label>
          <span className="result-count">{visible.length} pacientes</span>
        </div>
        <DataTable columns={columns} rows={visible} rowKey={(patient) => patient.id} />
        <div className="pagination"><span>Mostrando {visible.length} de 1,284 pacientes</span><div><button disabled>‹</button><button className="page-active">1</button><button>2</button><button>3</button><button>›</button></div><select aria-label="Filas por página"><option>25 por página</option><option>50 por página</option></select></div>
      </section>

      <Modal title="Ficha del paciente" open={Boolean(selected)} onClose={() => setSelected(null)}>
        {selected && <div className="patient-profile">
          <div className="patient-profile__hero"><span className={`avatar avatar--${selected.tone}`}>{selected.initials}</span><div><h3>{selected.name}</h3><Badge tone={statusTone(selected.status)}>{selected.status}</Badge></div></div>
          <div className="detail-list"><div><span>DNI</span><strong>{selected.dni}</strong></div><div><span>Teléfono</span><strong>{selected.phone}</strong></div><div><span>Sede</span><strong>{selected.branch}</strong></div><div><span>Origen</span><strong>{selected.origin}</strong></div><div><span>Próxima cita</span><strong>{selected.nextAppointment}</strong></div><div><span>Tratamiento</span><strong>{selected.treatment}</strong></div></div>
          <div className="form-actions"><Button onClick={() => setSelected(null)}>Cerrar</Button><Button variant="primary">Editar ficha</Button></div>
        </div>}
      </Modal>

      <Modal title="Registrar paciente" open={newOpen} onClose={() => setNewOpen(false)}>
        <form className="form-grid" onSubmit={submitPatient}>
          <label className="field field--wide"><span>Nombre completo</span><input name="name" required autoFocus /></label>
          <label className="field"><span>DNI</span><input name="dni" inputMode="numeric" minLength={8} required /></label>
          <label className="field"><span>Teléfono</span><input name="phone" type="tel" required /></label>
          <label className="field field--wide"><span>Sede preferida</span><select name="branch"><option>Lince</option><option>Jesús María</option><option>Magdalena</option></select></label>
          <div className="form-actions field--wide"><Button type="button" onClick={() => setNewOpen(false)}>Cancelar</Button><Button type="submit" variant="primary">Registrar paciente</Button></div>
        </form>
      </Modal>
    </section>
  );
}
