import { describe, expect, it } from "vitest";
import { cashPaymentTotals, projectCashCut } from "../src/views/CashPage";
import { CardSchema } from "../src/agui/card";
import proposals from "../src/agui/sim/fixtures/proposals.json";
import states from "../src/agui/sim/fixtures/state.json";
import type { Payment } from "../src/types";

const payment = (id: string, amount: number, verificationStatus?: Payment["verificationStatus"]): Payment => ({
  id, amount, verificationStatus, method: "yape", paidAt: "2026-10-13T14:00:00-05:00",
});
const yape = CardSchema.parse(proposals.find(card => card.id === "p-yape"));
const caja = CardSchema.parse(proposals.find(card => card.id === "p-caja"));

describe("Caja: cobrado verificado separado", () => {
  it("solo cuenta como cobrado un pago explícitamente verificado, incluso en efectivo", () => {
    expect(cashPaymentTotals([{ payments: [payment("1", 120, "unverified"), payment("2", 80, "verified"),
      { ...payment("3", 30), method: "efectivo" }] }])).toEqual({ verified: 80, pending: 150 });
  });
  it("no infiere verificación a partir del total pagado y suma en céntimos", () => {
    expect(cashPaymentTotals([{ payments: [payment("1", .1, "verified"), payment("2", .2, "verified")] }]))
      .toEqual({ verified: .3, pending: 0 });
    expect(cashPaymentTotals([])).toEqual({ verified: 0, pending: 0 });
  });
  it("un abono solo pasa a verificado con la aprobación humana confirmada", () => {
    const snapshot = states[0]!;
    const before = projectCashCut(snapshot, [yape]);
    expect(before).toEqual({ verified: 6240, pending: 1180 });
    const approved = { ...yape, state: "approved" as const };
    expect(projectCashCut(snapshot, [approved])).toEqual({ verified: 6360, pending: 1060 });
    expect(projectCashCut(snapshot, [approved, approved])).toEqual({ verified: 6360, pending: 1060 });
    expect(snapshot.sedes[0]!.collected.amount_cents).toBe(312000);
  });
  it("mantiene el corte y la aprobación dentro de la sede activa", () => {
    expect(projectCashCut(states[0]!, [yape], "Lince")).toEqual({ verified: 3120, pending: 420 });
    expect(projectCashCut(states[0]!, [{ ...yape, state: "approved" }], "Lince")).toEqual({ verified: 3240, pending: 300 });
    expect(projectCashCut(states[0]!, [{ ...yape, state: "approved" }], "Miraflores")).toEqual({ verified: 2410, pending: 640 });
    expect(projectCashCut(states[0]!, [yape], "Sede sin corte")).toEqual({ verified: 0, pending: 0 });
  });
  it("delegar caja, rechazar o fallar una propuesta no aumenta cobrado", () => {
    for (const state of ["pending", "declined", "delegated", "undone"] as const) {
      expect(projectCashCut(states[0]!, [{ ...yape, state }])).toEqual({ verified: 6240, pending: 1180 });
    }
    expect(projectCashCut(states[0]!, [{ ...caja, state: "delegated" }])).toEqual({ verified: 6240, pending: 1180 });
  });
});

// Session store, rather than the mounted view, owns the simulated decisions.
describe("Caja: fuente/store compartidos", () => {
  it("conserva decisiones entre vistas y rechaza una segunda aprobación", async () => {
    const { createCashPreviewSession } = await import("../src/views/CashPage");
    const session = await createCashPreviewSession();
    await session.store.approve("p-yape");
    await session.store.approve("p-caja");
    const cards = Object.values(session.store.getSnapshot().cards).map(entry => entry.card);
    expect(projectCashCut(session.snapshot, cards)).toEqual({ verified: 6360, pending: 1060 });
    await expect(session.store.approve("p-yape")).rejects.toMatchObject({ code: "CARD_NOT_PENDING" });
    expect(session.store.getSnapshot().cards['p-caja']?.card.result).toContain('Delegado a Rosa');
    expect(projectCashCut(session.snapshot, cards)).toEqual({ verified: 6360, pending: 1060 });
  });
  it("rechaza versión/hash distintos y repite la respuesta para la misma clave", async () => {
    const { createCashPreviewSession } = await import("../src/views/CashPage");
    const session = await createCashPreviewSession();
    await expect(session.approveCard({ ...yape, version: 2 }, 'intent')).rejects.toThrow();
    await expect(session.approveCard({ ...yape, body: 'modificado' }, 'intent')).rejects.toThrow();
    const response = await session.approveCard(yape, 'intent');
    expect(await session.approveCard(yape, 'intent')).toEqual(response);
    await expect(session.approveCard(caja, 'intent')).rejects.toThrow();
    await expect(session.approveCard(yape, 'otra-intencion')).rejects.toThrow();
  });
  it("reintenta con la misma clave tras perder la respuesta, sin mover dinero antes de confirmarla", async () => {
    const { createCashPreviewSession } = await import("../src/views/CashPage");
    const session = await createCashPreviewSession();
    const keys: string[] = [];
    session.store.configure({ source: session.source, toApiError: error => ({ code: 'ERROR', message: String(error), httpStatus: 0 }),
      approveCard: async (card, key) => {
        keys.push(key);
        const response = await session.approveCard(card, key);
        if (keys.length === 1) throw new Error('Respuesta perdida');
        return response;
      },
    });
    await session.store.send('Corte de caja');
    await expect(session.store.approve('p-yape')).rejects.toMatchObject({ message: expect.stringContaining('Respuesta perdida') });
    const totals = () => projectCashCut(session.snapshot, Object.values(session.store.getSnapshot().cards).map(entry => entry.card));
    expect(totals()).toEqual({ verified: 6240, pending: 1180 });
    await session.store.approve('p-yape');
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(totals()).toEqual({ verified: 6360, pending: 1060 });
  });
});
