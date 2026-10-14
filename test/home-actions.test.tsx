import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomePage } from "../src/views/HomePage";
import { agentController, createAgentController } from "../src/agui/useAgent";
import { agentStore, createAgentStore } from "../src/agui/store";
import { EventType } from "../src/agui/events";
import { getAgentSource } from "../src/agui/index";
import type { ShellRole } from "../src/nav";
import state from "../src/agui/sim/fixtures/state.json";

const model = vi.hoisted(() => ({ role: "admin" as ShellRole, version: 0, current: "recepcion", push: vi.fn() }));
vi.mock("../src/api", () => ({ useMocks: true, toApiError: (error: Error) => ({ message: error.message }) }));
vi.mock("../src/components/PersonaContext", () => ({ usePersona: () => model }));
vi.mock("../src/components/shell/ShellContext", () => ({ useShellContext: () => ({ role: model.role }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: model.push }), usePathname: () => "/home" }));

let view: ReactTestRenderer | undefined;
beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "true");
  vi.stubGlobal("document", { getElementById: () => null });
  model.version += 1; model.push.mockClear(); agentController.reset();
  await getAgentSource();
});
afterEach(() => {
  act(() => { view?.unmount(); }); view = undefined;
  agentController.reset(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
});

const tasks: { role: ShellRole; results: string[] }[] = [
  { role: "admin", results: ["/mi-turno", "/aprobaciones", "/agenda", "r-lote", "r-oferta"] },
  { role: "dueno", results: ["/aprobaciones", "/direccion", "r-compara", "/caja", "/lienzo"] },
  { role: "doctor", results: ["/jornada", "doctor-brief", "doctor-evolution", "/agenda", "/lienzo"] },
];

describe("Inicio: resultados de todas las tareas con el simulador real", () => {
  for (const { role, results } of tasks) {
    it.each(results.map((result, index) => ({ result, index })))(`${role}: tarea $index → $result`, async ({ result, index }) => {
      model.role = role;
      await act(async () => { view = create(<HomePage />); });
      const buttons = view!.root.findAllByProps({ className: "airi-home-task" });
      expect(buttons).toHaveLength(5);
      await act(async () => { buttons[index]!.props.onClick(); await vi.advanceTimersByTimeAsync(20_000); });
      expect(JSON.stringify(agentStore.getSnapshot().thread)).not.toContain("No entendí");
      if (result.startsWith("/")) expect(model.push).toHaveBeenCalledWith(result);
      else {
        if (result.startsWith("r-")) expect(agentStore.getSnapshot().cards[result]).toBeDefined();
        else expect(JSON.stringify(agentStore.getSnapshot().thread)).toContain(result);
        expect(JSON.stringify(view!.toJSON())).not.toContain("No puedo mostrar este contenido");
        expect(agentStore.getSnapshot().run.status).toMatch(/done|waiting/);
        expect(view!.root.findAllByProps({ "data-thread-location": "center" })).toHaveLength(0);
      }
    });
  }
});

describe("Inicio: resumen contextual desde el corte del hilo", () => {
  it.each([
    ["agenda", "Agenda", "2460", "1260", "Cobrado"],
    ["caja", "Caja", "S/ 3,120.00", "S/ 420.00", "minutos ocupados"],
  ])("resuelve Resume esta vista en %s con el snapshot del simulador", async (path, title, first, second, absent) => {
    const store = createAgentStore();
    const controller = createAgentController(store);
    const started = controller.send("Confirma las citas de mañana", { role: "admin", view: path!, viewing: title! });
    await vi.runAllTimersAsync(); await started;
    const cards = store.getSnapshot().cards;
    await controller.send("Resume esta vista", { role: "admin", view: path!, viewing: title! });
    const answer = JSON.stringify(store.getSnapshot().thread.at(-1));
    expect(answer).not.toContain("No entendí");
    expect(answer).toContain(`Viendo: ${title}`);
    expect(answer).toContain(first); expect(answer).toContain(second);
    expect(answer).not.toContain(absent);
    expect(store.getSnapshot().cards).toEqual(cards);
    await controller.approve("r-lote");
    expect(store.getSnapshot().cards["r-lote"]?.status).toBe("approved");
  });
  it("sin mocks ni snapshot no inventa cifras ni consume el simulador", async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false");
    const factory = vi.fn(async () => { throw new Error("No debe consumir ninguna fuente"); });
    const store = createAgentStore();
    const controller = createAgentController(store, factory);
    await controller.send("Resume esta vista", { role: "admin", view: "caja", viewing: "Caja" });
    const answer = JSON.stringify(store.getSnapshot().thread.at(-1));
    expect(answer).toContain("No hay un corte disponible");
    expect(answer).not.toContain("3,120");
    expect(factory).not.toHaveBeenCalled();
  });
  it("en modo real proyecta el snapshot recibido y marca datos incompletos", async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false");
    const snapshot = structuredClone(state[0]!);
    snapshot.sedes[0]!.collected.amount_cents = 12345;
    const store = createAgentStore();
    const controller = createAgentController(store, async () => ({
      async run(input, emit) {
        emit({ type: EventType.STATE_SNAPSHOT, snapshot });
        emit({ type: EventType.RUN_FINISHED, runId: input.runId, threadId: input.threadId, outcome: { type: "success" } });
      }, stop() {},
    }));
    await controller.send("Consulta", { role: "dueno", view: "caja", viewing: "Caja" });
    await controller.send("Resume esta vista", { role: "dueno", view: "caja", viewing: "Caja" });
    const answer = JSON.stringify(store.getSnapshot().thread.at(-1));
    expect(answer).toContain("S/ 123.45");
    expect(answer).toContain("datos incompletos");
    expect(answer).not.toContain("3,120");
  });
});
