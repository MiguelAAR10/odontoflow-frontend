import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentController, useAgent } from "../src/agui/useAgent";
import { agentStore } from "../src/agui/store";
import { getAgentSource } from "../src/agui/index";
import { AgentPanel } from "../src/components/shell/AgentPanel";
import { InteractionBar } from "../src/components/shell/InteractionBar";

const model = vi.hoisted(() => ({ role: "admin", version: 0, current: "recepcion", stop: vi.fn() }));
vi.mock("../src/components/shell/ShellContext", () => ({ useShellContext: () => ({ role: model.role }) }));
vi.mock("../src/components/PersonaContext", () => ({ usePersona: () => model }));
vi.mock("../src/components/shell/Thread", () => ({ Thread: () => null, moveThread: (update: () => void) => update() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/home", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../src/agui/index", () => ({ getAgentSource: vi.fn(async () => ({ run: () => new Promise<void>(() => {}), stop: model.stop })) }));

function Probe() {
  const agent = useAgent();
  return <p data-queries={agent.queries} data-working={agent.working}>{JSON.stringify(agent.thread)}</p>;
}
function ShellBridge() {
  const [open, setOpen] = useState(false);
  return <>
    <button data-toggle onClick={() => setOpen(value => !value)}>Asistente</button>
    <AgentPanel open={open} viewing="Inicio" onClose={() => setOpen(false)} />
    <InteractionBar onSubmit={() => setOpen(true)} onOpenPanel={() => setOpen(true)} />
  </>;
}
let view: ReactTestRenderer | undefined;
beforeEach(() => {
  model.role = "admin"; model.version += 1; model.current = "recepcion"; model.stop.mockClear();
  agentController.reset();
  vi.mocked(getAgentSource).mockClear();
  vi.stubGlobal("HTMLElement", class {});
  vi.stubGlobal("document", { activeElement: null, body: {}, querySelector: () => null, getElementById: () => null, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
});
afterEach(() => { act(() => { view?.unmount(); }); view = undefined; agentController.reset(); vi.unstubAllGlobals(); });

describe("Inicio: identidad persistente y sincronización del shell", () => {
  it.each(["Lienzo", "PersonaGate"])("limpia y cancela la identidad anterior tras desmontar en %s", async boundary => {
    await act(async () => { view = create(<Probe />); });
    await act(async () => { void agentController.send("Consulta privada", { role: "admin", view: "home", viewing: "Inicio" }); });
    expect(view!.root.findByType("p").props["data-queries"]).toBe(1);
    act(() => { view!.unmount(); });
    if (boundary === "Lienzo") model.role = "doctor";
    else { model.version += 1; model.current = "otra-persona"; }
    const observed: string[] = [];
    function Remount() { const agent = useAgent(); observed.push(JSON.stringify(agent.thread)); return <Probe />; }
    await act(async () => { view = create(<Remount />); });
    expect(observed.every(snapshot => !snapshot.includes("Consulta privada"))).toBe(true);
    expect(agentStore.getSnapshot()).toMatchObject({ thread: [], cards: {}, panelOpen: false, docked: false, run: { status: "idle" } });
    expect(model.stop).toHaveBeenCalledOnce();
  });
  it("cancela al cambiar identidad sin desmontar y no reutiliza la fuente anterior", async () => {
    await act(async () => { view = create(<Probe />); });
    await act(async () => { void agentController.send("Consulta anterior", { role: "admin", view: "home", viewing: "Inicio" }); });
    // An ordinary rerender/navigation with the same identity keeps the thread.
    await act(async () => { view!.update(<Probe />); });
    expect(view!.root.findByType("p").props["data-queries"]).toBe(1);
    model.version += 1;
    await act(async () => { view!.update(<Probe />); });
    expect(view!.root.findByType("p").props["data-queries"]).toBe(0);
    expect(model.stop).toHaveBeenCalledOnce();
    await act(async () => { void agentController.send("Consulta nueva", { role: "admin", view: "home", viewing: "Inicio" }); });
    expect(view!.root.findByType("p").children.join("")).not.toContain("Consulta anterior");
    expect(view!.root.findByType("p").props["data-working"]).toBe(true);
    expect(getAgentSource).toHaveBeenCalledTimes(2);
  });
  it("no reabre al cerrar desde el shell, con o sin consultas", async () => {
    await act(async () => { view = create(<ShellBridge />); });
    const toggle = () => view!.root.findByProps({ "data-toggle": true }).props.onClick();
    const panel = () => view!.root.findByType("aside");
    await act(async () => { toggle(); });
    expect(panel().props.hidden).toBe(false);
    await act(async () => { toggle(); });
    expect(panel().props.hidden).toBe(true);
    expect(agentStore.getSnapshot().panelOpen).toBe(false);
    await act(async () => { void agentController.send("Confirma las citas", { role: "admin", view: "home", viewing: "Inicio" }); });
    expect(panel().props.hidden).toBe(false);
    await act(async () => { toggle(); });
    expect(panel().props.hidden).toBe(true);
    expect(agentStore.getSnapshot().run.status).toBe("working");
    await act(async () => { toggle(); });
    await act(async () => { view!.root.findAllByProps({ "aria-label": "Cerrar asistente" })[0]!.props.onClick(); });
    expect(panel().props.hidden).toBe(true);
    expect(agentStore.getSnapshot().panelOpen).toBe(false);
  });
});
