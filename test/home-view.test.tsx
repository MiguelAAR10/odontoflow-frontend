import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { HomePage } from "../src/views/HomePage";

const model = vi.hoisted(() => ({ role: "admin", panelOpen: false, docked: false, queries: 0, send: vi.fn(() => Promise.resolve()) }));
vi.mock("../src/api", () => ({ useMocks: false, toApiError: (error: Error) => ({ message: error.message }) }));
vi.mock("../src/components/PersonaContext", () => ({ usePersona: () => ({ identity: { displayName: "María Real" } }) }));
vi.mock("../src/components/shell/ShellContext", () => ({ useShellContext: () => ({ role: model.role }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../src/agui/useAgent", async () => {
  const { createInitialState } = await import("../src/agui/reducer");
  return { useAgent: () => ({ ...createInitialState(), ...model, working: false, openPanel: vi.fn(), closePanel: vi.fn(), toCenter: vi.fn() }) };
});
const content = (view: ReactTestRenderer) => JSON.stringify(view.toJSON());

describe("Inicio: presentación honesta y entrada única", () => {
  beforeEach(() => { Object.assign(model, { role: "admin", panelOpen: false, docked: false, queries: 0 }); model.send.mockClear(); });
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
  it.each(["admin", "dueno", "doctor"])("las tareas de %s envían la intención con contexto de Inicio", async role => {
    model.role = role;
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<HomePage />); });
    await act(async () => { view.root.findAllByProps({ className: "airi-home-task" })[0]!.props.onClick(); });
    expect(model.send).toHaveBeenCalledWith(expect.any(String), { role, view: "home", viewing: "Inicio" });
    view.unmount();
  });
});
