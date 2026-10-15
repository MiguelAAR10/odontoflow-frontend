import { describe, expect, it, vi } from "vitest";
import { HttpSource } from "../src/agui/http";
import type { Event, RunAgentInput } from "../src/agui/events";

const input: RunAgentInput = {
  threadId: "browser-thread", runId: "browser-run", tools: [], context: [], state: { private: "local" },
  messages: [{ id: "old", role: "user", content: "Historia local" }, { id: "new", role: "user", content: "Hola" }],
};
const remote = "server-run";
const sse = (events: unknown[]) => new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), {
  headers: { "content-type": "text/event-stream", "x-run-id": remote },
});

describe("AIRI REST y AG-UI", () => {
  it("envía solo la pregunta y el rol; enlaza el run del servidor con el hilo local", async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => sse([
      { type: "RUN_STARTED", threadId: input.threadId, runId: remote },
      { type: "RUN_FINISHED", threadId: input.threadId, runId: remote, outcome: { type: "success" } },
    ]));
    const source = new HttpSource({ fetch, role: "dueno" });
    const events: Event[] = [];
    await source.run(input, event => events.push(event));
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({ ask: "Hola", role: "dueno", thread_id: input.threadId });
    expect(events.map(event => event.type)).toEqual(["RUN_STARTED", "RUN_FINISHED"]);
    expect(events.at(-1)).toMatchObject({ runId: input.runId, threadId: input.threadId });
  });

  it("detiene el identificador del servidor y no el identificador local", async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => sse([
      { type: "RUN_STARTED", threadId: input.threadId, runId: remote },
    ]));
    const source = new HttpSource({ fetch });
    await source.run(input, event => { if (event.type === "RUN_STARTED") void source.stop(); });
    expect(fetch.mock.calls[1]?.[0]).toBe(`/api/backend/agent/runs/${remote}/stop`);
  });

  it("no repite un run aceptado que se desconectó: recupera propuestas desde la bandeja", async () => {
    const fetch = vi.fn(async () => sse([{ type: "RUN_STARTED", threadId: input.threadId, runId: remote }]));
    const source = new HttpSource({ fetch });
    const events: Event[] = [];
    await source.run(input, event => events.push(event));
    expect(events.at(-1)).toMatchObject({ type: "RUN_ERROR", code: "AGUI_INCOMPLETE" });
    await expect(source.run(input, () => {})).rejects.toMatchObject({ code: "RUN_TERMINAL" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
