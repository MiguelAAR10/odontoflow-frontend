import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Session, type Profiler } from "node:inspector";
import { mkdirSync, writeFileSync } from "node:fs";
import { EventType, type Event } from "../src/agui/events.js";
import type { Card } from "../src/agui/card.js";
import { createInitialState, reducer } from "../src/agui/reducer.js";

const card: Card = { id: "proposal", agent: "cepillo", level: "aprobar", state: "pending", title: "Reasignar citas", body: "", approve: "Aprobar" };
const start: Event = { type: EventType.RUN_STARTED, runId: "r1", threadId: "t1", agent: "airi", plan: ["Leer agenda", "Proponer"], timestamp: 10 };

// Native V8 coverage without adding a coverage provider to the fixed deps.
// AIRI_COVERAGE=1 npx vitest run test/agui-core-reducer.test.ts
if (process.env.AIRI_COVERAGE === "1") {
  const session = new Session();
  beforeAll(() => {
    session.connect(); session.post("Debugger.enable"); session.post("Profiler.enable");
    session.post("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
  });
  afterAll(async () => {
    const coverage = await new Promise<Profiler.TakePreciseCoverageReturnType>((resolve, reject) => {
      session.post("Profiler.takePreciseCoverage", (error, result) => error ? reject(error) : resolve(result));
    });
    const script = coverage.result.find((item) => item.functions.some((fn) => fn.functionName === "reducer"));
    if (!script) throw new Error("V8 no registró reducer.ts");
    const source = await new Promise<string>((resolve, reject) => {
      session.post("Debugger.getScriptSource", { scriptId: script.scriptId }, (error, result) => error ? reject(error) : resolve(result.scriptSource));
    });
    mkdirSync(".audit/A2-AGUI", { recursive: true });
    writeFileSync(".audit/A2-AGUI/reducer-coverage.json", JSON.stringify(script, null, 2));
    writeFileSync(".audit/A2-AGUI/reducer-runtime.js", source);
    const ranges = script.functions.flatMap((fn) => fn.ranges)
      .sort((left, right) => (left.endOffset - left.startOffset) - (right.endOffset - right.startOffset));
    let covered = 0;
    let total = 0;
    const end = Math.max(...ranges.map((range) => range.endOffset));
    for (let offset = 0; offset < end; offset += 1) {
      if (/\s/.test(source[offset]!)) continue;
      const range = ranges.find((item) => item.startOffset <= offset && offset < item.endOffset);
      if (range) { total += 1; if (range.count > 0) covered += 1; }
    }
    const percent = Number((covered / total * 100).toFixed(2));
    writeFileSync(".audit/A2-AGUI/coverage-ranges.json", JSON.stringify({ metric: "V8 non-whitespace executable ranges", covered, total, percent }, null, 2));
    session.post("Profiler.stopPreciseCoverage"); session.disconnect();
    console.info(`reducer.ts: cobertura V8 ${percent}% (${covered}/${total}); umbral 90%.`);
    expect(percent).toBeGreaterThanOrEqual(90);
  });
}

describe("reductor AG-UI", () => {
  it("reconstruye un run con texto, plan, delegación, herramienta y conclusión", () => {
    const initial = createInitialState();
    const state = [start,
      { type: EventType.STEP_STARTED, stepName: "Leer agenda", timestamp: 11 },
      { type: EventType.TEXT_MESSAGE_START, messageId: "m1" },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m1", delta: "Estoy " },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m1", delta: "leyendo." },
      { type: EventType.TEXT_MESSAGE_END, messageId: "m1" },
      { type: EventType.STEP_FINISHED, stepName: "Leer agenda" },
      { type: EventType.SUBAGENT_STARTED, subagentRunId: "s1", name: "cepillo", agent: "cepillo" },
      { type: EventType.STEP_STARTED, stepName: "Proponer", index: 1 },
      { type: EventType.TOOL_CALL_START, toolCallId: "tool1", toolCallName: "agenda.read", parentMessageId: "m2" },
      { type: EventType.TOOL_CALL_ARGS, toolCallId: "tool1", delta: "{}" },
      { type: EventType.TOOL_CALL_END, toolCallId: "tool1" },
      { type: EventType.TOOL_CALL_RESULT, toolCallId: "tool1", messageId: "result1", content: "6 citas" },
      { type: EventType.RUN_FINISHED, runId: "r1", threadId: "t1" },
    ].reduce((s, event) => reducer(s, event as Event), initial);
    expect(state.run).toMatchObject({ status: "done", agent: "cepillo", step: 1 });
    expect(state.run.plan.map((step) => step.status)).toEqual(["done", "done"]);
    expect(state.thread[0]?.parts[0]).toEqual({ type: "text", text: "Estoy leyendo.", streaming: false });
    expect(state.thread[1]?.parts[0]).toMatchObject({ type: "tool", args: "{}", result: "6 citas", status: "done" });
    expect(state.agents.cepillo).toBe("done");
    expect(state.agents.airi).toBe("idle");
    expect(state.trace.at(-1)?.type).toBe("RUN_FINISHED");
    expect(initial.thread).toEqual([]);
    expect(initial.trace).toEqual([]);
  });

  it("interrupt expone tarjetas pending y escribir sí/ya/apruebo jamás las aprueba", () => {
    const state = reducer(reducer(createInitialState(), start), {
      type: EventType.RUN_FINISHED, runId: "r1", threadId: "t1",
      outcome: { type: "interrupt", interrupts: [{ id: "i1", reason: "approval", metadata: { card } }] },
    });
    expect(state.run.status).toBe("waiting");
    expect(state.cards.proposal).toMatchObject({ card, status: "pending", runId: "r1" });
    expect(state.agents.cepillo).toBe("needs-you");
    expect(state.thread.at(-1)?.parts).toContainEqual({ type: "card", cardId: "proposal" });
    let next = state;
    for (const text of ["sí", "ya", "apruebo"]) {
      next = reducer(next, { type: "USER_MESSAGE", threadId: "t1", messageId: text, text });
    }
    expect(next.cards).toBe(state.cards);
    expect(next.cards.proposal?.status).toBe("pending");
    expect(next.thread.filter((turn) => turn.role === "user")).toHaveLength(3);
  });

  it("stop conserva trabajo y rastro, cierra streaming y detiene tarjetas en carga", () => {
    let state = reducer(createInitialState(), start);
    state = reducer(state, { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m", delta: "Trabajo previo" });
    state = reducer(state, { type: EventType.TOOL_CALL_START, toolCallId: "t", toolCallName: "proposal", metadata: { card } });
    expect(state.cards.proposal?.status).toBe("loading");
    const stopped = reducer(state, { type: "RUN_STOPPED", timestamp: 20 });
    expect(stopped.run.status).toBe("stopped");
    expect(stopped.cards.proposal?.status).toBe("stopped");
    expect(stopped.thread[0]?.parts[0]).toMatchObject({ text: "Trabajo previo", streaming: false });
    expect(stopped.thread[1]?.parts[0]).toMatchObject({ status: "stopped" });
    expect(stopped.trace.at(-1)).toMatchObject({ type: "RUN_STOPPED", timestamp: 20, message: "Tarea detenida por ti" });
    expect(stopped.run.plan.map((part) => part.status)).toEqual(["pending", "pending"]);
    expect(state.cards.proposal?.status).toBe("loading");
  });

  it("ignora desconocidos y finales de otro run; errors dejan una conclusión visible", () => {
    const state = reducer(createInitialState(), start);
    expect(reducer(state, { type: "FUTURE_EVENT" })).toBe(state);
    expect(reducer(state, { type: EventType.RUN_FINISHED, threadId: "t1", runId: "old" })).toBe(state);
    const failed = reducer(state, { type: EventType.RUN_ERROR, message: "No se pudo consultar", code: "NETWORK" });
    expect(failed.run).toMatchObject({ status: "error", what: "No se pudo consultar" });
    expect(failed.agents.airi).toBe("idle");
    expect(failed.thread.at(-1)?.parts).toContainEqual({ type: "notice", text: "No se pudo consultar" });
  });

  it("aplica JSON Patch RFC 6902 atómicamente sin mutar el snapshot previo", () => {
    const snapshot = { list: ["a", "b", "c"], nested: { "a/b": { "~value": 4 } } };
    const before = reducer(reducer(createInitialState(), start), { type: EventType.STATE_SNAPSHOT, snapshot });
    const state = reducer(before, { type: EventType.STATE_DELTA, delta: [
      { op: "test", path: "/nested/a~1b/~0value", value: 4 },
      { op: "replace", path: "/nested/a~1b/~0value", value: 7 },
      { op: "add", path: "/list/-", value: "d" },
      { op: "move", from: "/list/0", path: "/list/2" },
      { op: "copy", from: "/nested/a~1b", path: "/copy" },
      { op: "remove", path: "/list/0" },
    ] });
    expect(state.worldState).toEqual({ list: ["c", "a", "d"], nested: { "a/b": { "~value": 7 } }, copy: { "~value": 7 } });
    expect(before.worldState).toEqual(snapshot);
    expect(snapshot.list).toEqual(["a", "b", "c"]);
    expect(state.cards).toBe(before.cards);
  });

  it("un patch inválido no aplica cambios parciales ni contamina prototipos", () => {
    const state = reducer(createInitialState(), start);
    const invalid = reducer(state, { type: EventType.STATE_DELTA, delta: [
      { op: "add", path: "/good", value: true },
      { op: "add", path: "/__proto__/polluted", value: true },
    ] });
    expect(invalid.worldState).toBe(state.worldState);
    expect(invalid.trace.at(-1)?.message).toBe("No se pudo aplicar la actualización de estado");
    expect(Object.prototype).not.toHaveProperty("polluted");
  });

  it("proyecta tarjetas y partes del catálogo desde CUSTOM y resultados de herramientas", () => {
    let state = reducer(createInitialState(), start);
    state = reducer(state, { type: EventType.CUSTOM, name: "airi.part", value: { key: "agenda", props: { sede: "Lince" } }, agent: "cepillo" });
    expect(state.thread.at(-1)?.parts).toContainEqual({ type: "part", key: "agenda", props: { sede: "Lince" } });
    state = reducer(state, { type: EventType.CUSTOM, name: "airi.notice", value: { text: "Revisa tú" } });
    expect(state.thread.at(-1)?.parts).toContainEqual({ type: "notice", text: "Revisa tú" });
    state = reducer(state, { type: EventType.TOOL_CALL_RESULT, toolCallId: "t", messageId: "result", content: JSON.stringify({ card }) });
    expect(state.cards.proposal?.status).toBe("pending");
    state = reducer(state, { type: EventType.CUSTOM, name: "airi.card", value: { ...card, id: "automatic", level: "auto", state: "ready" } });
    expect(state.cards.automatic?.status).toBe("done");
  });

  it("actualiza preferencias sin emitir cambios cuando el valor ya coincide", () => {
    const initial = createInitialState();
    expect(reducer(initial, { type: "SET_DOCKED", value: false })).toBe(initial);
    expect(reducer(initial, { type: "SET_PANEL_OPEN", value: false })).toBe(initial);
    const docked = reducer(initial, { type: "SET_DOCKED", value: true });
    const opened = reducer(docked, { type: "SET_PANEL_OPEN", value: true });
    expect(opened).toMatchObject({ docked: true, panelOpen: true });
  });

  it("la acción humana registra error/reintento/aprobación sin resolver otras propuestas", () => {
    let state = reducer(createInitialState(), { type: "RUN_REQUESTED", threadId: "t1", runId: "r1" });
    state = reducer(state, { type: EventType.RUN_FINISHED, threadId: "t1", runId: "r1", outcome: { type: "interrupt", interrupts: [
      { id: "i", reason: "approval", metadata: { card } },
      { id: "j", reason: "approval", metadata: { card: { ...card, id: "other" } } },
    ] } });
    state = reducer(state, { type: "CARD_APPROVAL_STARTED", cardId: "proposal" });
    state = reducer(state, { type: "CARD_APPROVAL_FAILED", cardId: "proposal", message: "Reintenta" });
    expect(state.cards.proposal).toMatchObject({ status: "error", error: "Reintenta" });
    expect(state.agents.cepillo).toBe("needs-you");
    state = reducer(state, { type: "CARD_APPROVAL_STARTED", cardId: "proposal" });
    state = reducer(state, { type: "CARD_APPROVED", card: { ...card, state: "approved", result: "Reasignado" } });
    expect(state.run.status).toBe("waiting");
    expect(state.agents.cepillo).toBe("needs-you");
    state = reducer(state, { type: "CARD_APPROVAL_STARTED", cardId: "other" });
    state = reducer(state, { type: "CARD_APPROVED", card: { ...card, id: "other", state: "approved" } });
    expect(state.run.status).toBe("done");
    expect(state.agents.cepillo).toBe("done");
    expect(state.trace.at(-1)?.message).toBe("Aprobado por ti");
    const after = reducer(state, { type: EventType.CUSTOM, name: "airi.card", value: card });
    expect(after.cards.proposal?.status).toBe("approved");
  });

  it("ignora acciones sobre tarjetas inexistentes e interrupts sin Card válida", () => {
    const state = reducer(createInitialState(), start);
    for (const event of [
      { type: "CARD_APPROVAL_STARTED", cardId: "missing" },
      { type: "CARD_APPROVAL_FAILED", cardId: "missing", message: "Error" },
      { type: "CARD_APPROVED", card: { ...card, state: "approved" } },
      { type: EventType.SUBAGENT_STARTED, name: "unknown", subagentRunId: "s" },
      { type: EventType.CUSTOM, name: "unknown", value: {} },
      { type: EventType.CUSTOM, name: "airi.part", value: {} },
      { type: EventType.CUSTOM, name: "airi.notice", value: {} },
    ]) expect(reducer(state, event)).toBe(state);
    const waiting = reducer(state, { type: EventType.RUN_FINISHED, runId: "r1", threadId: "t1", outcome: { type: "interrupt", interrupts: [{ id: "i", reason: "input" }] } });
    expect(waiting.cards).toEqual({});
    expect(waiting.run.status).toBe("waiting");
    expect(reducer(waiting, { type: "RUN_STOPPED" })).toBe(waiting);
  });

  it("crea pasos cuando no hay plan y preserva turnos usuario al recibir texto", () => {
    let state = reducer(createInitialState(), { type: EventType.RUN_STARTED, threadId: "t1", runId: "r1" });
    state = reducer(state, { type: EventType.STEP_STARTED, stepName: "Leer" });
    expect(state.run.plan).toEqual([{ label: "Leer", status: "working" }]);
    state = reducer(state, { type: EventType.TEXT_MESSAGE_START, messageId: "u", role: "user" });
    state = reducer(state, { type: EventType.TEXT_MESSAGE_START, messageId: "u", role: "user" });
    state = reducer(state, { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "u", delta: "sí" });
    expect(state.thread[0]).toMatchObject({ role: "user", agent: null });
    expect(reducer(state, { type: EventType.TEXT_MESSAGE_START, messageId: "secret", role: "system" })).toBe(state);
    state = reducer(state, { type: EventType.RUN_FINISHED, runId: "r1", threadId: "t1", timestamp: 100, outcome: { type: "cancelled" } });
    expect(state.run.status).toBe("stopped");
  });

  it("reemplaza la raíz, compara objetos por valor y opera sobre arrays/objetos", () => {
    let state = reducer(createInitialState(), start);
    state = reducer(state, { type: EventType.STATE_DELTA, delta: [
      { op: "replace", path: "", value: { obj: { x: 1, y: [2] }, arr: [1, 2, 3], unused: true } },
      { op: "test", path: "/obj", value: { y: [2], x: 1 } },
      { op: "replace", path: "/arr/1", value: 4 },
      { op: "remove", path: "/unused" },
      { op: "add", path: "/arr/1", value: 5 },
    ] });
    expect(state.worldState).toEqual({ obj: { x: 1, y: [2] }, arr: [1, 5, 4, 3] });
  });

  it("un run posterior no oculta las propuestas pendientes del mismo agente", () => {
    let state = reducer(createInitialState(), start);
    state = reducer(state, { type: EventType.CUSTOM, name: "airi.card", value: card });
    state = reducer(state, { type: EventType.RUN_STARTED, threadId: "t1", runId: "r2", agent: "cepillo" });
    state = reducer(state, { type: EventType.RUN_FINISHED, threadId: "t1", runId: "r2" });
    expect(state.agents.cepillo).toBe("needs-you");
    expect(state.cards.proposal?.status).toBe("pending");
  });

  it("el rastro atribuye cada parte al agente que emitió el evento", () => {
    const state = reducer(reducer(createInitialState(), start), { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m", delta: "Agenda", agent: "cepillo" });
    expect(state.trace.at(-1)?.agent).toBe("cepillo");
  });

  it.each([
    [{ op: "replace", path: "invalid", value: 2 }],
    [{ op: "replace", path: "/bad~2escape", value: 2 }],
    [{ op: "replace", path: "/missing", value: 2 }],
    [{ op: "replace", path: "/arr/5", value: 2 }],
    [{ op: "add", path: "/arr/01", value: 2 }],
    [{ op: "remove", path: "/arr/-" }],
    [{ op: "copy", from: "/arr/length", path: "/length" }],
    [{ op: "add", path: "/primitive/nested", value: 2 }],
    [{ op: "test", path: "/primitive", value: 3 }],
    [{ op: "test", path: "/arr", value: {} }],
    [{ op: "test", path: "/obj", value: { different: true } }],
    [{ op: "move", from: "/obj", path: "/obj/child" }],
    [{ op: "unknown", path: "/obj" }],
  ])("rechaza un patch inválido conservando el estado: %j", (operation) => {
    const state = reducer(createInitialState(), { type: EventType.STATE_SNAPSHOT, snapshot: { arr: [1], obj: { x: 1 }, primitive: 2 } });
    const next = reducer(state, { type: EventType.STATE_DELTA, delta: [operation] });
    expect(next.worldState).toBe(state.worldState);
    expect(next.trace.at(-1)?.message).toBe("No se pudo aplicar la actualización de estado");
  });
});
