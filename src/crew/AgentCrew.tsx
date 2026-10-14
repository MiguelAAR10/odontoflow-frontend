"use client";

import { AnimatePresence, MotionConfig, motion, useAnimate } from "motion/react";
import { memo, useEffect, useRef, useState } from "react";
import { agentStore, useAgentStore, type AgentStore } from "../agui/store";
import type { AgentId } from "../agui/card";
import type { RunState } from "../agui/reducer";
import { Character } from "./characters/Character";
import { AgentDialog, agentColor, CREW, STATUS } from "./AgentDialog";
import { AgentCursor, type CursorTarget } from "./AgentCursor";

const snapshot = (state: RunState) => state;
const CrewCharacter = memo(Character);
const FORWARD = { type: "spring", stiffness: 520, damping: 24, mass: .9 } as const;
const BACK = { type: "spring", visualDuration: .42, bounce: .45 } as const;

export function AgentCrew({ store = agentStore, onOpenCard }: { store?: AgentStore; onOpenCard?: () => void }) {
  return <MotionConfig reducedMotion="user"><Crew store={store} onOpenCard={onOpenCard} /></MotionConfig>;
}

function Crew({ store, onOpenCard }: { store: AgentStore; onOpenCard?: (() => void) | undefined }) {
  const state = useAgentStore(snapshot, store);
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const [reduced, setReduced] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [visible, setVisible] = useState(true);
  const [hovered, setHovered] = useState<AgentId | null>(null);
  const [dialog, setDialog] = useState<{ agent: AgentId; trigger: HTMLButtonElement } | null>(null);
  const [doneRest, setDoneRest] = useState(false);
  const previous = useRef<AgentId[]>([]);
  const buttons = useRef<Partial<Record<AgentId, HTMLButtonElement>>>({});
  const focusCleanup = useRef<(() => void) | null>(null);

  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const small = matchMedia("(max-width: 760px)");
    let onscreen = true;
    const sync = () => { setReduced(reduce.matches); setMobile(small.matches); setVisible(onscreen && !document.hidden); };
    const observer = new IntersectionObserver(entries => { onscreen = entries[0]?.isIntersecting ?? false; sync(); });
    if (scope.current) observer.observe(scope.current);
    sync(); reduce.addEventListener("change", sync); small.addEventListener("change", sync); document.addEventListener("visibilitychange", sync);
    return () => { observer.disconnect(); reduce.removeEventListener("change", sync); small.removeEventListener("change", sync); document.removeEventListener("visibilitychange", sync); };
  }, [scope]);
  useEffect(() => {
    setDoneRest(false);
    if (state.run.status !== "done") return;
    const timer = setTimeout(() => setDoneRest(true), 1700);
    return () => clearTimeout(timer);
  }, [state.run.id, state.run.status]);
  useEffect(() => { setDialog(null); setHovered(null); }, [state.threadId]);
  useEffect(() => () => focusCleanup.current?.(), []);

  const primary = CREW.find(item => state.agents[item.id] === "needs-you")?.id
    ?? (state.agents[state.run.agent] !== "idle" && !(doneRest && state.agents[state.run.agent] === "done") ? state.run.agent : null);
  const active = primary ?? (dialog ? null : hovered);
  const secondary = primary && state.run.status === "working" && state.run.agent !== primary ? state.run.agent : null;

  useEffect(() => {
    const faces = scope.current?.querySelectorAll<HTMLElement>(".airi-crew-face");
    const controls: ReturnType<typeof animate>[] = [];
    const selected = [active, secondary].filter((id): id is AgentId => id !== null);
    const returning = selected.length < 2 ? previous.current.find(id => !selected.includes(id)) : undefined;
    previous.current = selected;
    // Cancel previous springs before selecting the next pair. A pending agent
    // and a working agent share the budget; rapid handoffs cannot accumulate.
    faces?.forEach(face => { if (!selected.includes(face.dataset.face as AgentId) && face.dataset.face !== returning) face.style.transform = "none"; });
    if (reduced || !visible) { faces?.forEach(face => { face.style.transform = "none"; }); return; }
    if (returning) {
      const face = scope.current?.querySelector<HTMLElement>(`[data-face="${returning}"]`);
      if (face) controls.push(animate(face, { y: 0, scale: 1, rotate: 0 }, BACK));
    }
    for (const id of selected) {
      const face = scope.current?.querySelector<HTMLElement>(`[data-face="${id}"]`);
      if (face) controls.push(animate(face, primary ? { y: mobile ? 0 : 7, scale: mobile ? 1.16 : 1.24, rotate: 0 }
        : { y: 3, scale: 1.14, rotate: -6 }, primary ? FORWARD : { type: "spring", visualDuration: .22, bounce: .3 }));
    }
    let breathing = false;
    let index = 0;
    const timer = !active ? setInterval(() => {
      if (breathing || controls.some(control => control.state === "running")) return;
      const identity = CREW[index++ % CREW.length]!;
      const face = scope.current?.querySelector<HTMLElement>(`[data-face="${identity.id}"]`);
      if (!face) return;
      breathing = true;
      const control = animate(face, { scale: [1, 1.06, 1] }, { duration: 1.7, ease: "easeInOut" });
      controls.push(control);
      void control.then(() => { breathing = false; const at = controls.indexOf(control); if (at >= 0) controls.splice(at, 1); });
    }, 2300) : null;
    return () => { if (timer) clearInterval(timer); controls.forEach(control => control.stop()); };
  }, [active, secondary, primary, mobile, reduced, visible, animate, scope]);

  const card = Object.values(state.cards).filter(entry => entry.card.agent === primary).at(-1)?.card;
  let target: CursorTarget | null = card ? { selector: `[data-card=${JSON.stringify(card.id)}]`, label: state.agents[primary!] === "needs-you" ? "Revisa y aprueba tú" : "Preparando la tarjeta" } : null;
  const parts = state.thread.filter(turn => turn.agent === primary).flatMap(turn => turn.parts);
  const pointer = parts.filter(part => part.type === "part" && part.key === "pointer").at(-1);
  if (pointer?.type === "part" && pointer.props && typeof pointer.props === "object" && "points" in pointer.props && Array.isArray(pointer.props.points)) {
    const point: unknown = pointer.props.points.at(-1);
    if (point && typeof point === "object" && "selector" in point && typeof point.selector === "string") {
      target = { selector: point.selector, label: "label" in point && typeof point.label === "string" ? point.label : "Revisa y aprueba tú", ...(target ? { fallbackSelector: target.selector } : {}) };
    }
  }
  // Cursor needs a mounted origin; refs are populated before streamed targets arrive.
  const origin = primary ? buttons.current[primary] : undefined;

  const openCard = (cardId: string) => {
    store.setPanelOpen(true); onOpenCard?.();
    focusCleanup.current?.();
    let timer: ReturnType<typeof setTimeout>;
    const find = () => {
      const element = [...document.querySelectorAll<HTMLElement>("[data-card]")].find(el => el.dataset.card === cardId && el.getBoundingClientRect().width > 0);
      if (!element) return;
      element.scrollIntoView({ block: "center", behavior: reduced ? "instant" : "smooth" });
      if (!element.hasAttribute("tabindex")) element.setAttribute("tabindex", "-1");
      element.focus({ preventScroll: true });
      observer.disconnect(); clearTimeout(timer);
    };
    const observer = new MutationObserver(find);
    observer.observe(document.body, { childList: true, subtree: true });
    timer = setTimeout(() => observer.disconnect(), 2000);
    // Run after the dialog unmount restores its trigger focus.
    const frame = requestAnimationFrame(find);
    focusCleanup.current = () => { observer.disconnect(); clearTimeout(timer); cancelAnimationFrame(frame); };
  };

  return <div ref={scope} className="airi-crew" data-reduced={reduced}>
    <style>{CREW_STYLES}</style>
    {CREW.map(identity => <button key={identity.id} ref={element => { if (element) buttons.current[identity.id] = element; }}
      className="airi-crew-agent" type="button" data-agent={identity.id} data-state={state.agents[identity.id]}
      data-motion={visible && !reduced && (primary === identity.id || secondary === identity.id) ? "active" : "quiet"} style={agentColor(identity.id)}
      aria-label={`${identity.name}, ${identity.role}: ${STATUS[state.agents[identity.id]]}. Ver su rastro`}
      aria-haspopup="dialog" aria-expanded={dialog?.agent === identity.id}
      onPointerEnter={event => { if (event.pointerType === "mouse" && matchMedia("(hover: hover) and (pointer: fine)").matches) setHovered(identity.id); }}
      onPointerLeave={() => setHovered(null)}
      onClick={event => { setHovered(null); setDialog({ agent: identity.id, trigger: event.currentTarget }); }}>
      <span className="airi-crew-face" data-face={identity.id}><CrewCharacter agent={identity.id} state={state.agents[identity.id]} decorative gaze={false} size={30} /></span>
      <span className="airi-crew-dot" aria-hidden="true" />
      {hovered === identity.id && !primary && !dialog && <span className="airi-crew-tip" aria-hidden="true"><b>{identity.name}</b> · {identity.role}</span>}
    </button>)}
    <AnimatePresence mode="wait">{primary && <motion.span className="airi-crew-status" key={`${primary}:${state.agents[primary]}`} aria-hidden="true"
      style={{ ...agentColor(primary), left: `calc((var(--crew-size) + var(--crew-gap)) * ${CREW.findIndex(item => item.id === primary)} + var(--crew-size) / 2)` }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .15 }}>{STATUS[state.agents[primary]]}</motion.span>}</AnimatePresence>
    <span className="airi-crew-now" role="status">{primary ? `${CREW.find(item => item.id === primary)!.name} · ${STATUS[state.agents[primary]]}` : "en reposo"}</span>
    {dialog && <AgentDialog agent={dialog.agent} state={state} trigger={dialog.trigger} onClose={() => setDialog(null)} onOpenCard={openCard} />}
    {primary && origin && target && !dialog && visible && (state.run.status === "working" || state.agents[primary] === "needs-you") && <AgentCursor key={`${state.run.id}:${primary}`} agent={primary} origin={origin} target={target} reduced={reduced} />}
  </div>;
}

// Scoped styles live with the owned component; the character stylesheet is A6's.
const CREW_STYLES = `
.airi-crew { --crew-size:36px; --crew-gap:4px; display:flex; align-items:center; gap:var(--crew-gap); height:100%; position:relative; min-width:0; }
.airi-crew-agent { position:relative; width:var(--crew-size); height:var(--crew-size); padding:0; border:0; background:transparent; border-radius:50%; flex:none; cursor:pointer; }
.airi-crew .airi-crew-face, .airi-crew-dialog .airi-crew-face { display:block; width:100%; height:100%; box-sizing:border-box; border-radius:50%; background:var(--surface); border:2px solid var(--line); padding:2px; }
.airi-crew-face > svg { width:100%; height:100%; display:block; overflow:visible; }
.airi-crew-agent[data-state]:not([data-state="idle"]) .airi-crew-face { border-color:var(--crew-color); }
.airi-crew-agent:focus-visible { outline:2px solid var(--focus); outline-offset:3px; }
.airi-crew-dot { position:absolute; right:-1px; bottom:-1px; width:11px; height:11px; border-radius:50%; background:var(--crew-color); border:2px solid var(--surface); pointer-events:none; }
.airi-crew-status, .airi-crew-tip { position:absolute; left:50%; top:calc(100% + 9px); translate:-50% 0; z-index:3; white-space:nowrap; pointer-events:none; font-size:13px; line-height:1.3; padding:5px 9px; border-radius:99px; background:var(--crew-color); color:var(--crew-text); box-shadow:var(--shadow); }
.airi-crew-tip { z-index:4; background:var(--ink); color:var(--surface); border-radius:10px; }
.airi-crew-status { top:calc(50% + var(--crew-size) / 2 + 9px); }
.airi-crew-now { position:absolute; width:1px; height:1px; clip-path:inset(50%); overflow:hidden; }
.airi-crew-agent[data-motion="quiet"] .personaje *, .airi-crew .personaje.is-idle * { animation:none!important; transition:none!important; }
.airi-crew-dialog .personaje * { animation:none!important; transition:none!important; }
.airi-crew-dialog { position:fixed; z-index:2100; margin:0; width:min(340px,calc(100vw - 32px)); max-height:calc(100dvh - 32px); overflow:auto; box-sizing:border-box; background:var(--surface); color:var(--ink); border:1px solid var(--line-2); border-top:3px solid var(--crew-color); border-radius:14px; box-shadow:var(--shadow); padding:12px 14px; font:14px var(--font-text); }
.airi-crew-dialog::backdrop { background:transparent; }
.airi-crew-dialog__header { display:flex; align-items:center; gap:10px; }
.airi-crew-dialog__header .airi-crew-face { width:40px; height:40px; flex:none; border-color:var(--crew-color); }
.airi-crew-dialog__header strong { display:block; font:600 16px var(--font-display); }
.airi-crew-dialog__header small, .airi-crew-muted { color:var(--muted); font-size:13px; }
.airi-crew-dialog__header button { margin-left:auto; font-size:22px; width:32px; height:32px; padding:0; border:0; background:transparent; color:var(--ink); cursor:pointer; }
.airi-crew-dialog p { margin:10px 0; line-height:1.5; }
.airi-crew-dialog ul { list-style:none; margin:0; padding:0; border-top:1px solid var(--line); }
.airi-crew-dialog li { display:grid; grid-template-columns:48px 1fr; gap:6px; padding:7px 0; border-bottom:1px solid var(--line); font-size:13px; }
.airi-crew-dialog time { color:var(--muted); font-variant-numeric:tabular-nums; }
.airi-crew-dialog__actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
.airi-crew-dialog__actions button, .airi-crew-dialog__actions a { display:inline-flex; align-items:center; min-height:36px; padding:6px 10px; border:1px solid var(--line-2); border-radius:9px; background:var(--surface); color:var(--ink); font:inherit; text-decoration:none; cursor:pointer; }
.airi-crew-dialog__actions button { background:var(--btn); color:var(--btn-ink); border-color:var(--btn); }
.airi-crew-dialog :focus-visible { outline:2px solid var(--focus); outline-offset:2px; }
.airi-agent-cursor { position:fixed; left:0; top:0; z-index:1900; pointer-events:none; color:var(--crew-color); }
.airi-agent-cursor svg { display:block; fill:var(--crew-color); stroke:var(--surface); stroke-width:1.5; }
.airi-agent-cursor__tag { position:absolute; top:20px; max-width:calc(100vw - 32px); width:max-content; box-sizing:border-box; padding:5px 9px; border-radius:9px; background:var(--crew-color); color:var(--crew-text); font:13px var(--font-text); line-height:1.4; overflow-wrap:anywhere; box-shadow:var(--shadow); }
@media (hover:hover) and (pointer:fine) { .airi-crew-agent:hover .airi-crew-face { border-color:var(--crew-color); } }
@media (max-width:1180px) { .airi-crew { --crew-size:32px; --crew-gap:2px; } }
@media (max-width:760px) {
  .airi-shell .shell-crew { padding-right:116px; }
  .airi-shell .shell-location-select { width:92px; }
  .airi-crew { flex:1; --crew-size:28px; --crew-gap:4px; }
  .airi-crew-dot { width:10px; height:10px; }
  .airi-crew-status, .airi-crew-tip { display:none; }
  .airi-crew-now { position:static; clip-path:none; width:auto; height:auto; margin-left:auto; min-width:0; font-size:13px; color:var(--ink-2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
}
@media (max-width:460px) { .airi-crew { --crew-size:24px; --crew-gap:2px; } }
@media (prefers-reduced-motion:reduce) {
  .airi-crew .personaje *, .airi-crew-dialog .personaje * { animation:none!important; transition:none!important; }
  .airi-crew .airi-crew-face, .airi-agent-cursor { transform:none!important; }
}
`;
