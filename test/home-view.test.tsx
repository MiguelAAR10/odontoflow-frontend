import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { HomePage } from "../src/views/HomePage";

const model = vi.hoisted(() => ({ role: "admin", panelOpen: false, docked: false, queries: 0, working: false, stop: vi.fn(), run: { status: "idle", what: null }, send: vi.fn(() => Promise.resolve()) }));
vi.mock("../src/api", () => ({ useMocks: false, toApiError: (error: Error) => ({ message: error.message }),
  loadAiriHome: async () => { throw new Error("Inicio no disponible"); },
  loadAiriState: async () => { throw new Error("Corte no disponible"); },
}));
vi.mock("../src/components/PersonaContext", () => ({ usePersona: () => ({ identity: { displayName: "María Real" } }) }));
vi.mock("../src/components/shell/ShellContext", () => ({ useShellContext: () => ({ role: model.role }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../src/agui/useAgent", async () => {
  const { createInitialState } = await import("../src/agui/reducer");
  return { useAgent: () => ({ ...createInitialState(), ...model, openPanel: vi.fn(), closePanel: vi.fn(), toCenter: vi.fn() }) };
});
const content = (view: ReactTestRenderer) => JSON.stringify(view.toJSON());

describe("Inicio: presentación honesta y entrada única", () => {
  beforeEach(() => { Object.assign(model, { role: "admin", panelOpen: false, docked: false, queries: 0, working: false, run: { status: "idle", what: null } }); model.send.mockClear(); });
  it("en modo real saluda a la identidad y no muestra datos del simulador", async () => {
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<HomePage />); });
    expect(content(view)).toContain("María");
    expect(content(view)).not.toContain("Miraflores");
    expect(content(view)).not.toContain("3,120");
    expect(view.root.findAllByProps({ "data-airi-input": true })).toHaveLength(1);
    expect(view.root.findAllByProps({ className: "airi-home-task" })).toHaveLength(5);
    view.unmount();
  });
  it("con el panel abierto retira la entrada grande y no monta el hilo al centro", async () => {
    Object.assign(model, { docked: true, panelOpen: true, queries: 2 });
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<HomePage />); });
    expect(view.root.findAllByType("input")).toHaveLength(0);
    expect(view.root.findAllByProps({ "data-thread-location": "center" })).toHaveLength(0);
    expect(content(view)).toContain("2");
    expect(content(view)).toContain("consultas");
    view.unmount();
  });
  it("permite detener y anuncia progreso con Inicio anclado y panel cerrado", async () => {
    Object.assign(model, { docked: true, queries: 1, working: true, run: { status: "working", what: "Confirmando las citas" } });
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<HomePage />); });
    expect(view.root.findAllByProps({ "data-airi-input": true })).toHaveLength(1);
    expect(view.root.findByProps({ role: "status" }).props["aria-live"]).toBe("polite");
    expect(content(view)).toContain("Confirmando las citas");
    const stop = view.root.findAllByType("button").find(button => button.children.join("") === "Detener")!;
    expect(stop).toBeDefined();
    await act(async () => { stop.props.onClick(); });
    expect(model.stop).toHaveBeenCalledOnce();
    view.unmount();
  });
  it.each([["admin", 3], ["dueno", 2], ["doctor", 1]] as const)("las consultas de %s envían la intención con contexto de Inicio", async (role, index) => {
    model.role = role;
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<HomePage />); });
    await act(async () => { view.root.findAllByProps({ className: "airi-home-task" })[index]!.props.onClick(); });
    expect(model.send).toHaveBeenCalledWith(expect.any(String), { role, view: "home", viewing: "Inicio" });
    view.unmount();
  });
});
