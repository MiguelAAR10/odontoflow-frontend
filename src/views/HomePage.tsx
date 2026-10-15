"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ArrowUpRight } from "lucide-react";
import { z } from "zod";
import { loadAiriHome, loadAiriState, toApiError, useMocks } from "../api";
import { useAgent } from "../agui/useAgent";
import { useShellContext } from "../components/shell/ShellContext";
import { usePersona } from "../components/PersonaContext";
import { Thread, moveThread, threadDestination } from "../components/shell/Thread";
import { formatMoney } from "../catalog/format";
import type { ShellRole } from "../nav";

type HomeTask = { label: string; target?: string };
const roleCopy: Record<ShellRole, { name: string; question: string; suggestions: HomeTask[] }> = {
  admin: { name: "Recepción", question: "¿Qué resolvemos primero?", suggestions: [
    { label: "Revisa mi turno", target: "turno" }, { label: "Abre la bandeja", target: "bandeja" },
    { label: "Agenda de hoy", target: "agenda" }, { label: "Confirma las citas de mañana" }, { label: "¿Quién toma el hueco de la tarde?" },
  ] },
  dueno: { name: "Dirección", question: "¿Qué quieres saber de tu clínica?", suggestions: [
    { label: "Revisa las decisiones pendientes", target: "bandeja" }, { label: "Revisa las sedes en Dirección", target: "direccion" },
    { label: "¿Por qué Miraflores cobra menos?" }, { label: "Revisa la caja", target: "caja" }, { label: "Abrir el lienzo", target: "lienzo" },
  ] },
  doctor: { name: "Doctor", question: "¿Cómo te ayudo con tu jornada?", suggestions: [
    { label: "Abre mi jornada", target: "jornada" }, { label: "Prepara el brief de Ana" },
    { label: "Ayúdame con la evolución" }, { label: "Mi agenda de hoy", target: "agenda" }, { label: "Abrir el lienzo", target: "lienzo" },
  ] },
};
export function limaGreeting(now: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", hour: "numeric", hourCycle: "h23" }).format(now));
  return hour >= 6 && hour < 12 ? "Buenos días" : hour >= 12 && hour < 19 ? "Buenas tardes" : "Buenas noches";
}
const summarySchema = z.object({ cut_at: z.string(), sedes: z.array(z.object({ name: z.string(), collected: z.object({ amount_cents: z.number(), currency: z.literal("PEN") }), complete: z.boolean() })) });
type Summary = z.infer<typeof summarySchema>;
const agents = ["02-cepillo", "03-pasta", "04-hilo", "05-enjuague", "06-espejo", "07-escudo"];

export function HomePage() {
  const agent = useAgent();
  const { role } = useShellContext();
  const { identity } = usePersona();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [clock, setClock] = useState<Date | null>(null);
  const [fixture, setFixture] = useState<{ name: string; summary: Summary } | null>(null);
  const [homeName, setHomeName] = useState<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    if (!agent.docked && agent.queries > 0) document.getElementById("airi-home-input")?.focus({ preventScroll: true });
  }, [agent.docked, agent.queries]);
  useEffect(() => {
    setClock(new Date());
    const timer = setInterval(() => setClock(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let current = true;
    setFixture(null);
    setHomeName(null);
    if (useMocks) {
      void Promise.all([import("../agui/sim/fixtures/roles.json"), import("../agui/sim/fixtures/state.json")]).then(([roles, state]) => {
        const home = roles.default.find(item => item.role === role);
        const summary = summarySchema.safeParse(state.default[0]);
        if (current && home && summary.success) setFixture({ name: home.name, summary: summary.data });
      }).catch(caught => { if (current) setError(toApiError(caught).message); });
    } else {
      void loadAiriHome(role).then(home => { if (current) setHomeName(home.name); })
        .catch(caught => { if (current) setError(toApiError(caught).message); });
      if (role === "dueno") void loadAiriState().then(value => {
        const summary = summarySchema.parse(value);
        if (current) setFixture({ name: "", summary });
      }).catch(caught => { if (current) setError(toApiError(caught).message); });
    }
    return () => { current = false; };
  }, [role]);
  const live = summarySchema.safeParse(agent.worldState);
  const summary = live.success ? live.data : fixture?.summary;
  const name = (useMocks ? fixture?.name : homeName || identity?.displayName) || roleCopy[role].name;
  const ask = (intent: string) => {
    if (!intent.trim() || agent.working) return;
    setError("");
    void agent.send(intent, { role, view: "home", viewing: "Inicio" }).catch(caught => setError(toApiError(caught).message));
  };
  const startTask = (task: HomeTask) => {
    if (agent.working) return;
    if (!task.target) { ask(task.label); return; }
    const path = threadDestination(task.target, role);
    if (!path) return;
    moveThread(() => {
      if (path === "/lienzo") agent.closePanel(); else agent.openPanel();
      router.push(path);
    });
  };
  const submit = (event: FormEvent) => { event.preventDefault(); if (!value.trim() || agent.working) return; ask(value); setValue(""); };
  const pending = Object.values(agent.cards).filter(entry => entry.status === "pending" || entry.status === "error").length;
  return <div className="airi-home" data-docked={agent.docked}>
    <section className="airi-home-hero" aria-labelledby="airi-home-title">
      <div className="airi-home-background" aria-hidden="true">{agents.map((file, index) => <img key={file} src={`/personajes/svg/${file}-flat.svg`} width={68} height={68} alt="" className={`airi-home-agent airi-home-agent--${index}`} />)}</div>
      <div className="airi-home-welcome">
        <span className="airi-home-brand" role="img" aria-label="AIRI" />
        <p className="airi-home-date">{clock ? new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", weekday: "long", day: "numeric", month: "long" }).format(clock) : "Tu día en AIRI"} <span>Hora Lima{clock ? ` ${new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(clock)}` : ""}</span></p>
        <h1 id="airi-home-title">{clock ? limaGreeting(clock) : "Hola"}, {name.split(" ")[0]}.</h1>
        <div className="airi-home-summary" aria-label="Resumen en vivo">
          {summary ? <><p>{summary.sedes.length} sedes en el corte de {new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(summary.cut_at))}. {pending ? `${pending} ${pending === 1 ? "propuesta espera" : "propuestas esperan"} tu decisión.` : "El equipo prepara; tú decides."}</p>
            <p>{summary.sedes.map(sede => `${sede.name}: ${formatMoney(sede.collected.amount_cents)} cobrado${sede.complete ? "" : " (datos incompletos)"}`).join(" · ")}</p></>
            : <p>Consulta al equipo para revisar los datos de tu clínica.</p>}
        </div>
        {!agent.panelOpen ? <form className="airi-home-composer" onSubmit={submit}>
          <img src="/personajes/svg/01-diente-flat.svg" alt="" width={40} height={40} />
          <label className="sr-only" htmlFor="airi-home-input">Pregúntale a AIRI</label>
          <input id="airi-home-input" data-airi-input placeholder={roleCopy[role].question} autoComplete="off" value={value} onChange={event => setValue(event.target.value)} />
          <button aria-label="Enviar" type="submit" disabled={agent.working || !value.trim()}><ArrowUp size={22} aria-hidden="true" /></button>
        </form> : <p className="airi-home-panel-hint">Sigue la conversación en la barra de abajo.</p>}
        {!agent.panelOpen && agent.docked && agent.run.status !== "idle" ? <div className="airi-home-progress">
          <p role="status" aria-live="polite">{agent.run.what || "Entendiendo tu consulta…"}</p>
          {agent.working ? <button type="button" onClick={agent.stop}>Detener</button> : null}
        </div> : null}
        <div className="airi-home-suggestions" aria-label="Sugerencias">{roleCopy[role].suggestions.slice(0, 3).map(task => <button key={task.label} type="button" disabled={agent.working} onClick={() => startTask(task)}>{task.label}</button>)}</div>
        {agent.docked && agent.queries ? <div className="airi-home-docked"><span>Tu conversación sigue en el panel · {agent.queries} {agent.queries === 1 ? "consulta" : "consultas"}</span>{!agent.panelOpen ? <button type="button" onClick={agent.openPanel}>Ver hilo</button> : null}<button type="button" onClick={() => moveThread(agent.toCenter)}>Traer al centro</button></div> : null}
        {error ? <p role="alert" className="airi-home-error">{error}</p> : null}
      </div>
    </section>
    {!agent.docked && agent.queries ? <section className="airi-home-thread" aria-label="Conversación en el centro"><Thread /></section> : null}
    <section className="airi-home-tasks" aria-labelledby="airi-tasks-title"><h2 id="airi-tasks-title">Podemos empezar por aquí</h2><p>Elige una tarea para prepararla con el equipo.</p>
      <div>{roleCopy[role].suggestions.map((task, index) => <button className="airi-home-task" key={task.label} type="button" disabled={agent.working} onClick={() => startTask(task)}><img src={`/personajes/svg/${agents[index]}-flat.svg`} width={38} height={38} alt="" /><span>{task.label}</span><ArrowUpRight size={18} aria-hidden="true" /></button>)}</div>
    </section>
    <style>{`
      .airi-home{min-width:0;padding:0 32px 30px;color:var(--ink)}
      .airi-home-hero{position:relative;max-width:1100px;margin:auto;padding:120px 0 66px;isolation:isolate}
      .airi-home-welcome{position:relative;max-width:700px;margin:auto;text-align:center;z-index:1}
      .airi-home-brand{display:block;width:190px;height:48px;margin:0 auto 26px;background:var(--ink);mask:url("/marca/airi-logo.svg") center/contain no-repeat}
      .airi-home-date{display:flex;justify-content:center;flex-wrap:wrap;gap:8px 18px;color:var(--muted);font-size:13px;margin:0 0 20px}
      .airi-home-date span{font-variant-numeric:tabular-nums}
      .airi-home h1{font:500 clamp(30px,3.2vw,46px)/1.15 var(--font-display);letter-spacing:-.035em;margin:0 0 18px}
      .airi-home-summary{max-width:630px;margin:auto;color:var(--ink-2);font-size:14px;line-height:1.7}
      .airi-home-summary p{margin:4px 0}.airi-home-summary p+p{font-size:12px;color:var(--muted)}
      .airi-home-composer{display:flex;align-items:center;gap:12px;padding:14px 16px;margin:26px auto 14px;background:var(--surface);border:1px solid var(--line-2);border-radius:20px;box-shadow:var(--shadow)}
      .airi-home-composer input{min-width:0;flex:1;background:transparent;color:var(--ink);border:0;font-size:16px;min-height:44px;padding:8px 0}
      .airi-home-composer input::placeholder{color:var(--muted)}
      .airi-home-composer button{display:grid;place-items:center;flex:none;width:44px;height:44px;border:0;border-radius:50%;background:var(--btn);color:var(--btn-ink)}
      .airi-home-composer button:disabled{opacity:.45}.airi-home-composer:focus-within{outline:2px solid var(--focus);outline-offset:3px}
      .airi-home-suggestions{display:flex;justify-content:center;flex-wrap:wrap;gap:8px}
      .airi-home-suggestions button,.airi-home-docked button,.airi-home-progress button{min-height:36px;padding:7px 12px;background:var(--surface);color:var(--ink-2);border:1px solid var(--line);border-radius:24px;font-size:12px}
      .airi-home button:hover:enabled{background:var(--hover);color:var(--ink)}
      .airi-home-docked{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;margin-top:18px;font-size:13px;color:var(--muted)}
      .airi-home-progress{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px;margin:0 0 14px;color:var(--ink-2);font-size:13px}.airi-home-progress p{margin:0}
      .airi-home-panel-hint{margin:24px 0 16px;font-size:14px;color:var(--muted)}
      .airi-home-background{position:absolute;inset:0;z-index:-1;pointer-events:none;overflow:hidden}
      .airi-home-agent{position:absolute;opacity:.65;width:58px;height:58px}
      .airi-home-agent--0{top:42px;left:3%;transform:rotate(-14deg)}.airi-home-agent--1{top:240px;left:0;transform:rotate(12deg)}.airi-home-agent--2{bottom:16px;left:7%;transform:rotate(-8deg)}
      .airi-home-agent--3{top:30px;right:3%;transform:rotate(14deg)}.airi-home-agent--4{top:240px;right:0;transform:rotate(-8deg)}.airi-home-agent--5{bottom:12px;right:7%;transform:rotate(12deg)}
      .airi-home-thread{max-width:700px;margin:0 auto 40px}
      .airi-home-tasks{max-width:700px;margin:6px auto 0}.airi-home-tasks h2{font:500 21px var(--font-display);margin:0 0 6px}.airi-home-tasks>p{font-size:13px;color:var(--muted);margin:0 0 16px}
      .airi-home-tasks>div{border-top:1px solid var(--line)}
      .airi-home-task{display:flex;align-items:center;gap:14px;width:100%;padding:11px 4px;min-height:60px;text-align:left;background:transparent;border:0;border-bottom:1px solid var(--line);color:var(--ink-2);font-size:14px}
      .airi-home-task span{flex:1}.airi-home-task svg{flex:none;color:var(--muted)}.airi-home-task img{object-fit:contain}
      .airi-home-error{color:var(--red-ink)}
      .airi-shell--panel-open .airi-home-background{display:none}
      @media(max-width:1180px){.airi-home-background{display:none}}
      @media(max-width:760px){.airi-home-background{display:block;bottom:auto;height:118px}.airi-home-agent{width:30px;height:30px;opacity:.75}.airi-home-agent--0{top:7px;left:0}.airi-home-agent--1{top:64px;left:0}.airi-home-agent--3{top:7px;right:0}.airi-home-agent--4{top:64px;right:0}.airi-home-agent--2,.airi-home-agent--5{display:none}.airi-home{padding:0 18px 20px}.airi-home-hero{padding:38px 0 32px}.airi-home-brand{width:150px;height:38px;margin-bottom:24px}.airi-home-date{font-size:12px;margin-bottom:18px}.airi-home-composer{padding:8px 10px;gap:8px;border-radius:16px;margin-top:22px}.airi-home-composer>img{width:30px;height:30px}.airi-home-composer input{font-size:14px}.airi-home-summary{font-size:13px}.airi-home-suggestions{gap:6px}.airi-home-suggestions button{font-size:12px;padding:7px 10px}.airi-home-task{font-size:13px}}
    `}</style>
  </div>;
}
