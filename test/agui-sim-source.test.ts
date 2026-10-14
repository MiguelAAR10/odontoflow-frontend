import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventSchemas } from "@ag-ui/core/schemas";
import type { Event, RunAgentInput } from "../src/agui/events.js";
import { createInitialState, reducer } from "../src/agui/reducer.js";
import { createAgentStore } from "../src/agui/store.js";
import { SimulatedSource } from "../src/agui/sim/source.js";

const input = (): RunAgentInput => ({ threadId: "thread-human", runId: "run-human", messages: [], tools: [], context: [] });
const cases = [
  ["dueno-compara", "waiting", ["r-compara", "r-delega"]],
  ["admin-confirma", "waiting", ["r-lote"]],
  ["admin-hueco", "waiting", ["r-oferta"]],
  ["doctor-brief", "done", []],
  ["doctor-evo", "done", []],
  ["cv-huecos", "waiting", ["cv-agenda", "cv-espera", "cv-oferta"]],
  ["cv-cobranza", "waiting", ["cv-saldos", "cv-recordar"]],
  ["cv-sedes", "done", ["cv-ocup", "cv-cob"]],
] as const;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("reproducción AG-UI", () => {
  it.each(cases)("proyecta %s mediante el reducer sin aprobar tarjetas", async (scenarioId, status, cards) => {
    let state = createInitialState();
    const statuses: string[] = [];
    const events: Event[] = [];
    const source = new SimulatedSource({ scenarioId });
    const finished = source.run(input(), (event) => {
      events.push(event);
      state = reducer(state, event);
      statuses.push(state.run.status);
    });
    expect(events[0]).toMatchObject({ type: "RUN_STARTED", runId: "run-human", threadId: "thread-human" });
    await vi.runAllTimersAsync();
    await finished;
    expect(state.run.status).toBe(status);
    expect(statuses[0]).toBe("working");
    expect(new Set(statuses.slice(0, -1))).toEqual(new Set(["working"]));
    expect(Object.keys(state.cards).sort()).toEqual([...cards].sort());
    expect(Object.values(state.cards).some((entry) => entry.status === "approved")).toBe(false);
    expect(state.run.plan.every((step) => step.status === "done")).toBe(true);
    expect(events.every((event) => EventSchemas.safeParse(event).success)).toBe(true);
  });

  it("respeta delays relativos y stop cancela sin más eventos ni temporizadores", async () => {
    const events: Event[] = [];
    const source = new SimulatedSource({ scenarioId: "admin-hueco" });
    const finished = source.run(input(), (event) => events.push(event));
    await vi.advanceTimersByTimeAsync(349);
    expect(events.some((event) => event.type === "STEP_STARTED")).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(events.at(-1)).toMatchObject({ type: "STEP_FINISHED" });
    source.stop();
    source.stop();
    await finished;
    const count = events.length;
    expect(events.at(-1)).toMatchObject({ type: "RUN_FINISHED", outcome: { type: "cancelled" } });
    expect(events.reduce(reducer, createInitialState()).run.status).toBe("stopped");
    await vi.runAllTimersAsync();
    expect(events).toHaveLength(count);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("sin match emite un Notice del catálogo y termina", async () => {
    const source = new SimulatedSource({ role: "doctor" });
    const events: Event[] = [];
    await source.run({ ...input(), messages: [{ id: "u", role: "user", content: "xyz" }] }, (event) => events.push(event));
    expect(events).toContainEqual(expect.objectContaining({ type: "CUSTOM", name: "airi.notice", value: expect.objectContaining({ text: expect.stringContaining("No entendí") }) }));
    expect(events.reduce(reducer, createInitialState()).run.status).toBe("done");
  });
});

describe("aprobación simulada", () => {
  it("rechaza hash/version viejos con 409, confirma por clic e idempotencia por intención", async () => {
    const source = new SimulatedSource({ scenarioId: "admin-hueco" });
    const events: Event[] = [];
    const finished = source.run(input(), (event) => events.push(event));
    await vi.runAllTimersAsync();
    await finished;
    const end = events.at(-1)!;
    if (end.type !== "RUN_FINISHED" || end.outcome?.type !== "interrupt") throw new Error("Expected interrupt");
    const metadata = end.outcome.interrupts[0]!.metadata!;
    const envelope = metadata.approval as { cardId: string; version: number; payload_hash: string };
    expect(envelope).toMatchObject({ cardId: "r-oferta", version: 1, payload_hash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    await expect(source.approve({ ...envelope, payload_hash: "old" }, "attempt-1")).rejects.toMatchObject({ httpStatus: 409 });
    await expect(source.approve({ ...envelope, version: 0 }, "attempt-1")).rejects.toMatchObject({ httpStatus: 409 });
    const card = metadata.card!;
    await expect(source.approveCard({ ...card, title: "Alcance alterado" }, "attempt-1")).rejects.toMatchObject({ httpStatus: 409 });
    const approved = await source.approve(envelope, "attempt-1");
    expect(approved).toMatchObject({ id: "r-oferta", state: "approved" });
    expect(await source.approve(envelope, "attempt-1")).toEqual(approved);
    await expect(source.approve({ ...envelope, payload_hash: "different" }, "attempt-1")).rejects.toMatchObject({ httpStatus: 409 });
    await expect(source.approve(envelope, "attempt-2")).rejects.toMatchObject({ httpStatus: 409 });
  });
  it("no aprueba tarjetas que nunca llegaron al interrupt", async () => {
    const source = new SimulatedSource({ scenarioId: "admin-hueco" });
    const finished = source.run(input(), () => {});
    source.stop();
    await finished;
    await expect(source.approve({ cardId: "r-oferta", version: 1, payload_hash: "old" }, "attempt-1")).rejects.toMatchObject({ httpStatus: 409 });
  });
});

describe("aislamiento entre intentos", () => {
  it("detiene una tarjeta en carga y permite ejecutar otro run sin eventos tardíos", async () => {
    const source = new SimulatedSource({ scenarioId: "admin-hueco" });
    const events: Event[] = [];
    const first = source.run(input(), (event) => events.push(event));
    await vi.advanceTimersByTimeAsync(1350);
    expect(events.reduce(reducer, createInitialState()).cards["r-oferta"]?.status).toBe("loading");
    source.stop();
    await first;
    expect(events.reduce(reducer, createInitialState()).cards["r-oferta"]?.status).toBe("stopped");
    const next: Event[] = [];
    const second = source.run({ ...input(), runId: "second-run" }, (event) => next.push(event));
    await vi.runAllTimersAsync();
    await second;
    expect(next.reduce(reducer, createInitialState()).run).toMatchObject({ id: "second-run", status: "waiting" });
    const oldTools = events.filter((event) => "toolCallId" in event).map((event) => "toolCallId" in event && event.toolCallId);
    const newTools = next.filter((event) => "toolCallId" in event).map((event) => "toolCallId" in event && event.toolCallId);
    expect(newTools.some((id) => oldTools.includes(id))).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: "RUN_FINISHED", outcome: { type: "cancelled" } });
  });
  it("rechaza un run concurrente y puede detenerse desde el callback de acuse", async () => {
    const source = new SimulatedSource({ scenarioId: "admin-hueco" });
    const first = source.run(input(), () => {});
    await expect(source.run(input(), () => {})).rejects.toThrow("está trabajando");
    source.stop(); await first;
    const events: Event[] = [];
    await source.run(input(), (event) => { events.push(event); if (event.type === "RUN_STARTED") source.stop(); });
    expect(events.map((event) => event.type)).toEqual(["RUN_STARTED", "RUN_FINISHED"]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

it("solo la acción humana del store aprueba; escribir sí deja la propuesta pendiente", async () => {
  const source = new SimulatedSource({ role: "admin" });
  const store = createAgentStore({ source, approveCard: source.approveCard,
    toApiError: (error) => ({ code: "TEST", message: String(error), httpStatus: 0 }),
  });
  const sent = store.send("Confirma las citas de mañana");
  await vi.runAllTimersAsync(); await sent;
  expect(store.getSnapshot().cards["r-lote"]?.status).toBe("pending");
  await store.send("sí");
  expect(store.getSnapshot().cards["r-lote"]?.status).toBe("pending");
  expect(store.getSnapshot().thread.flatMap((turn) => turn.parts)).toContainEqual(expect.objectContaining({ type: "notice", text: expect.stringContaining("no aprueba") }));
  await store.approve("r-lote");
  expect(store.getSnapshot().cards["r-lote"]?.status).toBe("approved");
});
