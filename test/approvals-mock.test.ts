/** FE1 Bandeja — mock mode serves contract shapes and mirrors the backend rules. */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovalItem } from "../src/types";

describe("Bandeja mock mode", () => {
  let api: typeof import("../src/api");

  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "true");
    api = await import("../src/api");
  });
  beforeEach(async () => { await api.choosePersona("secretaria"); });

  const pending = async () => (await api.loadInbox({ status: "pending" })).items;
  const byCategory = async (category: ApprovalItem["category"]) => {
    const item = (await pending()).find((row) => row.category === category);
    if (!item) throw new Error(`mock ${category} item missing`);
    return item;
  };
  const failure = (promise: Promise<unknown>) => promise.then(() => { throw new Error("expected a rejection"); }, (caught) => api.toApiError(caught));

  it("serves every category with plain-Spanish headlines", async () => {
    const items = await pending();
    expect(new Set(items.map((item) => item.category))).toEqual(new Set(["cobranza", "inventario", "lista_espera", "cita"]));
    expect(items.find((item) => item.headline === "Recordar el pago a Rosa Quispe")?.detail).toBe("Debe S/ 180 hace 12 días");
    for (const item of items) expect(item.headline).not.toMatch(/#\d/);
  });

  it("renders actions from the persona's permissions like the backend", async () => {
    expect((await byCategory("inventario")).actions).toEqual(["decline"]);
    expect((await byCategory("cobranza")).actions).toEqual(["approve", "decline"]);
    await api.choosePersona("administrador");
    expect((await byCategory("inventario")).actions).toEqual(["approve", "decline"]);
  });

  it("refuses a secretaria approving an inventory transfer with 403", async () => {
    const transfer = await byCategory("inventario");
    const error = await failure(api.decideInboxItem(transfer, api.beginDecision(transfer, "approve")));
    expect(error).toMatchObject({ httpStatus: 403 });
    expect(api.describeApprovalError(error).message).toBe("Tu rol no permite esta acción.");
  });

  it("rejects a payload hash that does not match", async () => {
    const reminder = await byCategory("cobranza");
    const tampered = { ...reminder, payloadHash: "0".repeat(64) };
    const error = await failure(api.decideInboxItem(tampered, api.beginDecision(tampered, "approve")));
    expect(error).toMatchObject({ code: "PROPOSAL_HASH_MISMATCH", httpStatus: 409 });
  });

  it("executes once, replays the same intent and refuses a second intent", async () => {
    const reminder = (await pending()).find((item) => item.headline === "Recordar el pago a Jorge Huamán")!;
    const intent = api.beginDecision(reminder, "approve");
    const first = await api.decideInboxItem(reminder, intent);
    expect(first).toMatchObject({ replayed: false, item: { status: "executed", decidedBy: "Lucía Ramos", outcome: "Mensaje en cola de envío" } });
    expect((await api.decideInboxItem(reminder, intent)).replayed).toBe(true);
    const again = await failure(api.decideInboxItem(reminder, api.beginDecision(reminder, "approve")));
    expect(again).toMatchObject({ code: "PROPOSAL_NOT_PENDING", httpStatus: 409 });
    expect((await pending()).some((item) => item.key === reminder.key)).toBe(false);
    expect((await api.loadInbox({ status: "executed" })).items.some((item) => item.key === reminder.key)).toBe(true);
  });

  it("confirms an appointment proposal and creates the appointment", async () => {
    const booking = await byCategory("cita");
    expect(booking.facts).toEqual(expect.arrayContaining([{ label: "Servicio", value: "Evaluación dental" }, { label: "Profesional", value: "Dra. Valeria Ruiz" }]));
    const result = await api.decideInboxItem(booking, api.beginDecision(booking, "approve"));
    expect(result.item).toMatchObject({ status: "executed", outcome: "Cita creada" });
  });

  it("Cobranza proposes the new overdue charge once, then dedupes", async () => {
    const first = await api.runAgentNow("cobranza", api.newIdempotencyKey());
    expect(first.lines).toEqual(["3 cargos revisados", "1 propuesta nueva", "2 ya estaban propuestas", "0 omitidos"]);
    expect((await pending()).some((item) => item.headline === "Recordar el pago a Luis Mendoza")).toBe(true);
    const second = await api.runAgentNow("cobranza", api.newIdempotencyKey());
    expect(second.lines).toEqual(["3 cargos revisados", "0 propuestas nuevas", "3 ya estaban propuestas", "0 omitidos"]);
  });

  it("replays a run retried with the same key", async () => {
    const key = api.newIdempotencyKey();
    const first = await api.runAgentNow("confirmaciones", key);
    const replay = await api.runAgentNow("confirmaciones", key);
    expect(replay).toEqual({ ...first, replayed: true });
  });

  it("Inventario is administrador-only", async () => {
    const error = await failure(api.runAgentNow("inventario", api.newIdempotencyKey()));
    expect(error.httpStatus).toBe(403);
    await api.choosePersona("administrador");
    expect((await api.runAgentNow("inventario", api.newIdempotencyKey())).lines[0]).toBe("1 faltante de stock revisado");
  });

  it("knows who is signed in and switches persona", async () => {
    expect((await api.loadIdentity()).displayName).toBe("Lucía Ramos");
    const session = await api.choosePersona("administrador");
    expect(session.current).toBe("administrador");
    expect(session.personas.map((persona) => persona.displayName)).toEqual(["Lucía Ramos", "Carlos Vega"]);
    expect((await api.loadIdentity()).roles).toEqual(["Administrador"]);
    await expect(api.choosePersona("gerente")).rejects.toMatchObject({ code: "PERSONA_UNKNOWN" });
  });

  it("without a persona the backend would answer 401", async () => {
    await api.choosePersona(null);
    expect(await failure(api.loadInbox())).toMatchObject({ httpStatus: 401 });
  });
});
