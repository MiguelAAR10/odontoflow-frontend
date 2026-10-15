import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventType, type RunAgentInput, type Event } from "../src/agui/events.js";
import { createInitialState, reducer } from "../src/agui/reducer.js";
import { SimulatedSource } from "../src/agui/sim/source.js";
import { HttpSource } from "../src/agui/http.js";
import { createAgentStore } from "../src/agui/store.js";
import { toApiError } from "../src/contracts/client.js";

const input = (): RunAgentInput => ({
  threadId: "thread-http", runId: "run-http", messages: [{ id: "user-1", role: "user", content: "Busca un hueco" }],
  tools: [], context: [], state: { selectedLocation: "Lince" },
});
const servers: Server[] = [];
const sources: HttpSource[] = [];
const nativeFetch = globalThis.fetch;

async function serve(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const transport = vi.fn((url: string, init: RequestInit) => nativeFetch(`${origin}${url}`, init));
  const source = new HttpSource({ fetch: transport });
  sources.push(source);
  return { source, transport };
}

function startSse(response: ServerResponse) {
  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
}
function frame(event: Event) { return `data: ${JSON.stringify(event)}\n\n`; }
async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString());
}

afterEach(async () => {
  for (const source of sources.splice(0)) source.stop();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("HttpSource contra SSE real", () => {
  it.each([
    ["http", "No se confirmó la detención remota."],
    ["network", "Error de conexión con el servidor."],
    ["internal", "Error de conexión con el servidor."],
  ])("el store muestra el fallo remoto %s después del abort inmediato y del cierre de send", async (failure, message) => {
    let rejectStop: (() => void) | undefined;
    const { source, transport } = await serve((request, response) => {
      if (request.url?.endsWith("/stop")) {
        rejectStop = () => {
          if (failure === "network") { response.destroy(); return; }
          if (failure === "internal") {
            response.writeHead(500, { "content-type": "text/plain" });
            response.end("SQL private_patient_data traceback");
            return;
          }
          response.writeHead(503, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: { code: "STOP_UNAVAILABLE", message } }));
        };
        return;
      }
      startSse(response);
      response.write(frame({ type: EventType.RUN_STARTED, threadId: "thread-http", runId: "run-http" }));
    });
    const store = createAgentStore({ source, toApiError });
    const running = store.send(input());
    await vi.waitFor(() => expect(store.getSnapshot().trace.some((entry) => entry.type === EventType.RUN_STARTED)).toBe(true));
    store.stop(); store.stop();
    expect(transport.mock.calls[0]![1].signal?.aborted).toBe(true);
    expect(store.getSnapshot().run.status).toBe("stopped");
    await running;
    await vi.waitFor(() => expect(rejectStop).toBeTypeOf("function"));
    rejectStop!();
    await vi.waitFor(() => expect(store.getSnapshot().trace.at(-1)).toMatchObject({
      type: "STOP_ERROR", runId: "run-http", message,
    }));
    expect(store.getSnapshot().thread.at(-1)?.parts).toEqual([{ type: "notice", text: message }]);
    expect(store.getSnapshot().run.what).toBe(message);
    expect(store.getSnapshot().trace.filter((entry) => entry.type === "STOP_ERROR")).toHaveLength(1);
    expect(store.getSnapshot().run.status).toBe("stopped");
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("el store conserva el estado detenido cuando el backend confirma stop", async () => {
    const { source, transport } = await serve((request, response) => {
      if (request.url?.endsWith("/stop")) { response.writeHead(204); response.end(); return; }
      startSse(response);
      response.write(frame({ type: EventType.RUN_STARTED, threadId: "thread-http", runId: "run-http" }));
    });
    const stop = vi.spyOn(source, "stop");
    const store = createAgentStore({ source, toApiError });
    const running = store.send(input());
    await vi.waitFor(() => expect(store.getSnapshot().trace.some((entry) => entry.type === EventType.RUN_STARTED)).toBe(true));
    store.stop();
    const stopped = store.getSnapshot();
    await running;
    await stop.mock.results[0]!.value;
    expect(store.getSnapshot()).toBe(stopped);
    expect(stopped.run.status).toBe("stopped");
    expect(stopped.trace.at(-1)).toMatchObject({ type: "RUN_STOPPED", message: "Tarea detenida por ti" });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it.each(["clear", "configure", "new-run", "new-run-stopped"])("descarta el fallo de stop tardío tras %s", async (action) => {
    let rejectStop: (() => void) | undefined;
    let runNumber = 0;
    const { source } = await serve((request, response) => {
      if (request.url === "/api/backend/agent/runs/next-run/stop") { response.writeHead(204); response.end(); return; }
      if (request.url?.endsWith("/stop")) {
        rejectStop = () => {
          response.writeHead(503, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: { code: "STOP_UNAVAILABLE", message: "Fallo de una tarea anterior" } }));
        };
        return;
      }
      void body(request).then((payload) => {
        const run = { threadId: (payload as { thread_id: string }).thread_id, runId: runNumber++ === 0 ? "run-http" : "next-run" };
        startSse(response);
        response.write(frame({ type: EventType.RUN_STARTED, threadId: run.threadId, runId: run.runId }));
        if (run.runId === "next-run" && action !== "new-run-stopped") {
          response.end(frame({ type: EventType.RUN_FINISHED, threadId: run.threadId, runId: run.runId }));
        }
      });
    });
    const stop = vi.spyOn(source, "stop");
    const store = createAgentStore({ source, toApiError });
    const running = store.send(input());
    await vi.waitFor(() => expect(store.getSnapshot().trace.some((entry) => entry.type === EventType.RUN_STARTED)).toBe(true));
    store.stop();
    await running;
    await vi.waitFor(() => expect(rejectStop).toBeTypeOf("function"));
    if (action === "clear") store.clear();
    else if (action === "configure") store.configure({ source: new HttpSource(), toApiError });
    else if (action === "new-run-stopped") {
      const next = store.send({ ...input(), runId: "next-run" });
      await vi.waitFor(() => expect(store.getSnapshot().trace.at(-1)).toMatchObject({ type: EventType.RUN_STARTED, runId: "next-run" }));
      store.stop();
      await next;
      await stop.mock.results[1]!.value;
    } else await store.send({ ...input(), runId: "next-run" });
    const snapshot = store.getSnapshot();
    rejectStop!();
    await expect(stop.mock.results[0]!.value).rejects.toMatchObject({ code: "STOP_UNAVAILABLE", httpStatus: 503 });
    expect(store.getSnapshot()).toBe(snapshot);
    expect(snapshot.trace.some((entry) => entry.type === "STOP_ERROR")).toBe(false);
    expect(snapshot.thread.flatMap((turn) => turn.parts)).not.toContainEqual({ type: "notice", text: "Fallo de una tarea anterior" });
  });

  it.each(["clear", "configure"])("consume un rechazo remoto cuando %s cancela directamente una tarea", async (action) => {
    const { source } = await serve((request, response) => {
      if (request.url?.endsWith("/stop")) {
        response.writeHead(503, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { code: "STOP_UNAVAILABLE", message: "Fallo tras limpiar" } }));
        return;
      }
      startSse(response);
      response.write(frame({ type: EventType.RUN_STARTED, threadId: "thread-http", runId: "run-http" }));
    });
    const stop = vi.spyOn(source, "stop");
    const store = createAgentStore({ source, toApiError });
    const running = store.send(input());
    await vi.waitFor(() => expect(store.getSnapshot().trace.some((entry) => entry.type === EventType.RUN_STARTED)).toBe(true));
    if (action === "clear") store.clear();
    else store.configure({ source: new HttpSource(), toApiError });
    const snapshot = store.getSnapshot();
    await running;
    await expect(stop.mock.results[0]!.value).rejects.toMatchObject({ code: "STOP_UNAVAILABLE" });
    expect(store.getSnapshot()).toBe(snapshot);
    expect(snapshot).toEqual(createInitialState());
  });

  it("reproduce el fixture de oferta con el mismo estado que el simulador, sin aprobar", async () => {
    const expected: Event[] = [];
    vi.useFakeTimers();
    const simulated = new SimulatedSource({ scenarioId: "admin-hueco" });
    const simulation = simulated.run(input(), (event) => expected.push(event));
    await vi.runAllTimersAsync();
    await simulation;
    vi.useRealTimers();
    const requests: { url?: string | undefined; method?: string | undefined; key?: string | string[] | undefined; payload: unknown }[] = [];
    const { source, transport } = await serve((request, response) => {
      void body(request).then((payload) => {
        requests.push({ url: request.url, method: request.method, key: request.headers["idempotency-key"], payload });
        startSse(response);
        const wire = `: heartbeat\n\n${expected.map(frame).join("")}`;
        // Split UTF-8 bytes inside an accented word, as real network chunks can.
        const bytes = Buffer.from(wire);
        const cut = bytes.indexOf(Buffer.from("Inés")) + 3;
        response.write(bytes.subarray(0, cut));
        response.end(bytes.subarray(cut));
      });
    });
    const received: Event[] = [];
    await source.run(input(), (event) => received.push(event));
    expect(received).toEqual(expected);
    const state = received.reduce(reducer, createInitialState());
    expect(state).toEqual(expected.reduce(reducer, createInitialState()));
    expect(state.run.status).toBe("waiting");
    expect(state.cards["r-oferta"]?.status).toBe("pending");
    expect(state.run.plan).toHaveLength(3);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(requests).toEqual([{ url: "/api/backend/agent/runs", method: "POST", key: expect.any(String), payload: { ask: "Busca un hueco", role: "admin", thread_id: "thread-http" } }]);
    expect(requests[0]?.key).toMatch(/^[a-f0-9-]{36}$/);
  });

  it("stop aborta SSE, notifica al backend una sola vez y permite otro run", async () => {
    const requests: { url: string | undefined; key: string | string[] | undefined }[] = [];
    let peer: ServerResponse | undefined;
    const { source, transport } = await serve((request, response) => {
      requests.push({ url: request.url, key: request.headers["idempotency-key"] });
      if (request.url?.endsWith("/stop")) { response.writeHead(204); response.end(); return; }
      void body(request).then((payload) => {
        const run = { threadId: (payload as { thread_id: string }).thread_id, runId: requests.filter(item => !item.url?.endsWith("/stop")).length === 1 ? "run-http" : "second-run" };
        startSse(response);
        response.write(frame({ type: EventType.RUN_STARTED, threadId: run.threadId, runId: run.runId }));
        if (run.runId === "second-run") {
          response.end(frame({ type: EventType.RUN_FINISHED, threadId: run.threadId, runId: run.runId, outcome: { type: "success" } }));
        } else peer = response;
      });
    });
    const events: Event[] = [];
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const finished = source.run(input(), (event) => { events.push(event); if (event.type === "RUN_STARTED") started(); });
    await ready;
    const signal = transport.mock.calls[0]![1].signal;
    source.stop(); source.stop();
    await finished;
    expect(signal?.aborted).toBe(true);
    expect(events.map((event) => event.type)).toEqual(["RUN_STARTED", "RUN_FINISHED"]);
    expect(events.at(-1)).toMatchObject({ runId: "run-http", threadId: "thread-http", outcome: { type: "cancelled" } });
    expect(events.reduce(reducer, createInitialState()).run.status).toBe("stopped");
    await vi.waitFor(() => expect(requests.filter((request) => request.url?.endsWith("/stop"))).toHaveLength(1));
    const next: Event[] = [];
    await source.run({ ...input(), runId: "second-run" }, (event) => next.push(event));
    peer?.write(frame({ type: EventType.CUSTOM, name: "airi.notice", value: { text: "Evento tardío" } }));
    source.stop();
    expect(events).toHaveLength(2);
    expect(next.reduce(reducer, createInitialState()).run).toMatchObject({ id: "second-run", status: "done" });
    expect(transport).toHaveBeenCalledTimes(3);
    expect(new Set(requests.map((request) => request.key)).size).toBe(3);
  });

  it.each([
    [401, { error: { code: "PERSONA_REQUIRED", message: "Selecciona una persona para continuar.", details: {} } }, "PERSONA_REQUIRED", "Selecciona una persona para continuar."],
    [500, "SQL SELECT private_patient_data traceback", "NETWORK", "Error de conexión con el servidor."],
  ])("normaliza HTTP %s sin mostrar cuerpos de error internos", async (status, payload, code, message) => {
    const { source, transport } = await serve((_request, response) => {
      response.writeHead(status, { "content-type": typeof payload === "string" ? "text/plain" : "application/json" });
      response.end(typeof payload === "string" ? payload : JSON.stringify(payload));
    });
    const events: Event[] = [];
    await source.run(input(), (event) => events.push(event));
    expect(events).toEqual([{ type: EventType.RUN_ERROR, code, message }]);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("un error de red produce RUN_ERROR legible sin reintentar automáticamente", async () => {
    const transport = vi.fn(async () => { throw new TypeError("fetch failed: internal.socket.address"); });
    const source = new HttpSource({ fetch: transport });
    sources.push(source);
    const events: Event[] = [];
    await source.run(input(), (event) => events.push(event));
    expect(events).toEqual([{ type: EventType.RUN_ERROR, code: "NETWORK", message: "Error de conexión con el servidor." }]);
    expect(transport).toHaveBeenCalledTimes(1);
  });


  it("reintenta una conexión cortada con la misma clave y omite el prefijo ya emitido", async () => {
    const keys: (string | string[] | undefined)[] = [];
    const prefix: Event[] = [
      { type: EventType.RUN_STARTED, threadId: "thread-http", runId: "run-http", agent: "airi" },
      { type: EventType.TEXT_MESSAGE_START, messageId: "reply-1", role: "assistant" },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "reply-1", delta: "Hola " },
    ];
    const suffix: Event[] = [
      // Identical deltas at distinct positions are legitimate, not replay.
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "reply-1", delta: "Hola " },
      { type: EventType.TEXT_MESSAGE_END, messageId: "reply-1" },
      { type: EventType.RUN_FINISHED, threadId: "thread-http", runId: "run-http", outcome: { type: "success" } },
    ];
    const { source, transport } = await serve((request, response) => {
      keys.push(request.headers["idempotency-key"]);
      startSse(response);
      response.end((keys.length === 1 ? prefix : [...prefix, ...suffix]).map(frame).join(""));
    });
    const received: Event[] = [];
    await source.run(input(), (event) => received.push(event));
    expect(received.at(-1)).toMatchObject({ type: EventType.RUN_ERROR, code: "AGUI_INCOMPLETE" });
    await source.run(input(), (event) => received.push(event));
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(received.filter((event) => event.type !== EventType.RUN_ERROR)).toEqual([...prefix, ...suffix]);
    expect(received.filter((event) => event.type === EventType.TEXT_MESSAGE_CONTENT)).toHaveLength(2);
    await expect(source.run({ ...input(), state: { selectedLocation: "Otra sede" } }, () => {})).rejects.toMatchObject({ code: "RUN_INPUT_CHANGED" });
    expect(transport).toHaveBeenCalledTimes(2);
  });


  it("rechaza runs concurrentes y puede cancelar desde el primer callback", async () => {
    const { source, transport } = await serve((request, response) => {
      if (request.url?.endsWith("/stop")) { response.writeHead(204); response.end(); return; }
      startSse(response);
      response.write(frame({ type: EventType.RUN_STARTED, threadId: "thread-http", runId: "run-http" }));
      response.write(frame({ type: EventType.CUSTOM, name: "airi.notice", value: { text: "Evento después del stop" } }));
    });
    const events: Event[] = [];
    const finished = source.run(input(), (event) => {
      events.push(event);
      if (event.type === EventType.RUN_STARTED) { source.stop(); source.stop(); }
    });
    await expect(source.run({ ...input(), runId: "concurrent" }, () => {})).rejects.toMatchObject({ code: "RUN_ACTIVE" });
    await finished;
    expect(events.map((event) => event.type)).toEqual([EventType.RUN_STARTED, EventType.RUN_FINISHED]);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("no repite una intención que ya terminó", async () => {
    const { source, transport } = await serve((_request, response) => {
      startSse(response);
      response.end(frame({ type: EventType.RUN_FINISHED, threadId: "thread-http", runId: "run-http", outcome: { type: "success" } }));
    });
    await source.run(input(), () => {});
    await expect(source.run(input(), () => {})).rejects.toMatchObject({ code: "RUN_TERMINAL", httpStatus: 409 });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("rechaza un replay distinto antes de duplicar contenido", async () => {
    let attempt = 0;
    const { source } = await serve((_request, response) => {
      startSse(response);
      response.end(frame({ type: EventType.RUN_STARTED, threadId: "thread-http", runId: "run-http", what: ++attempt === 1 ? "Original" : "Cambió" }));
    });
    const received: Event[] = [];
    await source.run(input(), (event) => received.push(event));
    await source.run(input(), (event) => received.push(event));
    expect(received.filter((event) => event.type === EventType.RUN_STARTED)).toHaveLength(1);
    expect(received.at(-1)).toMatchObject({ type: EventType.RUN_ERROR, code: "AGUI_REPLAY_CHANGED" });
  });

  it("normaliza el fallo de stop remoto y conserva la cancelación local", async () => {
    const { source } = await serve((request, response) => {
      if (request.url?.endsWith("/stop")) {
        response.writeHead(503, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { code: "STOP_UNAVAILABLE", message: "No se confirmó la detención remota." } }));
        return;
      }
      startSse(response);
      response.write(frame({ type: EventType.RUN_STARTED, threadId: "thread-http", runId: "run-http" }));
    });
    const events: Event[] = [];
    const finished = source.run(input(), (event) => {
      events.push(event);
      if (event.type === EventType.RUN_STARTED) source.stop();
    });
    await expect(finished).rejects.toMatchObject({ code: "STOP_UNAVAILABLE", httpStatus: 503, message: "No se confirmó la detención remota." });
    expect(events.at(-1)).toMatchObject({ type: EventType.RUN_FINISHED, outcome: { type: "cancelled" } });
  });

  it("cierra una terminal aunque el servidor mantenga SSE abierto", async () => {
    const { source, transport } = await serve((_request, response) => {
      startSse(response);
      response.write(frame({ type: EventType.RUN_STARTED, threadId: "thread-http", runId: "run-http" }));
      response.write(frame({ type: EventType.RUN_FINISHED, threadId: "thread-http", runId: "run-http", outcome: { type: "success" } }));
      response.write(frame({ type: EventType.CUSTOM, name: "airi.notice", value: { text: "No debe aparecer" } }));
    });
    const events: Event[] = [];
    await source.run(input(), (event) => events.push(event));
    expect(events.map((event) => event.type)).toEqual([EventType.RUN_STARTED, EventType.RUN_FINISHED]);
    expect(transport.mock.calls[0]![1].signal?.aborted).toBe(true);
  });


  it("rechaza un terminal de otra tarea y aborta su transporte", async () => {
    const { source, transport } = await serve((_request, response) => {
      startSse(response);
      response.end(frame({ type: EventType.RUN_FINISHED, threadId: "otro-hilo", runId: "otra-tarea", outcome: { type: "success" } }));
    });
    const events: Event[] = [];
    await source.run(input(), (event) => events.push(event));
    expect(events).toEqual([{ type: EventType.RUN_ERROR, code: "AGUI_RUN_MISMATCH", message: "La respuesta del agente pertenece a otra tarea." }]);
    expect(transport.mock.calls[0]![1].signal?.aborted).toBe(true);
  });

  it("convierte un evento con esquema inválido en un error legible", async () => {
    const { source } = await serve((_request, response) => {
      startSse(response);
      response.end('data: {"type":"TEXT_MESSAGE_CONTENT","delta":123}\n\n');
    });
    const events: Event[] = [];
    await source.run(input(), (event) => events.push(event));
    expect(events).toEqual([{ type: EventType.RUN_ERROR, code: "AGUI_PROTOCOL", message: "El servidor envió un evento del agente no válido." }]);
  });


  it("una desconexión abrupta de SSE produce un solo RUN_ERROR de red", async () => {
    let peer: ServerResponse | undefined;
    const { source, transport } = await serve((_request, response) => {
      peer = response;
      startSse(response);
      response.write(frame({ type: EventType.RUN_STARTED, threadId: "thread-http", runId: "run-http" }));
    });
    const events: Event[] = [];
    await source.run(input(), (event) => {
      events.push(event);
      if (event.type === EventType.RUN_STARTED) peer?.destroy();
    });
    expect(events.map((event) => event.type)).toEqual([EventType.RUN_STARTED, EventType.RUN_ERROR]);
    expect(events.at(-1)).toMatchObject({ code: "NETWORK", message: "Error de conexión con el servidor." });
    expect(transport).toHaveBeenCalledTimes(1);
  });

});
