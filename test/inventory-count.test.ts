import { describe, expect, it } from "vitest";
import { parseInventoryCountCommand } from "../src/inventory-count.js";
import type { Product } from "../src/types.js";

const products: Product[] = [
  { id: "gloves", name: "Guantes de nitrilo", unit: "cajas", kind: "consumible", status: "Activo" },
  { id: "resin", name: "Resina dental", unit: "frascos", kind: "consumible", status: "Activo" },
];

describe("written inventory count parser", () => {
  it("matches an exact product and quantity with an optional unit", () => {
    expect(parseInventoryCountCommand("Guantes de nitrilo: 18 cajas", products)).toEqual({ ok: true, productId: "gloves", quantity: 18 });
    expect(parseInventoryCountCommand("Resina dental 2,5", products)).toEqual({ ok: true, productId: "resin", quantity: 2.5 });
  });

  it("normalizes accents, case and repeated spaces", () => {
    expect(parseInventoryCountCommand("  RESINA   DENTAL = 4 FRASCOS ", products)).toEqual({ ok: true, productId: "resin", quantity: 4 });
  });

  it("keeps unknown, malformed and conflicting product input distinguishable", () => {
    expect(parseInventoryCountCommand("Producto nuevo: 4", products)).toEqual({ ok: false, code: "not_found" });
    expect(parseInventoryCountCommand("Guantes de nitrilo: varios", products)).toEqual({ ok: false, code: "invalid" });
    expect(parseInventoryCountCommand("Guantes de nitrilo: 4 frascos", products)).toEqual({ ok: false, code: "invalid" });
    expect(parseInventoryCountCommand("Guantes de nitrilo: -2 cajas", products)).toEqual({ ok: false, code: "invalid" });
    expect(parseInventoryCountCommand("   ", products)).toEqual({ ok: false, code: "empty" });
  });

  it("rejects duplicate exact names instead of choosing one silently", () => {
    const duplicate = [...products, { ...products[0]!, id: "gloves-copy" }];
    expect(parseInventoryCountCommand("Guantes de nitrilo: 18 cajas", duplicate)).toEqual({ ok: false, code: "ambiguous" });
  });
});
