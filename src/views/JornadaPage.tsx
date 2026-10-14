"use client";
import Link from "next/link";
import { useMocks } from "../api";
import { useDoctorDay } from "../../app/(shell)/atencion/useDoctorDay";
import { DoctorStyles } from "../../app/(shell)/atencion/DoctorStyles";
import { limaDate, limaTime, nextPatient } from "../../app/(shell)/atencion/doctor";

export function JornadaPage() {
  const { data, role, error, retry } = useDoctorDay();
  const next = data ? nextPatient(data.rows, data.cut) : undefined;
  const pending = data?.rows.filter(row => row.state === "sin cerrar") ?? [];
  return <section className="airi-doctor-view" aria-labelledby="airi-doctor-day-title">
    <DoctorStyles />
    <header className="airi-doctor-head"><div><h1 id="airi-doctor-day-title">Mi jornada</h1><p className="airi-doctor-meta">{data ? `${data.doctor} · ${limaDate(data.cut)} · corte ${limaTime(data.cut)} (Lima)` : "Tus pacientes y pendientes clínicos"}</p></div>{data ? <span className="airi-doctor-chip">Simulación · {data.rows[0]?.sede ?? "sin citas en esta sede"}</span> : null}</header>
    {role !== "doctor" ? <p role="note">Mi jornada está disponible para el doctor. Elige Doctor en «Ver como».</p>
      : !useMocks ? <div className="airi-doctor-card airi-doctor-empty"><p>Tu jornada clínica todavía no está disponible en esta fuente.</p><p>Falta vincular tu identidad con el doctor y recibir su proyección clínica.</p></div>
      : error ? <p role="alert">{error} <button className="airi-doctor-button" onClick={retry}>Reintentar</button></p>
      : !data ? <p role="status">Cargando tu jornada…</p> : <>
        <p className="airi-doctor-note">Primero tu siguiente paciente. Espejo prepara el brief y el borrador; tú revisas y firmas. El horario nunca convierte una cita en atendida.</p>
        {next ? <section className="airi-doctor-card airi-doctor-next" aria-label="Siguiente paciente"><div className="airi-doctor-hour"><time dateTime={next.start_at}>{limaTime(next.start_at)}</time><small>{next.arrived_at ? `Llegó ${limaTime(next.arrived_at)}` : next.state}</small></div><div><span className="airi-doctor-meta">Siguiente paciente · {next.sede}</span><h3>{next.patient}</h3><p>{next.procedure}</p></div><Link className="airi-doctor-button primary" href={`/atencion?cita=${encodeURIComponent(next.id)}`}>Abrir atención</Link></section> : <div className="airi-doctor-card airi-doctor-empty">No quedan pacientes por recibir en este corte.</div>}
        <div className="airi-doctor-columns"><section aria-labelledby="airi-doctor-agenda-title"><h2 id="airi-doctor-agenda-title"><i className="airi-doctor-dot" aria-hidden="true" />Mi agenda de hoy <span className="airi-doctor-meta">{data.rows.length} citas</span></h2><div className="airi-doctor-card">
          {data.rows.length ? data.rows.map(row => <div className="airi-doctor-row" data-airi-doctor-appointment key={row.id}><time dateTime={row.start_at}>{limaTime(row.start_at)}</time><div><Link href={`/atencion?cita=${encodeURIComponent(row.id)}`} aria-label={`Abrir atención de ${row.patient}`}>{row.patient}</Link><small>{row.procedure} · {row.sede}</small></div><span className={`airi-doctor-chip ${row.state === "sin cerrar" ? "missing" : row.state === "llegó" ? "warning" : ""}`}>{row.state}</span></div>) : <p className="airi-doctor-empty">No tienes citas en esta sede para el día del corte.</p>}
        </div></section><section aria-labelledby="airi-doctor-pending-title"><h2 id="airi-doctor-pending-title"><i className="airi-doctor-dot yellow" aria-hidden="true" />Pendientes clínicos</h2><div className="airi-doctor-card">
          {pending.length ? pending.map(row => <div className="airi-doctor-pending" key={row.id}><strong>{row.patient}</strong><p className="airi-doctor-meta">Cita sin cerrar · {row.procedure}</p><Link className="airi-doctor-button" href={`/atencion?cita=${encodeURIComponent(row.id)}`}>Revisar atención de {row.patient}</Link></div>) : <p className="airi-doctor-empty">No hay citas sin cerrar en este corte.</p>}
          <div className="airi-doctor-pending airi-doctor-meta">Laboratorio, consentimientos y notas pendientes de firma: no disponibles en esta fuente.</div>
        </div></section></div>
      </>}
  </section>;
}
