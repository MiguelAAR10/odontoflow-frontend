import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock("../src/agui/sim/source.js");
  vi.doUnmock("../src/mockData");
  vi.resetModules();
});

it("importar la fuente HTTP en modo real no evalúa simulador ni datos mock", async () => {
  vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false");
  vi.resetModules();
  const simulation = vi.fn(() => { throw new Error("No importar simulador en modo real"); });
  const mockData = vi.fn(() => { throw new Error("No importar datos mock en modo real"); });
  vi.doMock("../src/agui/sim/source.js", simulation);
  vi.doMock("../src/mockData", mockData);
  const { HttpSource } = await import("../src/agui/http.js");
  const transport = vi.fn(async () => { throw new TypeError("offline"); });
  const source = new HttpSource({ fetch: transport });
  const events: unknown[] = [];
  await source.run({ threadId: "real-thread", runId: "real-run", messages: [], tools: [], context: [] }, (event) => events.push(event));
  expect(simulation).not.toHaveBeenCalled();
  expect(mockData).not.toHaveBeenCalled();
  expect(transport).toHaveBeenCalledWith("/api/backend/agent/runs", expect.objectContaining({ method: "POST" }));
  expect(events).toEqual([{ type: "RUN_ERROR", code: "NETWORK", message: "Error de conexión con el servidor." }]);
});
