"use client";

import { usePathname, useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import { z } from "zod";
import { CatalogRenderer } from "../../catalog/registry";
import type { ThreadPart } from "../../agui/reducer";
import { useAgent } from "../../agui/useAgent";
import { getNavigation, navigationTitle, type ShellRole } from "../../nav";
import { useShellContext } from "./ShellContext";

const targets: Record<string, string> = { home: "/home", agenda: "/agenda", caja: "/caja", bandeja: "/aprobaciones", decisiones: "/aprobaciones", direccion: "/direccion", turno: "/mi-turno", jornada: "/jornada", ficha: "/atencion", "doctor-brief": "/atencion", canvas: "/lienzo", lienzo: "/lienzo", actividad: "/agente" };
export function threadDestination(target: string, role: ShellRole) {
  const path = targets[target];
  return path && getNavigation(role).some(item => item.to === path) ? path : null;
}

/** Optional platform animation; state changes always work without it. */
export function moveThread(update: () => void) {
  const supported = typeof document !== "undefined" && typeof document.startViewTransition === "function"
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!supported) { update(); return; }
  const transition = document.startViewTransition(() => { flushSync(update); });
  void transition.finished.catch(() => { /* A superseding navigation may skip the animation. */ });
}

export function threadItem(part: ThreadPart, agent: string | null, cards: ReturnType<typeof useAgent>["cards"]) {
  switch (part.type) {
    case "text": return { type: "Say", props: { text: part.text, agent: agent ?? "airi" } };
    case "notice": return { type: "Notice", props: { text: part.text } };
    case "card": {
      const entry = cards[part.cardId];
      return entry ? { type: "Card", props: { card: entry.card, status: entry.status, error: entry.error, loadingReason: entry.loadingReason } } : { type: "Fallback", props: {} };
    }
    case "tool": return { type: "Notice", props: { text: part.status === "working" ? "Consultando los datos…" : part.status === "done" ? "Consulta de datos completada." : "Consulta detenida." } };
    case "part": {
      // Source hints are data, never selectors to execute or arbitrary URLs.
      if (part.key === "pointer" && z.object({ points: z.array(z.object({ selector: z.string(), label: z.string().nullable() })) }).safeParse(part.props).success)
        return { type: "Notice", props: { text: "Revisa el alcance y confirma con el botón de la tarjeta." } };
      if (part.key === "doctor-brief" && z.object({ briefReady: z.literal(true) }).safeParse(part.props).success)
        return { type: "Act", props: { label: "Atención", target: "ficha" } };
      return { type: part.key, props: part.props };
    }
  }
}

export function Thread({ location = "center" }: { location?: "center" | "panel" }) {
  const agent = useAgent();
  const { role } = useShellContext();
  const router = useRouter();
  const pathname = usePathname();
  if (location === "center" && agent.docked) return null;
  const onOpen = (target: string) => {
    const path = threadDestination(target, role);
    if (!path) throw new Error("Esta vista no está disponible para tu rol.");
    moveThread(() => { agent.openPanel(); router.push(path); });
  };
  const destinations = Array.from(new Set(Object.values(agent.cards).map(entry =>
    ({ cepillo: "agenda", hilo: "bandeja", enjuague: "caja", pasta: "caja", espejo: "ficha", airi: "bandeja", escudo: "actividad" })[entry.card.agent]
  ))).filter(target => threadDestination(target, role));
  return <div className="airi-thread" data-thread-location={location} style={{ viewTransitionName: "airi-chat" }}>
    {agent.thread.map(turn => <section className={`airi-turn airi-turn--${turn.role}`} key={turn.id} data-turn={turn.id}>
      {turn.role === "user" ? <p className="airi-turn__question">{turn.parts.flatMap(part => part.type === "text" ? [part.text] : []).join("")}</p>
        : turn.parts.map((part, index) => <CatalogRenderer key={index} item={threadItem(part, turn.agent, agent.cards)} handlers={{ onApprove: card => agent.approve(card.id), onOpen, onChoose: option => agent.send(option, { role, view: pathname.replace(/^\//, ""), viewing: navigationTitle(pathname, role) }) }} />)}
    </section>)}
    {destinations.map(target => <CatalogRenderer key={target} item={{ type: "Act", props: { label: ({ agenda: "Agenda", bandeja: "Bandeja", caja: "Caja", ficha: "Atención", actividad: "Rastro" } as Record<string, string>)[target], target } }} handlers={{ onOpen }} />)}
    {agent.run.status !== "idle" ? <CatalogRenderer item={{ type: "Status", props: { text: agent.run.what || (agent.working ? "Entendiendo tu consulta…" : "Consulta terminada."), state: agent.run.status, agent: agent.run.agent, plan: agent.run.plan } }} handlers={{ onStop: agent.stop }} /> : null}
    <style>{`
      .airi-thread{min-width:0;overflow-wrap:anywhere;display:grid;gap:14px}
      .airi-turn{min-width:0;display:grid;gap:10px}.airi-turn--user{justify-items:end}
      .airi-turn__question{margin:0;max-width:92%;padding:10px 16px;background:var(--surface-2);color:var(--ink);border-radius:16px 16px 4px 16px;white-space:pre-wrap}
      .airi-thread .airi-catalog{min-width:0;max-width:100%}
      ::view-transition-group(airi-chat){animation-duration:.3s}
      @media(prefers-reduced-motion:reduce){::view-transition-group(airi-chat){animation-duration:0s}}
    `}</style>
  </div>;
}
