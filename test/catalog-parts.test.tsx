import { createElement } from "react";
import { create, type ReactTestInstance } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { Part } from "../src/catalog/Part";
import { parseCatalogItem } from "../src/catalog/registry";

const text = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : text(child)).join("");
describe("Part · datos compactos", () => {
  it("presenta tablas, listas y KPI con valores proporcionados", () => {
    const view = create(createElement(Part, { kind: "table", title: "Agenda", columns: [{ key: "patient", label: "Paciente" }, { key: "amount", label: "Saldo" }], rows: [{ patient: "Ana", amount: { amount_cents: 33000, currency: "PEN" } }] }));
    expect(view.root.findAllByType("th").map(text)).toEqual(["Paciente", "Saldo"]);
    expect(view.root.findAllByType("td").map(text)).toEqual(["Ana", "S/ 330.00"]);
    view.update(createElement(Part, { kind: "list", title: "Citas", items: [{ label: "Ana", value: "17:00" }] }));
    expect(text(view.root.findByType("li"))).toContain("17:00");
    view.update(createElement(Part, { kind: "kpi", title: "Cobrado verificado", items: [{ label: "Hoy", value: { amount_cents: 12000, currency: "PEN" } }] }));
    expect(text(view.root.findByType("dd"))).toBe("S/ 120.00");
    view.unmount();
  });

  it("muestra vacío sin inventar totales y rechaza columnas incoherentes", () => {
    const view = create(createElement(Part, { kind: "list", title: "Citas", items: [] }));
    expect(text(view.root)).toContain("Sin datos para mostrar");
    expect(parseCatalogItem({ type: "Part", props: { kind: "table", title: "Agenda", columns: [{ key: "patient", label: "Paciente" }], rows: [{ other: "Ana" }] } }).type).toBe("Fallback");
    view.unmount();
  });
});
