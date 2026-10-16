import { describe, expect, it } from "vitest";
import { filterInboxCards, inboxContext } from "../src/views/ApprovalsPage";
import { CardSchema } from "../src/agui/card";
import proposals from "../src/agui/sim/fixtures/proposals.json";

const cards = proposals.map(card => CardSchema.parse(card));
const daniela = cards.find(card => card.id === "p-reprog")!;
const yape = cards.find(card => card.id === "p-yape")!;
describe("Bandeja: filtros y contexto trazable", () => {
  it("clasifica una verificación real por su kind, incluso con el título del backend", () => {
    const real = { ...yape, title: "Verificar 1 pagos", kind: "payment_verify" as const };
    expect(filterInboxCards([real], "verify", true)).toEqual([real]);
    expect(filterInboxCards([{ ...real, kind: "collection_reminder" as const, title: "Por verificar" }], "verify", true)).toEqual([]);
  });
  it("por verificar contiene el ingreso Yape pendiente, sin mezclar caja ni aprobadas", () => {
    expect(filterInboxCards(cards, "verify", true).map(card => card.id)).toEqual(["p-yape"]);
    expect(filterInboxCards([{ ...yape, state: "approved" }], "verify", true)).toEqual([]);
  });
  it("Mías solo incluye pendientes que puede decidir la persona", () => {
    expect(filterInboxCards(cards, "mine", false)).toEqual([]);
    expect(filterInboxCards([{ ...daniela, state: "approved" }, yape], "mine", true)).toEqual([yape]);
  });
  it("no equipara un responsable ausente con Sin asignar ni inventa respuestas", () => {
    expect(filterInboxCards(cards, "unassigned", true)).toEqual([]);
    expect(filterInboxCards(cards, "waiting", true)).toEqual([]);
    expect(inboxContext(daniela).responsible).toBe("No consta");
    expect(inboxContext(daniela).reply).toBe("No consta");
  });
  it("conserva canal y fecha de WhatsApp solo cuando están en la tarjeta", () => {
    expect(inboxContext(daniela).channel).toBe("WhatsApp · ventana 24 h abierta");
    expect(inboxContext(daniela).sources).toEqual(["WhatsApp · 13:41"]);
    expect(inboxContext(yape).channel).toBe("No consta");
    expect(inboxContext(yape).sources).toEqual(["WhatsApp · 13:58"]);
    expect(inboxContext(cards[0]!).sources).toEqual([]);
    expect(inboxContext(cards[0]!).evidence).toBe("No consta");
  });
  it("filtra asignación y espera solo con valores explícitos", () => {
    const unassigned = { ...daniela, scope: [{ label: "Responsable", value: "Sin asignar" }] };
    const waiting = { ...daniela, scope: [{ label: "Estado", value: "Esperando respuesta" }] };
    expect(filterInboxCards([unassigned, waiting], "unassigned", true)).toEqual([unassigned]);
    expect(filterInboxCards([unassigned, waiting], "waiting", true)).toEqual([waiting]);
  });
});
