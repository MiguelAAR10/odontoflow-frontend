"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Character } from "./characters/Character";
import { agentColor, CREW } from "./AgentDialog";

const SESSION_KEY = "airi.intro.v1";
const PRESENTATION_START = 350;
const PRESENTATION_MS = 380;

/** Presentation only: no source, business fixtures or automatic audio unlock. */
export function Intro() {
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [presenting, setPresenting] = useState(-1);
  const dialog = useRef<HTMLDialogElement>(null);
  const orbit = useRef<HTMLDivElement>(null);
  const finished = useRef(false);
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* Still once for this shell mount. */ }
    setVisible(false);
  }, []);

  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(SESSION_KEY) === "1"; } catch { /* Storage is optional. */ }
    if (seen && new URLSearchParams(window.location.search).get("intro") !== "1") return;
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setVisible(true);
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (!visible || !element) return;
    element.showModal();
    element.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timers: ReturnType<typeof setTimeout>[] = [];
    // One shared orbit spins, then individual introductions animate at most
    // the incoming/outgoing disc. Character animations themselves stay quiet.
    const animation = reduced ? null : orbit.current?.animate([
      { transform: "rotate(-1turn)" }, { transform: "rotate(0turn)" },
    ], { duration: 1050, easing: "cubic-bezier(.2,.8,.2,1)" });
    if (!reduced) {
      CREW.forEach((_, index) => timers.push(setTimeout(() => setPresenting(index), PRESENTATION_START + index * PRESENTATION_MS)));
      timers.push(setTimeout(() => setPresenting(CREW.length), PRESENTATION_START + CREW.length * PRESENTATION_MS));
    }
    timers.push(setTimeout(finish, reduced ? 1300 : 3200));
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        event.preventDefault(); element.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true }); return;
      }
      if (event.key !== "Escape" && event.key !== "Enter") return;
      event.preventDefault(); event.stopImmediatePropagation(); finish();
    };
    window.addEventListener("keydown", keyboard, true);
    return () => {
      timers.forEach(clearTimeout); animation?.cancel();
      window.removeEventListener("keydown", keyboard, true);
      element.close(); document.body.style.overflow = overflow;
      document.querySelector<HTMLInputElement>("#airi-home-input")?.focus({ preventScroll: true });
    };
  }, [visible, reduced, finish]);

  if (!visible) return null;
  const agent = CREW[presenting];
  return <dialog ref={dialog} className="airi-intro" aria-label="AIRI y su equipo" aria-modal="true"
    data-reduced={reduced} onCancel={event => { event.preventDefault(); finish(); }}>
    <style>{INTRO_STYLES}</style>
    <div className="airi-intro__stage">
      <div ref={orbit} className="airi-intro__orbit" aria-hidden="true">
        {CREW.map((identity, index) => <div key={identity.id} className="airi-intro__agent" data-intro-agent={identity.id}
          data-presenting={!reduced && presenting === index} style={{ ...agentColor(identity.id), "--angle": `${index / CREW.length * 360}deg` } as CSSProperties}>
          <div className="airi-intro__disc"><Character agent={identity.id} decorative gaze={false} state="idle" size={76} /></div>
          {reduced && <span className="airi-intro__name">{identity.name}</span>}
        </div>)}
      </div>
      <img className="airi-intro__logo" src="/marca/airi-lockup-bn.svg" width="150" height="48" alt="AIRI" />
    </div>
    <p className="airi-intro__caption" style={agent ? agentColor(agent.id) : undefined}>
      <span className="airi-intro__dot" aria-hidden="true" />
      <span>{reduced ? <><b>AIRI y su equipo</b> · 7 agentes listos</> : agent ? <><b>{agent.name}</b> · {agent.role}</>
        : presenting === CREW.length ? <><b>Listos</b> · te esperan en el Inicio</> : <><b>AIRI</b> · preparando el equipo</>}</span>
    </p>
    <div className="airi-intro__progress" aria-hidden="true"><span style={{ transform: `scaleX(${reduced ? 1 : Math.min(1, (presenting + 1) / CREW.length)})` }} /></div>
    <button className="airi-intro__skip" type="button" onClick={finish}>Omitir<kbd aria-hidden="true">Esc</kbd><span className="sr-only"> presentación</span></button>
  </dialog>;
}

const INTRO_STYLES = `
.airi-intro { --intro-radius:150px; --intro-size:76px; position:fixed; inset:0; margin:0; width:100vw; height:100dvh; max-width:none; max-height:none; box-sizing:border-box; border:0; padding:16px; background:var(--bg); color:var(--ink); }
.airi-intro[open] { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:18px; }
.airi-intro::backdrop { background:var(--bg); }
.airi-intro__stage { position:relative; width:calc(var(--intro-radius) * 2 + var(--intro-size) * 1.7); height:calc(var(--intro-radius) * 2 + var(--intro-size) * 1.7); flex:none; }
.airi-intro__orbit { position:absolute; inset:0; }
.airi-intro__agent { position:absolute; left:50%; top:50%; width:var(--intro-size); height:var(--intro-size); margin:calc(var(--intro-size) / -2); transform:rotate(var(--angle)) translateY(calc(var(--intro-radius) * -1)) rotate(calc(var(--angle) * -1)); }
.airi-intro__disc { box-sizing:border-box; width:100%; height:100%; border-radius:50%; padding:6px; background:var(--surface); border:2px solid var(--line); box-shadow:var(--shadow); opacity:.65; transition:transform 200ms cubic-bezier(.2,.8,.2,1),opacity 200ms; }
.airi-intro__disc > svg { width:100%; height:100%; display:block; overflow:visible; }
.airi-intro .personaje * { animation:none!important; transition:none!important; }
.airi-intro__agent[data-presenting="true"] .airi-intro__disc { transform:scale(1.42); opacity:1; border-color:var(--crew-color); }
.airi-intro__logo { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); object-fit:contain; }
[data-theme="dark"] .airi-intro__logo { filter:invert(1); }
.airi-intro__caption { display:flex; align-items:center; justify-content:center; gap:8px; margin:0; min-height:26px; font:17px var(--font-text); color:var(--ink-2); text-align:center; }
.airi-intro__caption b { color:var(--ink); font:600 17px var(--font-display); }
.airi-intro__dot { width:10px; height:10px; border-radius:50%; background:var(--crew-color,var(--line-2)); flex:none; }
.airi-intro__progress { width:168px; height:3px; border-radius:3px; overflow:hidden; background:var(--line); }
.airi-intro__progress span { display:block; width:100%; height:100%; background:var(--ink); transform-origin:left; transition:transform 350ms; }
.airi-intro__skip { position:absolute; bottom:max(32px,env(safe-area-inset-bottom)); left:50%; transform:translateX(-50%); border:1px solid var(--line-2); background:var(--surface); color:var(--ink-2); padding:8px 16px; min-height:44px; border-radius:10px; font:14px var(--font-text); cursor:pointer; }
.airi-intro__skip { display:flex; align-items:center; gap:6px; }
.airi-intro__skip kbd { font:11px var(--font-text); border:1px solid var(--line-2); border-radius:4px; padding:2px 4px; color:var(--muted); }
.airi-intro__skip:focus-visible { outline:2px solid var(--focus); outline-offset:3px; }
.airi-intro__name { position:absolute; left:50%; top:calc(100% + 6px); transform:translateX(-50%); font:13px var(--font-text); white-space:nowrap; color:var(--ink-2); }
.airi-intro[data-reduced="true"] .airi-intro__disc { opacity:1; transition:none; }
.airi-intro[data-reduced="true"] .airi-intro__progress span { transition:none; }
@media(max-width:760px),(max-height:650px) { .airi-intro { --intro-radius:104px; --intro-size:58px; } .airi-intro__caption,.airi-intro__caption b { font-size:15.5px; } .airi-intro__logo { width:120px; } }
@media(prefers-reduced-motion:reduce) { .airi-intro__disc,.airi-intro__progress span { transition:none; } }
`;
