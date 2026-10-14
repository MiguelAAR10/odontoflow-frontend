import { describe, expect, it, vi } from "vitest";
import { createAgentStore } from "../src/agui/store";
import { EventType, type Event, type RunAgentInput } from "../src/agui/events";
import type { AgentSourceWithApproval } from "../src/agui/index";
import { createAgentController } from "../src/agui/useAgent";

describe("Inicio: composición del agente", () => {
  it("acusa antes de cargar la fuente y transporta vista, rol e historial", async () => {
    const store = createAgentStore();
    let resolve!: (source: AgentSourceWithApproval) => void;
    let input!: RunAgentInput;
    const factory = vi.fn(() => new Promise<AgentSourceWithApproval>(done => { resolve = done; }));
    const controller = createAgentController(store, factory);
    const sent = controller.send(" Confirma las citas ", { role: "admin", view: "agenda", viewing: "Agenda" });
    expect(store.getSnapshot().run.status).toBe("working");
    expect(store.getSnapshot().thread[0]?.parts[0]).toMatchObject({ text: "Confirma las citas" });
    resolve({ run: async (value: RunAgentInput, emit: (event: Event) => void) => {
      input = value;
      emit({ type: EventType.RUN_FINISHED, threadId: value.threadId, runId: value.runId, outcome: { type: "success" } });
    }, stop() {} });
    await sent;
    expect(input.context).toContainEqual({ description: "Vista actual", value: "Viendo: Agenda" });
    expect(factory).toHaveBeenCalledWith({ role: "admin", view: "agenda" });
    expect(store.getSnapshot().run.status).toBe("done");
    expect(store.getSnapshot().docked).toBe(true);
    expect(store.getSnapshot().panelOpen).toBe(true);
  });

  it("detener durante la carga impide que la fuente arranque después", async () => {
    const store = createAgentStore();
    let resolve!: (source: AgentSourceWithApproval) => void;
    const controller = createAgentController(store, () => new Promise<AgentSourceWithApproval>(done => { resolve = done; }));
    const sent = controller.send("Preparar brief", { role: "doctor", view: "home", viewing: "Inicio" });
    controller.stop();
    const run = vi.fn();
    resolve({ run, stop() {} });
    await sent;
    await Promise.resolve();
    expect(run).not.toHaveBeenCalled();
    expect(store.getSnapshot().run.status).toBe("stopped");
  });

  it("volver al centro conserva el hilo y cierra el panel", async () => {
    const store = createAgentStore();
    const controller = createAgentController(store, async () => ({ run: async (input, emit) => {
      emit({ type: EventType.RUN_FINISHED, threadId: input.threadId, runId: input.runId, outcome: { type: "success" } });
    }, stop() {} }));
    await controller.send("hola", { role: "admin", view: "home", viewing: "Inicio" });
    controller.toCenter();
    expect(store.getSnapshot()).toMatchObject({ docked: false, panelOpen: false });
    expect(store.getSnapshot().thread).toHaveLength(1);
  });
});
