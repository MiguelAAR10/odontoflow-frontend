"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toApiError, useMocks } from "../api";
import { CardSchema, type Card } from "../agui/card";
import { useAgent } from "../agui/useAgent";
import { useShellContext } from "../components/shell/ShellContext";
import { PendingDecisions } from "../home/PendingDecisions";
import { formatMoney } from "../catalog/format";
import { directionSnapshotSchema, occupancy, summarizeDirection, type DirectionSnapshot } from "../../app/(shell)/direccion/model";

const cutFormat = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function DireccionPage() {
  const agent = useAgent();
  const { role } = useShellContext();
  const [fixture, setFixture] = useState<DirectionSnapshot | null>(null);
  const [decisions, setDecisions] = useState<Card[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (useMocks) void Promise.all([import("../agui/sim/fixtures/state.json"), import("../agui/sim/fixtures/cards.json")]).then(([state, cards]) => {
      const parsed = directionSnapshotSchema.parse(state.default[0]);
      const previews = ["p-caja", "p-cobertura", "p-desc"].flatMap(id => cards.default.filter(card => card.id === id)).map(card => CardSchema.parse(card));
      if (active) { setFixture(parsed); setDecisions(previews); }
    }).catch(caught => { if (active) setError(toApiError(caught).message); });
    return () => { active = false; };
  }, []);
  // Once a live snapshot exists, malformed data must never fall back to a fixture.
  const live = directionSnapshotSchema.safeParse(agent.worldState);
  const hasLive = agent.worldState !== null && agent.worldState !== undefined
    && (typeof agent.worldState !== "object" || Object.keys(agent.worldState).length > 0);
  const snapshot = live.success ? live.data : hasLive ? null : fixture;
  const summary = snapshot && snapshot.sedes.length > 0 ? summarizeDirection(snapshot) : null;
  const ask = (intent: string) => {
    setError("");
    void agent.send(intent, { role, view: "direccion", viewing: "Dirección · todas las sedes" }).catch(caught => setError(toApiError(caught).message));
  };
  const pendingSede = snapshot?.sedes.reduce<DirectionSnapshot["sedes"][number] | null>((best, sede) => !best || sede.pending_verification.amount_cents > best.pending_verification.amount_cents ? sede : best, null);
  const incomplete = snapshot?.sedes.filter(sede => !sede.complete) ?? [];
  const maximum = snapshot ? Math.max(1, ...snapshot.sedes.map(sede => sede.collected.amount_cents + sede.pending_verification.amount_cents)) : 1;

  return <div className="direction-page">
    <header className="direction-heading"><div><h1>Dirección · todas las sedes</h1><p>{snapshot ? <>Corte <time dateTime={snapshot.cut_at}>{cutFormat.format(new Date(snapshot.cut_at))}</time> · Lima{useMocks ? " · Datos de demostración" : ""}</> : "Sin corte disponible"}</p></div>
      <button type="button" disabled={agent.working} onClick={() => ask("¿Por qué Miraflores cobra menos hoy?")}>Preguntar sobre esta vista</button>
    </header>
    <p className="direction-note">Primero lo que requiere tu decisión, luego las cifras con fecha de corte y la comparación de sedes. Los pagos por verificar no suman al cobrado.</p>
    {error ? <p role="alert">{error}</p> : null}
    {useMocks ? <section aria-labelledby="direction-decisions-title"><div className="direction-section-heading"><h2 id="direction-decisions-title">Requiere tu decisión</h2><Link href="/aprobaciones">Ver todas</Link></div><ul className="direction-decisions">{decisions.map(card => <li key={card.id}><div><h3>{card.title}</h3><p>{card.why}</p></div><span className={card.level === "borrador" ? "direction-exception" : "direction-stale"}>{card.level === "borrador" ? "Delegable" : "Tu aprobación"}</span><Link href="/aprobaciones">Revisar</Link></li>)}</ul></section> : <PendingDecisions />}
    {!snapshot || !summary ? <section className="direction-empty" aria-live="polite"><h2>{hasLive && !live.success ? "El corte recibido no es válido" : "Todavía no hay datos de las sedes"}</h2><p>Consulta al equipo para obtener un corte de caja y agenda. La ausencia de datos no equivale a cero.</p><button type="button" disabled={agent.working} onClick={() => ask("Compara las sedes")}>Consultar sedes</button></section> : <>
      <section className="direction-conclusion" aria-labelledby="direction-conclusion-title"><h2 id="direction-conclusion-title">{summary.partial ? "La comparación de caja es parcial" : "Caja y agenda al corte"}</h2>
        <p>{pendingSede && pendingSede.pending_verification.amount_cents > 0 ? <>{pendingSede.name} tiene {formatMoney(pendingSede.pending_verification.amount_cents)} por verificar. Ese importe todavía no es cobrado.</> : "No hay importes pendientes de verificar en este corte."} {incomplete.map(sede => `${sede.name}: ${sede.exception}.`).join(" ")}</p>
        <p className="direction-source">Evidencia: Caja por sede y Agenda · capacidad doctor + sillón · corte {cutFormat.format(new Date(snapshot.cut_at))}, Lima.</p>
      </section>
      <section className="direction-figures" aria-label="Cifras al corte">
        <Link href="/caja"><strong className="direction-verified">{formatMoney(summary.collected)}</strong><span>Cobrado verificado</span><small>{summary.partial ? "Total parcial · caja incompleta" : `${snapshot.sedes.length} sedes`}</small></Link>
        <Link href="/caja"><strong>{formatMoney(summary.pending)}</strong><span>Por verificar</span><small>{summary.partial ? "Parcial · no suma al cobrado" : "No suma al cobrado"}</small></Link>
        <Link href="/caja"><strong>{formatMoney(snapshot.overdue.amount_cents)}</strong><span>Saldo vencido al corte</span><small>{snapshot.overdue_patients} pacientes · fecha pactada superada</small></Link>
        <Link href="/agenda"><strong>{snapshot.free_next_7_days_minutes / 60} h</strong><span>Libres próximas 7 jornadas</span><small>Sobre capacidad publicada</small></Link>
      </section>
      <section aria-labelledby="direction-sedes-title"><div className="direction-section-heading"><h2 id="direction-sedes-title"><i className="direction-dot" />Sedes al corte</h2><button type="button" disabled={agent.working} onClick={() => ask("Compara las sedes")}>Comparar con AIRI</button></div>
        <div className="direction-data"><table><caption className="sr-only">Ocupación, caja y frescura por sede</caption><thead><tr><th>Sede</th><th>Ocupación reservada</th><th>Cobrado verificado</th><th>Por verificar</th><th>Excepción y frescura</th></tr></thead><tbody>
          {snapshot.sedes.map(sede => { const percent = occupancy(sede.occupied_minutes, sede.capacity_minutes); return <tr key={sede.name} data-sede={sede.name}>
            <th scope="row">{sede.name}</th><td data-label="Ocupación">{percent === null ? <span className="direction-muted">{sede.capacity_minutes === null ? "Sin capacidad publicada" : "Sin ocupación publicada"}</span> : <>{percent} %<small>{sede.capacity_minutes! - sede.occupied_minutes!} min libres</small></>}</td>
            <td data-label="Cobrado verificado"><Link href="/caja">{formatMoney(sede.collected.amount_cents)}</Link>{!sede.complete ? <small>Parcial</small> : null}</td>
            <td data-label="Por verificar">{formatMoney(sede.pending_verification.amount_cents)}</td>
            <td data-label="Excepción y frescura"><span className={sede.complete ? "direction-exception" : "direction-stale"}>{sede.exception}</span><small>{sede.complete ? "Completo al corte" : "Datos incompletos al corte"}</small></td>
          </tr>; })}
          <tr className="direction-total"><th scope="row">Total{summary.partial ? " (parcial)" : ""}</th><td data-label="Ocupación">{summary.occupancy === null ? "Sin capacidad publicada" : `${summary.occupancy} % · ${summary.published} sedes`}</td><td data-label="Cobrado verificado">{formatMoney(summary.collected)}</td><td data-label="Por verificar">{formatMoney(summary.pending)}</td><td data-label="Nota">Ocupación: suma de minutos, no promedio de porcentajes</td></tr>
        </tbody></table></div>
      </section>
      <section className="direction-comparison" aria-labelledby="direction-comparison-title"><h2 id="direction-comparison-title">Cobrado verificado vs. por verificar</h2><p className="direction-source">Misma escala en soles para todas las sedes. Verde: verificado. Amarillo: por verificar.</p>
        {snapshot.sedes.map(sede => <div className="direction-bar" key={sede.name}><span>{sede.name}{!sede.complete ? " (parcial)" : ""}</span><div className="direction-track" aria-hidden="true"><i style={{ width: `${sede.collected.amount_cents / maximum * 100}%` }} /><b style={{ width: `${sede.pending_verification.amount_cents / maximum * 100}%` }} /></div><span>{formatMoney(sede.collected.amount_cents)}<small>+ {formatMoney(sede.pending_verification.amount_cents)} por verificar</small></span></div>)}
      </section>
      <section className="direction-week"><h2>Revisión semanal</h2><p>No hay una serie semanal publicada en este corte. Revisa la capacidad disponible en Agenda o consulta al equipo.</p><Link href="/agenda">Ver agenda</Link></section>
    </>}
    <style>{`
      .direction-page{max-width:1280px;margin:auto;padding:30px 32px 120px;color:var(--ink);font-size:14px;line-height:1.6;min-width:0}
      .direction-page h1{font:500 clamp(24px,3vw,32px)/1.2 var(--font-display);letter-spacing:-.025em;margin:0}
      .direction-page h2{font:500 19px/1.35 var(--font-display);margin:0 0 10px}
      .direction-heading,.direction-section-heading{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
      .direction-heading p,.direction-source,.direction-muted{color:var(--muted)}.direction-heading p{margin:8px 0 0;font-size:13px}
      .direction-page button{padding:9px 14px;min-height:44px;border:1px solid var(--line-2);border-radius:10px;color:var(--ink);background:var(--surface);font-size:13px}
      .direction-page button:disabled{opacity:.5}.direction-page :is(a,button):focus-visible{outline:2px solid var(--focus);outline-offset:4px}
      .direction-decisions{list-style:none;margin:0;padding:0;background:var(--surface);border:1px solid var(--line);border-radius:14px}.direction-decisions li{display:flex;align-items:center;gap:16px;padding:16px;border-bottom:1px solid var(--line)}.direction-decisions li:last-child{border:0}.direction-decisions li>div{flex:1;min-width:0}.direction-decisions h3{font-size:14px;font-weight:500;margin:0}.direction-decisions p{font-size:12px;color:var(--muted);margin:4px 0 0}.direction-decisions a,.direction-section-heading>a{color:var(--blue-ink);text-underline-offset:4px}.direction-decisions a{display:inline-flex;align-items:center;min-height:44px}.direction-note{border-left:3px solid var(--blue);padding:8px 14px;color:var(--ink-2);margin:22px 0}
      .direction-conclusion{margin:24px 0 16px;padding:18px 20px;background:var(--yellow-soft);border:1px solid var(--line);border-radius:14px}.direction-conclusion p{margin:6px 0}.direction-conclusion .direction-source{color:var(--ink-2);font-size:12px}
      .direction-figures{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;margin:18px 0 26px;border-block:1px solid var(--line)}
      .direction-figures a{display:flex;flex-direction:column;padding:18px;border-right:1px solid var(--line);color:var(--ink);text-decoration:none}.direction-figures a:last-child{border-right:0}
      .direction-figures strong{font:500 clamp(24px,2.5vw,32px)/1.2 var(--font-display);font-variant-numeric:tabular-nums;margin-bottom:8px}.direction-figures .direction-verified{color:var(--green-ink)}
      .direction-page small{display:block;color:var(--muted);font-size:12px}.direction-figures span{font-size:13px}.direction-figures small{margin-top:4px}
      .direction-section-heading{margin-bottom:12px}.direction-section-heading h2{margin:0}.direction-dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--blue);margin-right:8px}
      .direction-data{border:1px solid var(--line);border-radius:14px;background:var(--surface);overflow:hidden}.direction-data table{width:100%;border-collapse:collapse;font-size:13px;text-align:left}
      .direction-data :is(th,td){padding:14px 12px;border-bottom:1px solid var(--line);vertical-align:top;font-weight:400}.direction-data thead{background:var(--surface-2);color:var(--ink-2)}.direction-data tbody th{font-weight:500}
      .direction-data a{color:var(--green-ink);text-underline-offset:4px}.direction-data td{font-variant-numeric:tabular-nums}.direction-data tr:last-child :is(th,td){border:0}.direction-total{background:var(--surface-2)}
      .direction-exception,.direction-stale{display:inline-block;padding:3px 8px;border-radius:7px;background:var(--yellow-soft);color:var(--yellow-ink);font-size:12px}.direction-stale{background:var(--red-soft);color:var(--red-ink)}
      .direction-comparison{margin-top:24px;padding:20px;background:var(--surface);border:1px solid var(--line);border-radius:14px}.direction-source{font-size:12px}
      .direction-bar{display:grid;grid-template-columns:130px minmax(0,1fr) 190px;align-items:center;gap:18px;margin-top:18px;font-size:13px}.direction-bar>span:last-child{text-align:right;font-variant-numeric:tabular-nums}
      .direction-track{display:flex;height:16px;background:var(--surface-2);border-radius:5px;overflow:hidden}.direction-track i{background:#0EA344}.direction-track b{background:var(--yellow)}
      .direction-week{margin-top:26px;border-top:1px solid var(--line);padding-top:20px}.direction-week p{color:var(--muted)}.direction-week a{color:var(--blue-ink)}.direction-empty{margin-top:24px}
      @media(max-width:1100px){.direction-figures{grid-template-columns:repeat(2,minmax(0,1fr))}.direction-data :is(th,td){padding:12px 8px}}
      @media(max-width:700px){.direction-decisions li{flex-wrap:wrap;gap:8px}.direction-decisions li>div{flex-basis:100%}.direction-decisions li>a{margin-left:auto}.direction-page{padding:22px 16px 110px}.direction-heading button{width:100%}.direction-figures{gap:0}.direction-figures a:nth-child(2n){border-right:0}.direction-figures a:nth-child(-n+2){border-bottom:1px solid var(--line)}.direction-figures a{padding:14px 10px}.direction-figures strong{font-size:25px}.direction-data table,.direction-data tbody{display:block}.direction-data thead{display:none}.direction-data tr{display:block;padding:14px;border-bottom:1px solid var(--line)}.direction-data tbody th{display:block;font-size:16px;padding:0 0 8px;border:0}.direction-data td{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:4px 12px;padding:7px 0;border:0;overflow-wrap:anywhere}.direction-data td:before{content:attr(data-label);color:var(--muted)}.direction-data td small{grid-column:2}.direction-bar{grid-template-columns:1fr 1fr;gap:8px}.direction-track{grid-row:2;grid-column:1/-1}.direction-bar>span:last-child{font-size:12px}.direction-bar small{font-size:11px}.direction-conclusion,.direction-comparison{padding:16px}}
    `}</style>
  </div>;
}
