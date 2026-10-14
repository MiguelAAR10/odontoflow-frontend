"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAgentSource } from "../../../../src/agui/index";
import { createAgentStore, useAgentStore } from "../../../../src/agui/store";
import type { RunState } from "../../../../src/agui/reducer";
import type { Event } from "../../../../src/agui/events";
import { scenarios, type SimRole } from "../../../../src/agui/sim/match";
import { toApiError, newIdempotencyKey } from "../../../../src/api";
import styles from "./sim-lab.module.css";

const snapshot = (state: RunState) => state;
const labels = { idle: "En espera", working: "Trabajando", waiting: "Revisa la propuesta", stopped: "Detenido", done: "Listo", error: "Error" };

export default function SimLab({ initialScenario, showEvents }: { initialScenario: string; showEvents: boolean }) {
  const [store] = useState(() => createAgentStore());
  const state = useAgentStore(snapshot, store);
  const [selected, setSelected] = useState(scenarios.some((s) => s.id === initialScenario) ? initialScenario : "");
  const [role, setRole] = useState<SimRole>((scenarios.find((s) => s.id === initialScenario)?.role as SimRole) ?? "admin");
  const [view, setView] = useState("home");
  const [text, setText] = useState("");
  const [eventsOpen, setEventsOpen] = useState(showEvents);
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState(initialScenario && !selected ? `Escenario desconocido: ${initialScenario}` : "");
  const [loading, setLoading] = useState(false);
  const epoch = useRef(0);

  const run = useCallback(async (scenarioId: string, request: string, contextRole: SimRole, contextView: string) => {
    const generation = ++epoch.current;
    store.clear();
    setEvents([]); setError(""); setLoading(true);
    try {
      const source = await getAgentSource({ ...(scenarioId ? { scenarioId } : {}), role: contextRole, view: contextView });
      if (generation !== epoch.current) return;
      store.configure({
        source: {
          run: (input, emit) => source.run(input, (event) => { setEvents((previous) => [...previous, event]); emit(event); }),
          stop: () => source.stop(),
        },
        ...(source.approveCard ? { approveCard: source.approveCard } : {}),
        toApiError, newIdempotencyKey,
      });
      await store.send(request || scenarios.find((s) => s.id === scenarioId)?.name || "Ayuda");
    } catch (caught) {
      if (generation === epoch.current) setError(toApiError(caught).message);
    } finally {
      if (generation === epoch.current) setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    if (scenarios.some((s) => s.id === initialScenario)) void run(initialScenario, "", "admin", "home");
    return () => { epoch.current += 1; store.clear(); };
  }, [initialScenario, run, store]);

  const stop = () => { epoch.current += 1; store.stop(); setLoading(false); };
  const busy = loading || state.run.status === "working";
  return <section className={styles.lab} aria-labelledby="sim-title">
    <header><p className={styles.eyebrow}>AIRI · Desarrollo</p><h1 id="sim-title">Simulador AG-UI</h1><p>Reproduce una intención y sigue sus eventos. Los datos son fixtures de demostración.</p></header>
    <form className={styles.controls} onSubmit={(event) => { event.preventDefault(); void run(selected, text, role, view); }}>
      <label className={styles.wide}>Escenario<select value={selected} disabled={busy} onChange={(event) => { setSelected(event.target.value); setText(""); const scenario = scenarios.find((s) => s.id === event.target.value); if (scenario) setRole(scenario.role as SimRole); }}>
        <option value="">Elegir según el texto</option>{scenarios.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.name}</option>)}
      </select></label>
      <label>Rol<select value={role} disabled={busy} onChange={(event) => setRole(event.target.value as SimRole)}><option value="admin">Administración</option><option value="dueno">Dueño</option><option value="doctor">Doctor</option></select></label>
      <label>Vista<select value={view} disabled={busy} onChange={(event) => setView(event.target.value)}><option value="home">Inicio</option><option value="agenda">Agenda</option><option value="lienzo">Lienzo</option></select></label>
      <label className={styles.wide}>Intención<input value={text} disabled={busy} onChange={(event) => setText(event.target.value)} placeholder={scenarios.find((s) => s.id === selected)?.name ?? "Confirma las citas de mañana"} /></label>
      <div className={styles.actions}><button type="submit" disabled={busy}>Reproducir</button><button type="button" disabled={!busy} onClick={stop}>Detener</button><label className={styles.check}><input type="checkbox" checked={eventsOpen} onChange={(event) => {
        const url = new URL(window.location.href); url.searchParams.set("ev", event.target.checked ? "1" : "0"); window.history.replaceState(null, "", url); setEventsOpen(event.target.checked);
      }} /> Ver eventos</label></div>
    </form>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    <div className={styles.status} role="status"><strong>{labels[state.run.status]}</strong><span>{state.run.agent} · {state.run.what || "Pídele algo a AIRI"}</span></div>
    <ol className={styles.plan}>{state.run.plan.map((step, i) => <li key={i} data-status={step.status}>{step.status === "done" ? "✓" : step.status === "working" ? "●" : "○"} {step.label}</li>)}</ol>
    <div className={styles.columns}>
      <section className={styles.panel} aria-label="Proyección del reducer"><h2>Respuesta</h2>
        {!state.thread.length ? <p className={styles.muted}>La respuesta aparecerá aquí.</p> : null}
        {state.thread.map((turn) => <div key={turn.id} className={styles.turn}><small>{turn.role === "user" ? "Tú" : turn.agent ?? "AIRI"}</small>{turn.parts.map((part, i) =>
          part.type === "text" ? <p key={i}>{part.text}</p>
            : part.type === "notice" ? <p key={i}>{part.text}</p>
              : part.type === "part" ? <p key={i} className={styles.muted}>Parte del catálogo: {part.key}</p>
                : part.type === "tool" ? <p key={i} className={styles.muted}>{part.name} · {part.status}</p>
                  : null)}</div>)}
        {Object.values(state.cards).map((entry) => <article key={entry.card.id} className={styles.card}>
          <small>{entry.card.agent} · {entry.status}</small><h3>{entry.card.title}</h3>{entry.card.why ? <p>{entry.card.why}</p> : null}
          <ul>{entry.card.scope?.map((scope, i) => <li key={i}>{scope.label}: {scope.value}</li>)}</ul>
          {entry.status === "pending" || entry.status === "error" ? <button type="button" disabled={busy} onClick={() => { void store.approve(entry.card.id).catch((caught) => setError(toApiError(caught).message)); }}>{entry.card.approve ?? "Aprobar"}</button> : null}
          {entry.status === "approved" ? <p>{entry.card.result ?? "Aprobado por ti"}</p> : null}
          {entry.error ? <p role="alert" className={styles.error}>{entry.error}</p> : null}
        </article>)}
      </section>
      {eventsOpen ? <section className={styles.panel} aria-label="Mapa de eventos"><h2>Eventos <span className={styles.muted}>({events.length})</span></h2>
        <ol className={styles.events}>{events.map((event, i) => <li key={i}><details><summary><span>{String(i + 1).padStart(2, "0")}</span> {event.type}</summary><pre>{JSON.stringify(event, null, 2)}</pre></details></li>)}</ol>
      </section> : null}
    </div>
  </section>;
}
