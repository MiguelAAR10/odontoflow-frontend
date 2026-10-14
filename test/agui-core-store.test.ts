import { describe, expect, it, vi } from "vitest";
import { EventType, type Event, type RunAgentInput } from "../src/agui/events.js";
import type { Card } from "../src/agui/card.js";
import type { AgentSource } from "../src/agui/source.js";
import { createAgentStore, type ApprovalHandler } from "../src/agui/store.js";
import { useAgentStore } from "../src/agui/store.js";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { renderToString } from "react-dom/server";

const card: Card = { id: "p1", agent: "hilo", level: "aprobar", state: "pending", title: "Enviar recordatorios", body: "", approve: "Aprobar y enviar" };
const toApiError = (error: unknown) => ({ code: "NETWORK", httpStatus: 0, message: error instanceof Error ? error.message : "Error de conexión" });

function controlledSource() {
  let emit: (event: Event) => void = () => {};
  let finish = () => {};
  let current: RunAgentInput | undefined;
  const source: AgentSource = {
    run: vi.fn((input, onEvent) => {
      current = input; emit = onEvent;
      return new Promise<void>((resolve) => { finish = resolve; });
    }),
    stop: vi.fn(() => {}),
  };
  return { source, emit: (event: Event) => emit(event), finish: () => finish(), input: () => current! };
}

describe("store AG-UI", () => {
  it("send conserva el hilo y stop corta callbacks tardíos conservando el rastro", async () => {
    const control = controlledSource();
    const store = createAgentStore({ source: control.source, toApiError });
    const run = store.send("Revisa agenda");
    expect(control.input().messages.at(-1)).toMatchObject({ role: "user", content: "Revisa agenda" });
    expect(store.getSnapshot().run.status).toBe("working");
    control.emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m", delta: "Leyendo" });
    store.stop();
    const stopped = store.getSnapshot();
    control.emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m", delta: " texto tardío" });
    control.emit({ type: EventType.RUN_FINISHED, threadId: control.input().threadId, runId: control.input().runId });
    expect(store.getSnapshot()).toBe(stopped);
    expect(stopped.run.status).toBe("stopped");
    expect(stopped.trace.at(-1)?.type).toBe("RUN_STOPPED");
    expect(control.source.stop).toHaveBeenCalledOnce();
    control.finish(); await run;
  });

  it("solo approve llama al handler humano, mantiene el idempotency key y espera confirmación", async () => {
    const control = controlledSource();
    let confirm: (card: Card) => void = () => {};
    const approveCard = vi.fn(() => new Promise<Card>((resolve) => { confirm = resolve; }));
    const store = createAgentStore({ source: control.source, approveCard, toApiError });
    const first = store.send("Recordatorios");
    control.emit({ type: EventType.RUN_FINISHED, threadId: control.input().threadId, runId: control.input().runId,
      outcome: { type: "interrupt", interrupts: [{ id: "i", reason: "approval", metadata: { card } }] },
    });
    control.finish(); await first;
    const consent = store.send("sí");
    expect(approveCard).not.toHaveBeenCalled();
    expect(store.getSnapshot().cards.p1?.status).toBe("pending");
    store.stop(); control.finish(); await consent;
    const approval = store.approve("p1");
    expect(store.getSnapshot().cards.p1?.status).toBe("loading");
    await Promise.resolve();
    expect(approveCard).toHaveBeenCalledWith(card, expect.any(String));
    confirm({ ...card, state: "approved", result: "Envío autorizado" });
    await approval;
    expect(store.getSnapshot().cards.p1?.status).toBe("approved");
  });

  it("no admite dos runs simultáneos y clear invalida los callbacks del anterior", async () => {
    const control = controlledSource();
    const store = createAgentStore({ source: control.source, toApiError });
    const first = store.send("Primero");
    const staleEmit = vi.mocked(control.source.run).mock.calls[0]![1];
    await expect(store.send("Segundo")).rejects.toMatchObject({ code: "RUN_ACTIVE" });
    store.clear(); await first;
    expect(store.getSnapshot().thread).toEqual([]);
    const second = store.send("Nuevo");
    const current = store.getSnapshot();
    staleEmit({ type: EventType.RUN_ERROR, message: "Error tardío" });
    expect(store.getSnapshot()).toBe(current);
    store.stop(); await second;
  });

  it("un agente no puede inyectar acciones locales de aprobación", async () => {
    const control = controlledSource();
    const store = createAgentStore({ source: control.source, toApiError });
    const run = store.send("Propuesta");
    control.emit({ type: EventType.CUSTOM, name: "airi.card", value: card });
    control.emit({ type: "CARD_APPROVED", card: { ...card, state: "approved" } } as unknown as Event);
    control.emit({ type: EventType.STATE_DELTA, delta: [{ op: "add", path: "/cards", value: { p1: { status: "approved" } } }] });
    expect(store.getSnapshot().cards.p1?.status).toBe("pending");
    store.stop(); await run;
  });

  it("reintenta una aprobación fallida con el mismo key y evita duplicar un clic", async () => {
    const control = controlledSource();
    const approveCard = vi.fn<ApprovalHandler>()
      .mockRejectedValueOnce(new Error("Sin conexión"))
      .mockResolvedValueOnce({ ...card, state: "approved" });
    const store = createAgentStore({ source: control.source, approveCard, toApiError });
    const run = store.send("Propuesta");
    control.emit({ type: EventType.CUSTOM, name: "airi.card", value: card });
    store.stop(); await run;
    const first = store.approve("p1");
    expect(store.approve("p1")).toBe(first);
    await expect(first).rejects.toMatchObject({ code: "NETWORK", message: "Sin conexión" });
    expect(store.getSnapshot().cards.p1).toMatchObject({ status: "error", error: "Sin conexión" });
    await store.approve("p1");
    expect(approveCard.mock.calls[0]?.[1]).toBe(approveCard.mock.calls[1]?.[1]);
    expect(store.getSnapshot().cards.p1?.status).toBe("approved");
    await expect(store.approve("p1")).rejects.toMatchObject({ code: "CARD_NOT_PENDING" });
  });

  it("una tarjeta cambiada exige otro intento y una respuesta antigua no la aprueba", async () => {
    const control = controlledSource();
    let confirm: (card: Card) => void = () => {};
    const approveCard = vi.fn<ApprovalHandler>(() => new Promise<Card>((resolve) => { confirm = resolve; }));
    const store = createAgentStore({ source: control.source, approveCard, toApiError });
    const run = store.send("Propuesta");
    control.emit({ type: EventType.CUSTOM, name: "airi.card", value: card });
    const first = store.approve("p1"); await Promise.resolve();
    control.emit({ type: EventType.CUSTOM, name: "airi.card", value: { ...card, revision: 1, title: "Propuesta actualizada" } });
    confirm({ ...card, state: "approved" }); await first;
    expect(store.getSnapshot().cards.p1?.status).toBe("pending");
    const second = store.approve("p1"); await Promise.resolve();
    expect(approveCard.mock.calls[0]?.[1]).not.toBe(approveCard.mock.calls[1]?.[1]);
    confirm({ ...card, revision: 1, title: "Propuesta actualizada", state: "approved" }); await second;
    expect(store.getSnapshot().cards.p1?.status).toBe("approved");
    store.stop(); await run;
  });

  it("clear descarta aprobaciones tardías sin contaminar la nueva sesión", async () => {
    const control = controlledSource();
    let confirm: (card: Card) => void = () => {};
    const store = createAgentStore({ source: control.source, toApiError,
      approveCard: () => new Promise<Card>((resolve) => { confirm = resolve; }),
    });
    const run = store.send("Propuesta");
    control.emit({ type: EventType.CUSTOM, name: "airi.card", value: card });
    store.stop(); await run;
    const approval = store.approve("p1"); await Promise.resolve();
    store.clear();
    confirm({ ...card, state: "approved" }); await approval;
    expect(store.getSnapshot().cards).toEqual({});
    expect(store.getSnapshot().thread).toEqual([]);
  });

  it("no acepta una respuesta sin confirmación ni la aprobación de otro id", async () => {
    for (const response of [card, { ...card, id: "other", state: "approved" }]) {
      const control = controlledSource();
      const store = createAgentStore({ source: control.source, toApiError, approveCard: async () => response as Card });
      const run = store.send("Propuesta");
      control.emit({ type: EventType.CUSTOM, name: "airi.card", value: card });
      store.stop(); await run;
      await expect(store.approve("p1")).rejects.toMatchObject({ message: "El servidor no confirmó la aprobación de esta tarjeta." });
      expect(store.getSnapshot().cards.p1?.status).toBe("error");
    }
  });

  it("normaliza fallos de transporte y streams que cierran sin evento final", async () => {
    for (const run of [async () => { throw new Error("Sin conexión"); }, async () => {}]) {
      const source: AgentSource = { run, stop() {} };
      const store = createAgentStore({ source, toApiError });
      await store.send("Consulta");
      expect(store.getSnapshot().run.status).toBe("error");
      expect(store.getSnapshot().trace.at(-1)?.type).toBe("RUN_ERROR");
    }
  });

  it("un suscriptor puede comenzar otro run al finalizar sin perder su cancelación", async () => {
    const control = controlledSource();
    const store = createAgentStore({ source: control.source, toApiError });
    const first = store.send("Primero");
    const input = control.input();
    let second: Promise<void> | undefined;
    const unsubscribe = store.subscribe(() => {
      if (store.getSnapshot().run.status === "done" && !second) second = store.send("Siguiente");
    });
    control.emit({ type: EventType.RUN_FINISHED, threadId: input.threadId, runId: input.runId });
    await first;
    unsubscribe();
    expect(store.getSnapshot().run.status).toBe("working");
    store.stop(); await second;
    expect(store.getSnapshot().run.status).toBe("stopped");
  });

  it("normaliza el error de stop y mantiene el corte local del stream", async () => {
    const control = controlledSource();
    control.source.stop = () => { throw new Error("No se pudo cancelar la conexión"); };
    const store = createAgentStore({ source: control.source, toApiError });
    const run = store.send("Consulta");
    store.stop(); await run;
    const stopped = store.getSnapshot();
    expect(stopped.trace.at(-1)).toMatchObject({ type: "STOP_ERROR", message: "No se pudo cancelar la conexión" });
    control.emit({ type: EventType.RUN_ERROR, message: "Evento tardío" });
    expect(store.getSnapshot()).toBe(stopped);
    expect(stopped.run.status).toBe("stopped");
  });

  it("consume RunAgentInput explícito y descarta eventos de otro hilo/run", async () => {
    const control = controlledSource();
    const store = createAgentStore({ source: control.source, toApiError });
    const input: RunAgentInput = { threadId: "thread", runId: "run", messages: [{ id: "u", role: "user", content: "Consulta" }], tools: [], context: [], state: { sede: "Lince" } };
    const run = store.send(input);
    expect(control.input()).toEqual(input);
    expect(store.getSnapshot().thread[0]).toMatchObject({ id: "u", role: "user" });
    const state = store.getSnapshot();
    control.emit({ type: EventType.RUN_FINISHED, threadId: "wrong", runId: "run" });
    control.emit({ type: EventType.RUN_FINISHED, threadId: "thread", runId: "wrong" });
    expect(store.getSnapshot()).toBe(state);
    control.emit({ type: EventType.RUN_FINISHED, threadId: "thread", runId: "run" }); await run;
    const other = store.send({ ...input, threadId: "other", runId: "next" });
    expect(store.getSnapshot().thread).toHaveLength(1);
    store.stop(); await other;
  });

  it("configuración explícita, preferencias, snapshots estables y unsubscribe", async () => {
    const store = createAgentStore();
    await expect(store.send("Consulta")).rejects.toMatchObject({ code: "AGENT_SOURCE_UNAVAILABLE" });
    await expect(store.approve("missing")).rejects.toMatchObject({ code: "CARD_NOT_PENDING" });
    const source: AgentSource = { async run() {}, stop() {} };
    store.configure({ source, toApiError });
    expect(store.getSnapshot()).toBe(store.getSnapshot());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setDocked(true); store.setDocked(true); store.setPanelOpen(true);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe(); store.clear();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getServerSnapshot()).toMatchObject({ thread: [], cards: {}, panelOpen: false });
  });

  it("el hook selecciona snapshots estables y no renderiza por cambios ajenos", async () => {
    const store = createAgentStore();
    let renders = 0;
    function View() {
      const docked = useAgentStore((state) => state.docked, store);
      renders += 1;
      return createElement("span", null, String(docked));
    }
    let view: ReturnType<typeof create>;
    await act(async () => { view = create(createElement(View)); });
    const initialRenders = renders;
    await act(async () => { store.setPanelOpen(true); });
    expect(renders).toBe(initialRenders);
    await act(async () => { store.setDocked(true); });
    expect(view!.toJSON()).toMatchObject({ children: ["true"] });
    await act(async () => { view!.unmount(); });
    function ObjectSelector() {
      const selected = useAgentStore((state) => ({ docked: state.docked }), store);
      return createElement("span", null, String(selected.docked));
    }
    await act(async () => { view = create(createElement(ObjectSelector)); });
    expect(view!.toJSON()).toMatchObject({ children: ["true"] });
    await act(async () => { view!.unmount(); });
    expect(renderToString(createElement(ObjectSelector))).toBe("<span>false</span>");
  });
});
