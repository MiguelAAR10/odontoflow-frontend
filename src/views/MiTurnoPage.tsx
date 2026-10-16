"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { loadAgenda, toApiError, useMocks } from "../api";
import { useAgent } from "../agui/useAgent";
import { usePersona } from "../components/PersonaContext";
import { useShellContext } from "../components/shell/ShellContext";
import { Card } from "../catalog/Card";
import { OperationsStyles } from "./ActivityPage";
import { ClinicInbox, type InboxSummary } from "./ApprovalsPage";
import { TaskPanel } from "./TaskPanel";

// Presentation projection of AgendaItem. No clock-driven status changes.
const appointmentSchema = z.object({
  id: z.string().min(1), start_at: z.iso.datetime({offset:true}), end_at: z.iso.datetime({offset:true}),
  patient: z.string().min(1), practitioner_name: z.string().min(1), procedure: z.string().min(1),
  arrived_at: z.iso.datetime({offset:true}).nullable().optional(),
  sede: z.string().min(1), state: z.enum(["cerrada","sin cerrar","ausente","en consulta","llegó","confirmada","sin confirmar"]),
});
type TurnAppointment = z.infer<typeof appointmentSchema>;
const agendaProjection = z.object({ agenda: z.array(appointmentSchema.extend({ arrived_at: z.iso.datetime({offset:true}).nullable() })), cut_at: z.iso.datetime({offset:true}) });
const time = (iso: string) => new Intl.DateTimeFormat("es-PE", {timeZone:"America/Lima",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(iso));

export function MiTurnoPage() {
  const agent = useAgent();
  const { role, locationId } = useShellContext();
  const { version: identityVersion } = usePersona();
  const scope = JSON.stringify([role, locationId, identityVersion]);
  const [read, setRead] = useState<{
    scope: string; data: {agenda: TurnAppointment[]; cut_at: string} | null;
    loading: boolean; error: string;
  }>({scope, data:null, loading:false, error:""});
  const [queue, setQueue] = useState<{scope: string; summary: InboxSummary} | null>(null);
  const onSummary = useCallback((summary: InboxSummary) => setQueue({scope, summary}), [scope]);
  const queueSummary = queue?.scope === scope ? queue.summary : null;
  const [error, setError] = useState("");
  const [request, setRequest] = useState(0);
  useEffect(() => {
    if (role !== "admin") return;
    let active = true;
    setRead(previous => ({scope, data:previous.scope === scope ? previous.data : null, loading:true, error:""}));
    setError("");
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
    void load().then(next => {
      if (active) setRead({scope, data:next, loading:false, error:""});
    }).catch(caught => {
      if (active) setRead(previous => ({...previous, loading:false, error:toApiError(caught).message}));
    }).finally(() => {
      if (active && !useMocks) timer = setTimeout(() => setRequest(value => value+1),30_000);
    });
    // Backend reads refresh without overlapping a slow request. Streamed cards
    // update immediately through useAgent; this timer only schedules a new read.
    return () => {active=false;if(timer) clearTimeout(timer);};
  }, [role,locationId,identityVersion,scope,request]);
  const live = agendaProjection.safeParse(agent.worldState);
  const currentRead = read.scope === scope ? read : null;
  const snapshot = live.success ? live.data : currentRead?.data;
  // The REST agenda has no arrival/consultation projection. Only a complete
  // world-state snapshot or the official mock fixture can report these counts.
  const arrivalsAvailable = live.success || useMocks;
  const displayError = error || currentRead?.error || "";
  const rows = snapshot?.agenda ?? [];
  const cut = snapshot ? new Date(snapshot.cut_at).getTime() : 0;
  const now = rows.filter(row => row.state === "en consulta" || row.state === "llegó");
  const next = rows.filter(row => ["confirmada","sin confirmar"].includes(row.state) && new Date(row.start_at).getTime() >= cut && new Date(row.start_at).getTime() < cut+7_200_000);
  const attention = rows.filter(row => row.state === "sin cerrar"
    || (row.state === "sin confirmar" && new Date(row.start_at).getTime() > cut && new Date(row.start_at).getTime() <= cut+9_000_000)
    || (row.state === "llegó" && row.arrived_at && cut-new Date(row.arrived_at).getTime() > 600_000));
  const pending = Object.values(agent.cards).filter(entry => entry.status === "pending" || entry.status === "error" || (entry.status === "loading" && entry.loadingReason === "approval"));
  const ask = () => {setError("");void agent.send("Confirma las citas de mañana",{role,view:"mi-turno",viewing:"Mi turno"}).catch(caught => setError(toApiError(caught).message));};

  return <section className="airi-operations airi-catalog turn-page" aria-labelledby="turn-title">
    <OperationsStyles/><TurnStyles />
    <header className="operations-head"><div><h1 id="turn-title">{role === "doctor" ? "Mis tareas" : "Mi turno"}</h1><p className="operations-meta">{role === "doctor" ? "Coordinación del equipo" : snapshot ? `${useMocks ? "Corte simulado" : "Agenda consultada"}: ${new Intl.DateTimeFormat("es-PE",{timeZone:"America/Lima",dateStyle:"short",timeStyle:"short"}).format(new Date(snapshot.cut_at))} · hora Lima` : "Recepción"}</p></div>
      {role === "admin" && <button className="catalog-button" disabled={agent.working} onClick={ask}>Confirma citas de mañana</button>}</header>
    <TaskPanel locationId={locationId} />
    {role !== "admin" ? <p role="note">Tus tareas están arriba. La cola de recepción está disponible en la vista Administrativo.</p> : <>
      <p className="operations-note">Primero quién está en la clínica y qué te necesita. La bandeja reúne los casos de la clínica; revisa el alcance y decide en la tarjeta.</p>
      {displayError && <p role="alert">{displayError} <button className="catalog-button" onClick={() => setRequest(value => value+1)}>Reintentar</button></p>}
      <div className="operations-layout"><div className="turn-radar">
        {!snapshot && !displayError ? <p role="status">Cargando turno…</p> : snapshot && <>
          {currentRead?.loading && <p role="status">Actualizando agenda… Se conserva el último corte.</p>}
          {!arrivalsAvailable && <p className="operations-meta">Llegadas y pacientes en consulta no disponibles en esta fuente.</p>}
          <div className="turn-figures" aria-label="Resumen del turno">
            <div><span className="operations-count">{arrivalsAvailable ? now.filter(row => row.state === "llegó").length : "No consta"}</span><span>{arrivalsAvailable ? "en espera" : "llegadas"}</span></div>
            <div><span className="operations-count">{next.length}</span><span>próximas 2 h</span></div>
            <Link href="/aprobaciones"><span className="operations-count" aria-label={queueSummary?.pendingPartial ? `${queueSummary.pending} o más propuestas pendientes` : undefined}>{queueSummary?.pending ?? "…"}{queueSummary?.pendingPartial ? "+" : ""}</span><span>me requieren</span></Link>
            <Link href="/caja"><span className="operations-count">{queueSummary?.verification ?? "No consta"}</span><span>pagos por verificar</span></Link>
          </div>
          <div className="turn-groups">
          {([...(arrivalsAvailable ? [{title:"Ahora",rows:now}] : []),{title:"Próximas 2 h",rows:next},{title:"Requiere atención",rows:attention}]).map(group => <section className="turn-group" key={group.title} aria-label={group.title}>
            <h2>{group.title} <span className="operations-meta">{group.rows.length}</span></h2>
            {group.rows.length ? group.rows.map(row => <div className="operations-appointment" key={row.id}><time dateTime={row.start_at}>{time(row.start_at)}</time><div><strong>{row.patient}</strong><small>{group.title === "Requiere atención" ? row.state === "sin cerrar" ? "horario terminado · atención sin cerrar" : row.state === "llegó" ? "espera más de 10 min" : "empieza pronto" : `${row.procedure} · ${row.practitioner_name} · ${row.sede}`}</small></div><span className={`turn-state ${row.state === "llegó" ? "turn-state-wait" : ["sin confirmar","sin cerrar"].includes(row.state) ? "turn-state-attention" : ""}`}>
              {row.state === "llegó" && row.arrived_at ? `llegó ${time(row.arrived_at)} · espera ${Math.max(0, Math.floor((cut-new Date(row.arrived_at).getTime())/60_000))} min` : row.state}
            </span></div>) : <p className="operations-meta">No hay citas en este grupo.</p>}
          </section>)}
          </div>
        </>}
      </div><div className="turn-inbox">
        <ClinicInbox key={scope} onSummary={onSummary} />
        {pending.length > 0 && <section aria-labelledby="turn-cases"><h2 id="turn-cases">Propuestas del hilo actual <span className="operations-count" aria-live="polite">{pending.length}</span></h2>
          {pending.map(entry => <div className="operations-case" data-turn-case key={entry.card.id}><Card card={entry.card} status={entry.status} loadingReason={entry.loadingReason} error={entry.error} onApprove={card => agent.approve(card.id)}/></div>)}
        </section>}
      </div></div>
    </>}
  </section>;
}

function TurnStyles() {
  return <style>{`
    .turn-page{padding:28px 30px 120px}
    .turn-page .operations-layout{grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:16px}
    .turn-radar,.turn-inbox{min-width:0}
    .turn-figures{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0 14px}
    .turn-figures>div,.turn-figures>a{display:flex;flex-direction:column;gap:5px;color:var(--ink);text-decoration:none;padding:10px 4px}
    .turn-figures .operations-count{font:600 28px var(--font-display);font-variant-numeric:tabular-nums;line-height:1.2;overflow-wrap:anywhere}
    .turn-figures>div>span:last-child,.turn-figures>a>span:last-child{font-size:12px;color:var(--muted);line-height:1.5}
    .turn-groups{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
    .turn-group h2{font:500 15px var(--font-text);display:flex;align-items:center;gap:8px;padding:14px 14px 6px;margin:0}
    .turn-group h2:before{content:"";width:8px;height:8px;flex:none;border-radius:50%;background:var(--blue)}
    .turn-group:nth-child(2) h2:before{background:var(--green)}.turn-group:last-child h2:before{background:var(--red)}
    .turn-group h2>span{margin-left:auto;font-family:var(--font-display)}
    .turn-group>p{padding:0 14px;font-size:13px}
    .turn-page .operations-appointment{grid-template-columns:42px minmax(0,1fr) auto;padding:10px 14px;gap:8px;border-top:1px solid var(--line);font-size:14px}
    .turn-page .operations-appointment time{font-family:var(--font-display);font-variant-numeric:tabular-nums;color:var(--muted)}
    .turn-page .operations-appointment strong{font-weight:500}
    .turn-page .operations-appointment small{display:block;font-size:12px;line-height:1.5;color:var(--muted);margin-top:2px}
    .turn-state{font-size:12px;line-height:1.5;border:1px solid var(--line);border-radius:99px;padding:3px 8px;max-width:126px;text-align:right;overflow-wrap:anywhere}
    .turn-state-wait{background:var(--yellow-soft);color:var(--yellow-ink)}.turn-state-attention{background:var(--red-soft);color:var(--red-ink)}
    .turn-inbox .bandeja-section-head{margin-top:12px}.turn-inbox .bandeja-views p{font-size:11px}
    @media(max-width:760px){.turn-page{padding:22px 16px 120px}.turn-page .operations-layout{grid-template-columns:minmax(0,1fr)}.turn-figures{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.turn-figures .operations-count{font-size:24px}.turn-page .operations-appointment{grid-template-columns:42px minmax(0,1fr)}.turn-state{grid-column:2;justify-self:start;text-align:left;max-width:none}}
  `}</style>;
}
