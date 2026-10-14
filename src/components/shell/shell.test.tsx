import { describe, expect, it, vi } from "vitest";
import { act, create } from "react-test-renderer";
import { getNavigation, navigationTitle } from "../../nav";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "../AppShell";
import { InteractionBar } from "./InteractionBar";

describe("AIRI shell navigation", () => {
  it.each([
    ["dueno", ["Inicio", "Dirección", "Agenda", "Caja", "Bandeja", "Lienzo", "Rastro"]],
    ["doctor", ["Inicio", "Mi jornada", "Atención", "Mi agenda", "Lienzo", "Rastro"]],
    ["admin", ["Inicio", "Mi turno", "Bandeja", "Agenda", "Caja", "Lienzo", "Rastro"]],
  ] as const)("matches the v10 %s navigation", (role, labels) => {
    expect(getNavigation(role).map(item => item.label)).toEqual(labels);
  });
  it("preserves routes of existing views", () => {
    expect(getNavigation("admin").find(item => item.label === "Bandeja")?.to).toBe("/aprobaciones");
    expect(navigationTitle("/agente", "admin")).toBe("Rastro");
    expect(navigationTitle("/agenda", "doctor")).toBe("Mi agenda");
  });
});
describe("InteractionBar intent", () => {
  it("ignores whitespace and submits one trimmed intent", async () => {
    const submit = vi.fn();
    const view = create(<InteractionBar onSubmit={submit} />);
    const input = () => view.root.findByType("input");
    const send = () => view.root.findByType("form").props.onSubmit({ preventDefault() {} });
    await act(async () => { input().props.onChange({ target: { value: "   " } }); });
    await act(async () => { send(); });
    expect(submit).not.toHaveBeenCalled();
    await act(async () => { input().props.onChange({ target: { value: "  Revisar agenda  " } }); });
    await act(async () => { send(); });
    expect(submit).toHaveBeenCalledExactlyOnceWith("Revisar agenda");
    expect(input().props.value).toBe("");
    view.unmount();
  });
});

const route = vi.hoisted(() => ({ path: "/agenda" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.path, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../PersonaContext", () => ({
  usePersona: () => ({ version: 0, identity: null, loading: false, switching: false, error: "" }),
  PersonaPicker: () => null,
}));
vi.mock("./ShellContext", () => ({ useShellContext: () => ({ role: "admin", locationId: "", setRole: vi.fn(), setLocationId: vi.fn() }) }));
describe("shell route boundaries", () => {
  it("leaves existing view content mounted with the empty panel seam", () => {
    route.path = "/agenda";
    const html = renderToStaticMarkup(<AppShell><p>Existing agenda</p></AppShell>);
    expect(html).toContain("Existing agenda");
    expect(html).toContain('id="agent-panel"');
    expect(html).toContain("Pregúntale a AIRI");
    expect(html).toContain('id="crew"');
  });
  it.each(["/lienzo", "/lienzo/board"])("removes the panel and input on %s", path => {
    route.path = path;
    const html = renderToStaticMarkup(<AppShell><p>Canvas</p></AppShell>);
    expect(html).toContain("Canvas");
    expect(html).not.toContain('id="agent-panel"');
    expect(html).not.toContain("Pregúntale a AIRI");
    expect(html).not.toContain('aria-label="Abrir asistente"');
  });
});
