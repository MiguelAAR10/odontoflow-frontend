import { createElement } from "react";
import { create } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { CatalogRenderer, parseCatalogItem } from "../src/catalog/registry";

describe("catálogo cerrado", () => {
  it("rechaza tipos desconocidos, props inválidas y atributos ajenos", () => {
    for (const input of [null, { type: "script", props: {} }, { type: "Say", props: { text: 1 } }, { type: "Say", props: { text: "hola", onClick: "aprobar" } }]) {
      expect(parseCatalogItem(input).type).toBe("Fallback");
      const view = create(createElement(CatalogRenderer, { item: input }));
      expect(view.root.findByProps({ role: "status" }).children.join("")).toContain("No puedo mostrar");
      view.unmount();
    }
  });

  it("acepta texto literal sin convertirlo en una acción", () => {
    expect(parseCatalogItem({ type: "Say", props: { text: "sí, ya, apruebo" } })).toEqual({ type: "Say", props: { text: "sí, ya, apruebo" } });
  });

  it.each([
    { type: "Part", props: { kind: "kpi", title: "Resumen", items: [{ label: "Hoy", value: 2 }] } },
    { type: "Card", props: { card: { id: "test", agent: "airi", level: "auto", state: "ready", version: 1, title: "Resumen", body: "Datos" } } },
    { type: "Notice", props: { text: "Pendiente de revisar" } },
    { type: "Ask", props: { text: "¿Qué sede?", options: [{ id: "lince", label: "Lince" }] } },
    { type: "Act", props: { label: "Agenda", target: "agenda" } },
    { type: "Status", props: { text: "Leyendo", state: "working" } },
    { type: "Fallback", props: {} },
  ])("valida y renderiza $type", item => {
    expect(parseCatalogItem(item).type).toBe(item.type);
    const view = create(createElement(CatalogRenderer, { item }));
    expect(view.toJSON()).not.toBeNull();
    view.unmount();
  });

  it("rechaza DTO ampliado, importes negativos y opciones repetidas", () => {
    const card = { id: "test", agent: "airi", level: "auto", state: "ready", version: 1, title: "Resumen", body: "Datos" };
    for (const item of [
      { type: "Card", props: { card: { ...card, payload_hash: "inventado" } } },
      { type: "Part", props: { kind: "kpi", title: "Importe", items: [{ label: "Hoy", value: { amount_cents: -100, currency: "PEN" } }] } },
      { type: "Ask", props: { text: "¿Qué sede?", options: [{ id: "lince", label: "Lince" }, { id: "lince", label: "Lince" }] } },
    ]) expect(parseCatalogItem(item).type).toBe("Fallback");
  });
});
