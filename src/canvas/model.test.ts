import { describe, expect, it } from "vitest";
import { createInitialState, type ThreadTurn } from "../agui/reducer";
import type { CardEntry } from "../agui/card";
import { agentStrokeToken, canvasProjection, overlayTransform, arrowGeometry, cardPosition } from "./model";

const entry = (id: string): CardEntry => ({ card: { id, agent: "cepillo", level: "auto", state: "ready", title: id, body: "" }, status: "done", runId: "run", error: null });
const turn = (props: unknown): ThreadTurn => ({ id: "canvas", role: "assistant", agent: "cepillo", parts: [{ type: "part", key: "canvas", props }] });
describe("proyección del lienzo", () => {
  it("no coloca tarjetas ajenas al lienzo ni inventa datos en un hilo vacío", () => {
    const state = createInitialState();
    state.cards.other = entry("other");
    expect(canvasProjection(state)).toEqual({ cards: [], arrow: null, agent: "airi" });
  });
  it("proyecta solo ids existentes, sin duplicados, y una relación válida del agente", () => {
    const state = createInitialState();
    state.cards = { a: entry("a"), b: entry("b"), c: entry("c") };
    state.thread = [turn({ cardIds: ["a", "b", "a", "missing", "c"], arrows: [{ from: "missing", to: "b", label: "inválida" }, { from: "a", to: "b", label: "hueco" }, { from: "b", to: "c", label: "oferta" }] })];
    const view = canvasProjection(state);
    expect(view.cards).toEqual([state.cards.a, state.cards.b, state.cards.c]);
    expect(view.arrow).toEqual({ from: "a", to: "b", label: "hueco" });
    expect(view.agent).toBe("cepillo");
  });
  it("el último lienzo sustituye al anterior y descarta metadatos malformados", () => {
    const state = createInitialState();
    state.cards = { a: entry("a"), b: entry("b") };
    state.thread = [turn({ cardIds: ["a"], arrows: [] }), turn({ cardIds: ["b"], arrows: [] })];
    expect(canvasProjection(state).cards).toEqual([state.cards.b]);
    state.thread.push(turn({ cardIds: "a" }));
    expect(canvasProjection(state).cards).toEqual([]);
  });
  it("mantiene la actualización de aprobación del store", () => {
    const state = createInitialState();
    const approved = { ...entry("a"), status: "approved" as const };
    state.cards.a = approved;
    state.thread = [turn({ cardIds: ["a"], arrows: [] })];
    expect(canvasProjection(state).cards[0]).toBe(approved);
  });
});
describe("geometría", () => {
  it("usa tintas de la misma familia de color del agente en ambos temas", () => {
    expect(agentStrokeToken("cepillo")).toBe("--blue-ink");
    expect(agentStrokeToken("pasta")).toBe("--red-ink");
    expect(agentStrokeToken("hilo")).toBe("--yellow-ink");
  });
  it("transforma escena a overlay local con pan, zoom y rotación", () => {
    expect(overlayTransform({ x: 80, y: 20, angle: Math.PI / 2 }, { scrollX: -20, scrollY: 10, zoom: { value: 2 } }))
      .toBe("translate(120px, 60px) scale(2) rotate(1.5707963267948966rad)");
  });
  it("conecta los bordes de tarjetas y recalcula tras arrastrar", () => {
    const a = { x: 0, y: 0, width: 350, height: 400 };
    const b = { x: 470, y: 100, width: 350, height: 400 };
    expect(arrowGeometry(a, b)).toEqual({ x: 362, y: 200, points: [[0, 0], [96, 100]] });
    expect(arrowGeometry(a, { ...b, x: 570 }).points[1][0]).toBe(196);
  });
  it("distribuye las tarjetas sin superposición", () => {
    expect(cardPosition(0)).toEqual({ x: 0, y: 0 });
    expect(cardPosition(1)).toEqual({ x: 470, y: 0 });
    expect(cardPosition(2)).toEqual({ x: 470, y: 420 });
  });
});
