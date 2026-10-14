import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { CatalogRenderer } from "../src/catalog/registry";

const text = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : text(child)).join("");
describe("hilo del catálogo", () => {
  it("renderiza avisos informativos, de advertencia y error, y texto literal", () => {
    for (const tone of ["info", "warning", "error"]) {
      const view = create(createElement(CatalogRenderer, { item: { type: "Notice", props: { text: "Aviso para revisar", tone } } }));
      expect(text(view.root)).toContain("Aviso para revisar");
      expect(view.root.findByProps({ role: tone === "error" ? "alert" : "status" })).toBeDefined();
      view.update(createElement(CatalogRenderer, { item: { type: "Say", props: { text: "<button>Aprobar</button>", agent: "airi" } } }));
      expect(view.root.findAllByType("button")).toHaveLength(0);
      expect(text(view.root)).toContain("<button>Aprobar</button>");
      view.unmount();
    }
  });

  it("Ask selecciona una opción solo tras el clic y bloquea duplicados", async () => {
    let finish!: () => void;
    const onChoose = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const view = create(createElement(CatalogRenderer, { item: { type: "Ask", props: { text: "¿Qué sede?", options: [{ id: "lince", label: "Lince" }] } }, handlers: { onChoose } }));
    expect(onChoose).not.toHaveBeenCalled();
    const button = view.root.findByType("button");
    await act(async () => { button.props.onClick(); button.props.onClick(); });
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith("lince");
    expect(view.root.findByType("button").props.disabled).toBe(true);
    await act(async () => { finish(); });
    expect(view.root.findByType("button").props["aria-pressed"]).toBe(true);
    view.unmount();
  });

  it("Act abre la vista con la acción inyectada, sin ejecutar al renderizar", async () => {
    const onOpen = vi.fn();
    const view = create(createElement(CatalogRenderer, { item: { type: "Act", props: { label: "Agenda", target: "agenda", action: "ver-huecos" } }, handlers: { onOpen } }));
    expect(text(view.root.findByType("button"))).toBe("Abrir Agenda →");
    expect(onOpen).not.toHaveBeenCalled();
    await act(async () => { view.root.findByType("button").props.onClick(); });
    expect(onOpen).toHaveBeenCalledWith("agenda", "ver-huecos");
    view.unmount();
  });

  it("Status muestra el plan plegable y detiene solo tras un clic", async () => {
    const onStop = vi.fn();
    const props = { text: "Revisando agenda", state: "working", plan: [{ label: "Leer agenda", status: "done" }, { label: "Revisar huecos", status: "working" }] };
    const view = create(createElement(CatalogRenderer, { item: { type: "Status", props }, handlers: { onStop } }));
    expect(view.root.findAllByType("ol")).toHaveLength(0);
    await act(async () => { view.root.findAllByType("button")[0]!.props.onClick(); });
    expect(view.root.findAllByType("li").map(text)).toEqual(["✓Leer agenda", "•Revisar huecos"]);
    expect(onStop).not.toHaveBeenCalled();
    await act(async () => { view.root.findAllByType("button").at(-1)!.props.onClick(); });
    expect(onStop).toHaveBeenCalledTimes(1);
    for (const state of ["idle", "waiting", "done", "stopped", "error"]) {
      view.update(createElement(CatalogRenderer, { item: { type: "Status", props: { ...props, state } }, handlers: { onStop } }));
      expect(text(view.root)).toContain("Revisando agenda");
      expect(view.root.findAllByType("button").some(node => text(node) === "Detener")).toBe(false);
    }
    view.unmount();
  });
});
