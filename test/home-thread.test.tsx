import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventType } from "../src/agui/events";
import { agentStore } from "../src/agui/store";
import { Thread, threadDestination, threadItem, moveThread } from "../src/components/shell/Thread";
import { CatalogRenderer } from "../src/catalog/registry";
import { limaGreeting } from "../src/views/HomePage";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/home" }));
vi.mock("../src/components/shell/ShellContext", () => ({ useShellContext: () => ({ role: "admin" }) }));

describe("Inicio: hilo y navegación", () => {
  beforeEach(() => { agentStore.clear(); push.mockReset(); });
  it("usa la hora Lima, incluso alrededor de medianoche UTC", () => {
    expect(limaGreeting(new Date("2026-10-14T03:00:00Z"))).toBe("Buenas noches");
    expect(limaGreeting(new Date("2026-10-14T14:00:00Z"))).toBe("Buenos días");
    expect(limaGreeting(new Date("2026-10-14T19:00:00Z"))).toBe("Buenas tardes");
  });
  it("resuelve solo rutas locales del rol y rechaza URLs y destinos desconocidos", () => {
    expect(threadDestination("agenda", "admin")).toBe("/agenda");
    expect(threadDestination("ficha", "admin")).toBeNull();
    expect(threadDestination("javascript:alert(1)", "dueno")).toBeNull();
    expect(threadDestination("__proto__", "admin")).toBeNull();
    expect(threadDestination("ficha", "doctor")).toBe("/atencion");
  });
  it("degrada partes desconocidas al Fallback y no ejecuta selectores del stream", () => {
    const item = threadItem({ type: "part", key: "run-script", props: { script: "alert(1)" } }, null, {});
    const view = create(<CatalogRenderer item={item} />);
    expect(view.root.findByProps({ role: "status" }).children.join("")).toContain("No puedo mostrar este contenido");
    const pointer = threadItem({ type: "part", key: "pointer", props: { points: [{ selector: "body", label: null }] } }, null, {});
    expect(pointer).toMatchObject({ type: "Notice" });
    view.unmount();
  });
  it("ancla el hilo al navegar con Act y deja cero turnos al centro", async () => {
    agentStore.configure({ toApiError: error => ({ code: "ERR", message: String(error), httpStatus: 0 }), source: {
      async run(input, emit) {
        emit({ type: EventType.CUSTOM, name: "airi.part", value: { key: "Act", props: { label: "Agenda", target: "agenda" } } });
        emit({ type: EventType.RUN_FINISHED, threadId: input.threadId, runId: input.runId, outcome: { type: "success" } });
      }, stop() {},
    } });
    await agentStore.send("Abrir agenda");
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<Thread />); });
    expect(view.root.findAllByProps({ "data-thread-location": "center" })).toHaveLength(1);
    const open = view.root.findAllByType("button").find(button => button.children.join("") === "Abrir Agenda →")!;
    await act(async () => { await open.props.onClick(); });
    expect(push).toHaveBeenCalledWith("/agenda");
    expect(agentStore.getSnapshot()).toMatchObject({ docked: true, panelOpen: true });
    expect(view.toJSON()).toBeNull();
    await act(async () => { view.update(<Thread location="panel" />); });
    expect(view.root.findAllByProps({ "data-thread-location": "panel" })).toHaveLength(1);
    view.unmount();
  });
  it("mueve el hilo también sin soporte de View Transition", () => {
    const update = vi.fn(); moveThread(update); expect(update).toHaveBeenCalledOnce();
  });
});
