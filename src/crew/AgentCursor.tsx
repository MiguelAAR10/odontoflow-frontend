"use client";

import { animate, motion, useMotionValue } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AgentId } from "../agui/card";
import { agentColor, CREW } from "./AgentDialog";

export interface CursorTarget { selector: string; label: string; fallbackSelector?: string }

/** A visual pointer only: no clicks, approval, scroll or input mutations. */
export function AgentCursor({ agent, target, origin, reduced = false }: {
  agent: AgentId; target: CursorTarget; origin: HTMLElement; reduced?: boolean;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const tag = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [fit, setFit] = useState({ flip: false, offset: 16 });
  const identity = CREW.find(item => item.id === agent)!;

  useEffect(() => {
    let element: HTMLElement | null = null;
    let moving: ReturnType<typeof animate>[] = [];
    let frame = 0;
    let placed = false;
    let last: { x: number; y: number } | null = null;
    const rect = origin.getBoundingClientRect();
    x.set(rect.left + rect.width / 2); y.set(rect.top + rect.height / 2);
    const fitTag = () => {
      const width = tag.current?.offsetWidth ?? 180;
      const flip = x.get() + 16 + width > window.innerWidth - 16;
      const offset = flip ? Math.max(16 - x.get(), -width - 8) : 16;
      setFit(old => old.flip === flip && old.offset === offset ? old : { flip, offset });
    };
    const place = () => {
      try { element = document.querySelector<HTMLElement>(target.selector); } catch { element = null; }
      if (!element && target.fallbackSelector) {
        try { element = document.querySelector<HTMLElement>(target.fallbackSelector); } catch { element = null; }
      }
      const r = element?.getBoundingClientRect();
      const shown = !!r && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth && !document.hidden;
      setVisible(shown);
      if (!shown || !r) return;
      const tx = Math.max(16, Math.min(window.innerWidth - 24, r.left + r.width * .62));
      const ty = Math.max(16, Math.min(window.innerHeight - 48, r.top + r.height * .7));
      if (last?.x === tx && last.y === ty) { fitTag(); return; }
      last = { x: tx, y: ty };
      if (reduced || placed) { moving.forEach(control => control.stop()); x.set(tx); y.set(ty); }
      else {
        moving = [animate(x, tx, { type: "spring", visualDuration: .42, bounce: .15 }), animate(y, ty, { type: "spring", visualDuration: .42, bounce: .15 })];
        placed = true;
      }
      fitTag();
    };
    // Re-measure on layout changes; the label follows the actual spring position.
    const unsubscribe = x.on("change", fitTag);
    const observer = new MutationObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); });
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(place, 120);
    window.addEventListener("scroll", place, true); window.addEventListener("resize", place);
    place();
    return () => {
      moving.forEach(control => control.stop()); unsubscribe(); observer.disconnect(); cancelAnimationFrame(frame);
      clearInterval(timer); window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place);
    };
  }, [origin, target.selector, target.fallbackSelector, reduced, x, y]);

  return createPortal(<motion.div className="airi-agent-cursor" data-agent={agent} aria-hidden="true"
    style={{ ...agentColor(agent), ...(reduced ? { left: x, top: y } : { x, y }), opacity: visible ? 1 : 0 }}>
    <svg viewBox="0 0 24 24" width="24" height="24"><path d="M3 2l7 19 2.6-7.6L20 11z" /></svg>
    <span ref={tag} className="airi-agent-cursor__tag" data-flip={fit.flip} style={{ left: fit.offset }}><b>{identity.name}</b> · {target.label}</span>
  </motion.div>, document.body);
}
