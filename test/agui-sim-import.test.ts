import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.doUnmock("../src/agui/sim/source.js"); vi.resetModules(); });

describe("selección de fuente", () => {
  it("con mocks=false no importa ni evalúa el simulador y selecciona HTTP", async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false");
    vi.resetModules();
    const imported = vi.fn(() => { throw new Error("El módulo sim no debe importarse"); });
    vi.doMock("../src/agui/sim/source.js", imported);
    const { getAgentSource } = await import("../src/agui/index.js");
    const source = await getAgentSource();
    expect(imported).not.toHaveBeenCalled();
    const { HttpSource } = await import("../src/agui/http.js");
    expect(source).toBeInstanceOf(HttpSource);
  });
  it("solo activa el simulador cuando el flag es true explícito", async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "true");
    vi.resetModules();
    const { getAgentSource } = await import("../src/agui/index.js");
    const source = await getAgentSource({ scenarioId: "doctor-brief" });
    expect(source.constructor.name).toBe("SimulatedSource");
  }, 15000);
});
