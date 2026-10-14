import { describe, expect, it } from "vitest";
import agenda from "../../../src/agui/sim/fixtures/agenda.json";
import { doctorDay, nextPatient, pendingFields, canSignDraft, briefBlocks, scenarioDraft } from "./doctor";

const cut = "2026-10-13T14:00:00-05:00";
describe("D7 · jornada y firma clínica", () => {
  it("solo expone las seis citas del doctor en la sede y día del corte", () => {
    const rows = doctorDay(agenda, "ruiz", "Lince", cut);
    expect(rows.map(row => row.patient)).toEqual(["Marco Díaz", "Carlos Rojas", "Ana Torres", "Daniela Soto", "Carmen Díaz", "Luis Chávez"]);
    expect(doctorDay(agenda, "ruiz", "Miraflores", cut)).toEqual([]);
    expect(doctorDay(agenda, "ruiz", "Lince", "2026-10-14T14:00:00-05:00")).toEqual([]);
  });
  it("el día se calcula en Lima aunque el corte venga en UTC", () => {
    expect(doctorDay(agenda, "ruiz", "Lince", "2026-10-14T02:00:00Z")).toHaveLength(6);
  });
  it("prefiere al paciente que llegó y nunca deduce atención por el reloj", () => {
    const rows = doctorDay(agenda, "ruiz", "Lince", cut);
    expect(nextPatient(rows, "2026-10-13T19:00:00-05:00")?.patient).toBe("Ana Torres");
    expect(rows.find(row => row.patient === "Carlos Rojas")?.state).toBe("sin cerrar");
  });
  it("omite ausentes/cerradas incluso cuando son futuras", () => {
    const rows = doctorDay(agenda, "ruiz", "Lince", cut).map(row => ({ ...row, state: "cerrada" as const }));
    expect(nextPatient(rows, cut)).toBeUndefined();
  });
  it("no devuelve citas de todos si falta la identidad del doctor", () => {
    expect(doctorDay(agenda, "", "", cut)).toEqual([]);
  });
  it("el brief mantiene seis bloques y no inventa alergias, plan ni evolución", () => {
    const row = doctorDay(agenda, "ruiz", "Lince", cut)[2]!;
    const blocks = briefBlocks(row, cut);
    expect(blocks).toHaveLength(6);
    expect(blocks[0]!.text).toContain("Ana Torres");
    expect(blocks[0]!.source).toContain("13/10/2026");
    expect(blocks.slice(2).every(block => block.text.includes("No consta") && block.source.length > 0)).toBe(true);
  });
  it("los marcadores completos o abiertos bloquean la firma", () => {
    expect(pendingFields("Longitudes: [confirmar]. Técnica: [pendiente")).toBe(2);
    expect(canSignDraft({ mocks: true, role: "doctor", text: "[confirmar]", reviewedText: "[confirmar]" })).toBe(false);
  });
  it("un borrador vacío o modificado después de revisar no se firma", () => {
    expect(canSignDraft({ mocks: true, role: "doctor", text: "  ", reviewedText: "  " })).toBe(false);
    expect(canSignDraft({ mocks: true, role: "doctor", text: "Texto nuevo", reviewedText: "Texto anterior" })).toBe(false);
  });
  it.each(["admin", "dueno"])("el rol %s nunca firma", role => {
    expect(canSignDraft({ mocks: true, role, text: "Nota revisada", reviewedText: "Nota revisada" })).toBe(false);
  });
  it("un rol de presentación doctor no habilita firma real", () => {
    expect(canSignDraft({ mocks: false, role: "doctor", text: "Nota revisada", reviewedText: "Nota revisada" })).toBe(false);
    expect(canSignDraft({ mocks: true, role: "doctor", text: "Nota revisada", reviewedText: "Nota revisada" })).toBe(true);
  });
  it("solo acepta borradores del escenario, nunca estados firmado enviados por agente", () => {
    expect(scenarioDraft({ state: "firmado", text: "Nota" })).toBeNull();
    expect(scenarioDraft({ state: "borrador", text: "Nota [confirmar]" })).toBe("Nota [confirmar]");
    expect(scenarioDraft({ state: "borrador", text: 42 })).toBeNull();
  });
});
