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
  it("delegar caja, rechazar o fallar una propuesta no aumenta cobrado", () => {
    for (const state of ["pending", "declined", "delegated", "undone"] as const) {
      expect(projectCashCut(states[0]!, [{ ...yape, state }])).toEqual({ verified: 6240, pending: 1180 });
    }
    expect(projectCashCut(states[0]!, [{ ...caja, state: "delegated" }])).toEqual({ verified: 6240, pending: 1180 });
  });
});
