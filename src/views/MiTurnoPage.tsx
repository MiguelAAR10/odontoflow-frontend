"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { loadAgenda, toApiError, useMocks } from "../api";
import { useAgent } from "../agui/useAgent";
import { useShellContext } from "../components/shell/ShellContext";
import { Card } from "../catalog/Card";
import { OperationsStyles } from "./ActivityPage";

// Presentation projection of AgendaItem. No clock-driven status changes.
const appointmentSchema = z.object({
  id: z.string().min(1), start_at: z.iso.datetime({offset:true}), end_at: z.iso.datetime({offset:true}),
  patient: z.string().min(1), practitioner_name: z.string().min(1), procedure: z.string().min(1),
  arrived_at: z.iso.datetime({offset:true}).nullable().optional(),
  sede: z.string().min(1), state: z.enum(["cerrada","sin cerrar","ausente","en consulta","llegó","confirmada","sin confirmar"]),
});
type TurnAppointment = z.infer<typeof appointmentSchema>;
const agendaProjection = z.object({ agenda: z.array(appointmentSchema), cut_at: z.iso.datetime({offset:true}) });
const time = (iso: string) => new Intl.DateTimeFormat("es-PE", {timeZone:"America/Lima",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(iso));

export function MiTurnoPage() {
  const agent = useAgent();
  const { role, locationId } = useShellContext();
  const [data, setData] = useState<{agenda: TurnAppointment[]; cut_at: string} | null>(null);
  const [error, setError] = useState("");
  const [request, setRequest] = useState(0);
  useEffect(() => {
    if (role !== "admin") return;
    let active = true;
    setData(null); setError("");
    const load = async () => {
      if (useMocks) {
        const [agenda, snapshots] = await Promise.all([import("../agui/sim/fixtures/agenda.json"), import("../agui/sim/fixtures/state.json")]);
        return {agenda:z.array(appointmentSchema).parse(agenda.default),cut_at:z.iso.datetime({offset:true}).parse(snapshots.default[0]?.cut_at)};
      }
      const now = new Date();
      const date = new Intl.DateTimeFormat("en-CA", {timeZone:"America/Lima",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
      const from = `${date}T00:00:00-05:00`;
      const to = new Date(new Date(from).getTime()+86_400_000).toISOString();
      const rows = await loadAgenda({locationId:locationId ? Number(locationId) : undefined,from,to});
      return {cut_at:now.toISOString(),agenda:rows.flatMap(row => row.status === "Cancelada" || !row.startUtc || !row.endUtc ? [] : [{
        id:row.id,start_at:row.startUtc,end_at:row.endUtc,patient:row.patientName ?? row.patient,
        practitioner_name:row.doctor,procedure:row.treatment,sede:row.branch,
        state:row.status === "Por confirmar" || row.status === "No respondió" ? "sin confirmar" as const
          : row.status === "Atendida" ? "cerrada" as const : row.status === "Ausente" ? "ausente" as const
          : "confirmada" as const,
      }])};
    };
    let timer: ReturnType<typeof setTimeout> | null = null;
    void load().then(next => {if(active) setData(next);}).catch(caught => {if(active) setError(toApiError(caught).message);}).finally(() => {
      if (active && !useMocks) timer = setTimeout(() => setRequest(value => value+1),30_000);
    });
    // Backend reads refresh without overlapping a slow request. Streamed cards
    // update immediately through useAgent; this timer only schedules a new read.
    return () => {active=false;if(timer) clearTimeout(timer);};
  }, [role,locationId,request]);
  const live = agendaProjection.safeParse(agent.worldState);
  const snapshot = live.success ? live.data : data;
  const rows = snapshot?.agenda ?? [];
  const cut = snapshot ? new Date(snapshot.cut_at).getTime() : 0;
  const now = rows.filter(row => row.state === "en consulta" || row.state === "llegó");
  const next = rows.filter(row => ["confirmada","sin confirmar"].includes(row.state) && new Date(row.start_at).getTime() >= cut && new Date(row.start_at).getTime() < cut+7_200_000);
  const attention = rows.filter(row => row.state === "sin cerrar"
    || (row.state === "sin confirmar" && new Date(row.start_at).getTime() > cut && new Date(row.start_at).getTime() <= cut+9_000_000)
    || (row.state === "llegó" && row.arrived_at && cut-new Date(row.arrived_at).getTime() > 600_000));
  const pending = Object.values(agent.cards).filter(entry => entry.status === "pending" || entry.status === "error" || (entry.status === "loading" && entry.loadingReason === "approval"));
  const ask = () => {setError("");void agent.send("Confirma las citas de mañana",{role,view:"mi-turno",viewing:"Mi turno"}).catch(caught => setError(toApiError(caught).message));};

  return <section className="airi-operations airi-catalog" aria-labelledby="turn-title">
    <OperationsStyles/>
    <header className="operations-head"><div><h1 id="turn-title">Mi turno</h1><p className="operations-meta">{snapshot ? `${useMocks ? "Corte simulado" : "Agenda consultada"}: ${new Intl.DateTimeFormat("es-PE",{timeZone:"America/Lima",dateStyle:"short",timeStyle:"short"}).format(new Date(snapshot.cut_at))} · hora Lima` : "Recepción"}</p></div>
      {role === "admin" && <button className="catalog-button" disabled={agent.working} onClick={ask}>Confirma las citas de mañana</button>}</header>
    {role !== "admin" ? <p role="note">Mi turno es la cola de recepción. Elige Administrativo en «Ver como» para consultarla.</p> : <>
      <p className="operations-note">Primero quién está en la clínica y qué te necesita. Revisa el alcance y decide en la tarjeta.</p>
      {error && <p role="alert">{error} <button className="catalog-button" onClick={() => setRequest(value => value+1)}>Reintentar</button></p>}
      <div className="operations-layout"><div>
        {!snapshot && !error ? <p role="status">Cargando turno…</p> : snapshot && <>
          <p><span className="operations-count">{now.filter(row => row.state === "llegó").length}</span> en espera · <span className="operations-count">{next.length}</span> próximas 2 h</p>
          {([{title:"Ahora",rows:now},{title:"Próximas 2 h",rows:next},{title:"Requiere atención",rows:attention}]).map(group => <section className="operations-panel" key={group.title} aria-label={group.title}>
            <h2>{group.title} <span className="operations-meta">{group.rows.length}</span></h2>
            {group.rows.length ? group.rows.map(row => <div className="operations-appointment" key={row.id}><time dateTime={row.start_at}>{time(row.start_at)}</time><div><strong>{row.patient}</strong><small style={{display:"block"}}>{row.procedure} · {row.practitioner_name} · {row.sede}</small></div><span className="operations-meta">{row.state}</span></div>) : <p className="operations-meta">No hay citas en este grupo.</p>}
          </section>)}
        </>}
      </div><section aria-labelledby="turn-cases"><h2 id="turn-cases">Casos que te necesitan <span className="operations-count" aria-live="polite">{pending.length}</span></h2>
        <p className="operations-meta">Propuestas de este hilo · se actualizan mientras el equipo trabaja.</p>
        {!pending.length && <div className="operations-panel"><p>No hay decisiones pendientes en este hilo.</p><Link className="catalog-button" href="/aprobaciones">Abrir bandeja de la clínica</Link></div>}
        {pending.map(entry => <div className="operations-case" data-turn-case key={entry.card.id}><Card card={entry.card} status={entry.status} loadingReason={entry.loadingReason} error={entry.error} onApprove={card => agent.approve(card.id)}/></div>)}
      </section></div>
    </>}
  </section>;
}
