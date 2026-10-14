import { z } from "zod";
import type { AgentId, CardEntry } from "../agui/card";
import type { RunState } from "../agui/reducer";

const canvasSchema = z.object({
  cardIds: z.array(z.string().min(1)),
  arrows: z.array(z.object({ from: z.string(), to: z.string(), label: z.string() })).default([]),
});
export interface CanvasProjection {
  cards: CardEntry[];
  arrow: { from: string; to: string; label: string } | null;
  agent: AgentId;
}
/** Project only explicit canvas metadata, using the store's current decisions. */
export function canvasProjection(state: Pick<RunState, "thread" | "cards">): CanvasProjection {
  for (const turn of [...state.thread].reverse()) {
    for (const part of [...turn.parts].reverse()) {
      if (part.type !== "part" || part.key !== "canvas") continue;
      const parsed = canvasSchema.safeParse(part.props);
      if (!parsed.success) return { cards: [], arrow: null, agent: turn.agent ?? "airi" };
      const ids = new Set(parsed.data.cardIds.filter(id => state.cards[id]));
      return {
        cards: [...ids].map(id => state.cards[id]),
        arrow: parsed.data.arrows.find(arrow => arrow.from !== arrow.to && ids.has(arrow.from) && ids.has(arrow.to)) ?? null,
        agent: turn.agent ?? "airi",
      };
    }
  }
  return { cards: [], arrow: null, agent: "airi" };
}
// Inks keep the agent's hue legible against either workspace theme.
export const agentStrokeToken = (agent: AgentId) => ({
  cepillo: "--blue-ink", pasta: "--red-ink", hilo: "--yellow-ink",
  enjuague: "--green-ink", espejo: "--purple-ink", airi: "--ag-airi", escudo: "--ag-escudo",
})[agent];
export const cardPosition = (index: number) => ({ x: index === 0 ? 0 : 470, y: index < 2 ? 0 : (index - 1) * 420 });
export function overlayTransform(element: { x: number; y: number; angle: number }, state: { scrollX: number; scrollY: number; zoom: { value: number } }) {
  return `translate(${(element.x + state.scrollX) * state.zoom.value}px, ${(element.y + state.scrollY) * state.zoom.value}px) scale(${state.zoom.value}) rotate(${element.angle}rad)`;
}
export function arrowGeometry(from: { x: number; y: number; width: number; height: number }, to: { x: number; y: number; width: number; height: number }) {
  const x = from.x + from.width + 12;
  const y = from.y + from.height / 2;
  return { x, y, points: [[0, 0], [to.x - 12 - x, to.y + to.height / 2 - y]] as [number, number][] };
}
