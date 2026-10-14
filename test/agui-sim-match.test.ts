import { describe, expect, it } from "vitest";
import { matchScenario } from "../src/agui/sim/match.js";

describe("selección de escenarios", () => {
  it("normaliza acentos, puntuación y espacios de las frases del índice", () => {
    expect(matchScenario("  QUIEN puede tomar el hueco de la tarde? ", "admin", "agenda")).toMatchObject({ scenarioId: "admin-hueco" });
  });
  it("respeta el rol y ofrece sugerencias del mismo rol", () => {
    const result = matchScenario("Confirma las citas de mañana", "doctor", "home");
    expect(result).toMatchObject({ scenarioId: null });
    expect(result.suggestions).toContain("Prepara el brief de Ana Torres");
    expect(result.suggestions).not.toContain("Confirma las citas de mañana");
  });
  it("elige la variante del lienzo según la vista actual", () => {
    expect(matchScenario("huecos", "admin", "agenda")).toMatchObject({ scenarioId: "admin-hueco" });
    expect(matchScenario("huecos", "admin", "lienzo")).toMatchObject({ scenarioId: "cv-huecos" });
  });
  it("no convierte un asentimiento en escenario de aprobación", () => {
    expect(matchScenario("sí", "admin", "home")).toMatchObject({ scenarioId: null, message: expect.stringContaining("no aprueba") });
  });
  it("devuelve una respuesta de catálogo con sugerencias si no entiende", () => {
    expect(matchScenario("xyz", "dueno", "home")).toMatchObject({ scenarioId: null, message: expect.stringContaining("No entendí, prueba:") });
  });
});

it("ofrece sugerencias aun cuando el rol no tiene escenarios propios de la vista", () => {
  expect(matchScenario("xyz", "doctor", "/lienzo").suggestions).toContain("Prepara el brief de Ana Torres");
});
