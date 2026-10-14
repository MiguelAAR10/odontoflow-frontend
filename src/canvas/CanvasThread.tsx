"use client";
import { useRouter } from "next/navigation";
import { CatalogRenderer } from "../catalog/registry";
import { useAgent } from "../agui/useAgent";
import { useShellContext } from "../components/shell/ShellContext";
import { threadDestination, threadItem } from "../components/shell/Thread";

/** Same conversation and catalog as the shell. Canvas metadata is consumed by
 * the scene, so the dialog gives a navigation hint instead of a Fallback. */
export function CanvasThread() {
  const agent = useAgent();
  const { role } = useShellContext();
  const router = useRouter();
  return <div className="airi-thread" data-thread-location="canvas">
    {agent.thread.map(turn => <section className={`airi-turn airi-turn--${turn.role}`} key={turn.id} data-turn={turn.id}>
      {turn.role === "user" ? <p className="airi-turn__question">{turn.parts.flatMap(part => part.type === "text" ? [part.text] : []).join("")}</p>
        : turn.parts.map((part, index) => <CatalogRenderer key={index} item={part.type === "part" && part.key === "canvas"
          ? { type: "Notice", props: { text: "Revisa las tarjetas en el lienzo o en «Ver lista»." } }
          : threadItem(part, turn.agent, agent.cards)} handlers={{
          onApprove: card => agent.approve(card.id),
          onOpen: target => { const path = threadDestination(target, role); if (!path) throw new Error("Esta vista no está disponible para tu rol."); router.push(path); },
          onChoose: option => agent.send(option, { role, view: "lienzo", viewing: "Lienzo" }),
        }} />)}
    </section>)}
    {agent.run.status !== "idle" ? <CatalogRenderer item={{ type: "Status", props: { text: agent.run.what, state: agent.run.status, agent: agent.run.agent, plan: agent.run.plan } }} handlers={{ onStop: agent.stop }} /> : null}
  </div>;
}
