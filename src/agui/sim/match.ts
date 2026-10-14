import index from "./fixtures/index.json" with { type: "json" };

export type SimRole = "dueno" | "admin" | "doctor";
export interface ScenarioMatch { scenarioId: string | null; message: string; suggestions: string[] }
export const scenarios = index.scenarios;

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
}

/** Role is a routing context, never a substitute for backend authorization.
 * Exact index phrases win; short requests follow the mockup's route() vocabulary.
 */
export function matchScenario(text: string, role: SimRole, view: string): ScenarioMatch {
  const query = normalize(text);
  const canvas = /^(lienzo|canvas)$/.test(view.replace(/^\//, ""));
  const candidates = scenarios.filter((scenario) => scenario.role === role);
  const contextual = candidates.filter((scenario) => scenario.id.startsWith("cv-") === canvas);
  const suggestions = (contextual.length ? contextual : candidates).map((scenario) => scenario.phrases[0]!);
  if (/^(si|dale|ok|ya|apruebo)$/.test(query)) {
    return { scenarioId: null, message: "Escribir un asentimiento no aprueba nada. Usa el botón de la tarjeta para revisar y aprobar.", suggestions };
  }
  const exact = candidates.find((scenario) => scenario.phrases.some((phrase) => normalize(phrase) === query));
  let id = exact?.id;
  if (!id) {
    if (role === "admin") {
      if (/\b(hueco|huecos|cupo|cupos)\b/.test(query)) id = canvas ? "cv-huecos" : "admin-hueco";
      else if (/\bconfirm\w*/.test(query)) id = "admin-confirma";
      else if (canvas && /\b(cobranza|cobro|cobros)\b/.test(query)) id = "cv-cobranza";
    } else if (role === "dueno") {
      if (canvas && /\bsedes?\b/.test(query)) id = "cv-sedes";
      else if (/por que|miraflores|cobra menos/.test(query)) id = "dueno-compara";
    } else if (/\bbrief\b/.test(query)) id = "doctor-brief";
    else if (/\bevolucion\b/.test(query)) id = "doctor-evo";
  }
  return id ? { scenarioId: id, message: "", suggestions: [] }
    : { scenarioId: null, message: `No entendí, prueba: ${suggestions.join(" · ")}`, suggestions };
}
