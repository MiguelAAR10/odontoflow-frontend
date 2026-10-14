import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CardSchema, CardScopeSchema, MoneySchema } from "../src/agui/card.js";

// A3 will supply the checked-in copy. Until then read the backend authority,
// never a handwritten test schema. Fail explicitly if neither is available.
const roots = [
  "src/agui/sim/fixtures",
  "../../odontoflow-backend/contracts/airi-v10",
  "../backend-airi-contract/contracts/airi-v10",
];
const contractRoot = roots.map((root) => resolve(root))
  .find((root) => existsSync(resolve(root, "schema/Card.json")));
if (!contractRoot) throw new Error("No se encuentra schema/Card.json del backend AIRI.");
const schema = JSON.parse(readFileSync(resolve(contractRoot, "schema/Card.json"), "utf8"));
const cards: unknown[] = JSON.parse(readFileSync(resolve(contractRoot, "cards.json"), "utf8"));

describe("Card: contrato del backend", () => {
  it("coincide en claves, campos requeridos, enums y opcionales con Card.json", () => {
    const generated = z.toJSONSchema(CardSchema);
    expect(Object.keys(generated.properties ?? {}).sort()).toEqual(Object.keys(schema.properties).sort());
    expect(generated.required?.slice().sort()).toEqual(schema.required.slice().sort());
    expect(generated.additionalProperties).toBe(false);
    for (const key of ["agent", "level", "state", "reversible"]) {
      const property = generated.properties?.[key];
      expect(property && typeof property === "object" ? property.enum : undefined).toEqual(schema.properties[key].enum);
    }
    for (const key of Object.keys(schema.properties)) {
      expect(CardSchema.shape[key as keyof typeof CardSchema.shape].isOptional())
        .toBe(!schema.required.includes(key));
    }
  });

  it("acepta todas las tarjetas reales sin inventar campos del DTO", () => {
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) expect(CardSchema.parse(card)).toEqual(card);
    expect(CardSchema.parse({ id: "c", agent: "airi", level: "auto", state: "ready", title: "Resumen", body: "", version: 1 }))
      .toEqual({ id: "c", agent: "airi", level: "auto", state: "ready", title: "Resumen", body: "", version: 1 });
  });

  it("exige version positiva y hash sha256 para aprobar o editar borradores", () => {
    const base = { id: "c", agent: "airi", level: "auto", state: "ready", title: "Resumen", body: "", version: 3 };
    expect(CardSchema.safeParse(base).success).toBe(true);
    expect(CardSchema.safeParse({ ...base, version: undefined }).success).toBe(false);
    for (const version of [0, -1, 1.5, null]) expect(CardSchema.safeParse({ ...base, version }).success).toBe(false);
    for (const level of ["aprobar", "borrador"]) {
      for (const payload_hash of [undefined, null, "abc", "g".repeat(64)]) {
        expect(CardSchema.safeParse({ ...base, level, payload_hash }).success).toBe(false);
      }
      expect(CardSchema.safeParse({ ...base, level, payload_hash: "A1".repeat(32), proposal_id: 7 }).success).toBe(true);
    }
    expect(CardSchema.safeParse({ ...base, payload_hash: null, proposal_id: null }).success).toBe(true);
    expect(CardSchema.safeParse({ ...base, revision: 0 }).success).toBe(false);
  });

  it("mantiene las claves y campos requeridos de Money y CardScope", () => {
    for (const [name, local] of [["Money", MoneySchema], ["CardScope", CardScopeSchema]] as const) {
      const generated = z.toJSONSchema(local);
      expect(Object.keys(generated.properties ?? {}).sort()).toEqual(Object.keys(schema.$defs[name].properties).sort());
      expect(generated.required?.slice().sort()).toEqual(schema.$defs[name].required.slice().sort());
      expect(generated.additionalProperties).toBe(false);
    }
  });

  it("rechaza campos extra, importes inválidos, enums y fechas fuera del contrato", () => {
    const base = { id: "c", agent: "airi", level: "auto", state: "ready", title: "Resumen", body: "", version: 1 };
    for (const fields of [
      { version: 0 }, { payload_hash: "inventado" }, { agent: "otro" }, { state: "loading" },
      { revision: -1 }, { undo_window_seconds: 0 }, { approve: "" },
      { amounts: [{ label: "Total", currency: "USD", amount_cents: 1 }] },
      { amounts: [{ label: "Total", currency: "PEN", amount_cents: -1 }] },
      { delta: { sede: "Lince", currency: "PEN", amount_cents: 1.5 } },
      { scope: [{ label: "Hasta", value: "Hoy", expires_at: "hoy" }] },
      { scope: [{ label: "Hasta", value: "Hoy", extra: true }] },
    ]) expect(CardSchema.safeParse({ ...base, ...fields }).success).toBe(false);
    expect(CardSchema.safeParse({ ...base, scope: [{ label: "Vence", value: "Hoy", expires_at: "2026-10-13T18:00:00-05:00" }] }).success).toBe(true);
  });
});
