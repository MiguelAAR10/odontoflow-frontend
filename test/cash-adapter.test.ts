/**
 * Cash adapter unit tests — view-model mapping + mock-mode payment flows.
 * No network: the mock seam (VITE_USE_MOCKS default true under vitest)
 * exercises the same adapter functions the page calls.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  loadCharges,
  registerPayment,
  sumOutstanding,
  sumPaid,
  toMoneyNumber,
  toUiCharge,
  toUiPayment,
} from "../src/api";
import { ApiError } from "../src/contracts/client";
import { mockCharges } from "../src/mockData";

const seed = structuredClone(mockCharges);

beforeEach(() => {
  mockCharges.length = 0;
  mockCharges.push(...structuredClone(seed));
});

describe("toMoneyNumber", () => {
  it("parses the backend decimal string into a 2-decimal number", () => {
    expect(toMoneyNumber("180.00")).toBe(180);
    expect(toMoneyNumber("180.456")).toBe(180.46);
    expect(toMoneyNumber("0.00")).toBe(0);
  });
});

describe("toUiCharge / toUiPayment", () => {
  it("maps ChargeRead (decimal strings) into the UI view model", () => {
    const view = toUiCharge({
      id: 7,
      service_execution_id: 42,
      amount: "250.00",
      paid: "100.00",
      outstanding: "150.00",
      created_at: "2026-08-14T14:15:00Z",
    });
    expect(view.id).toBe("7");
    expect(view.serviceExecutionId).toBe(42);
    expect(view.amount).toBe(250);
    expect(view.paid).toBe(100);
    expect(view.outstanding).toBe(150);
    expect(view.createdAt).toBe("2026-08-14T14:15:00Z");
    expect(view.payments).toEqual([]);
  });

  it("maps the payments of a charge", () => {
    const view = toUiCharge(
      { id: 7, service_execution_id: 42, amount: "250.00", paid: "250.00", outstanding: "0.00", created_at: "2026-08-14T14:15:00Z" },
      [{ id: 1, charge_id: 7, amount: "150.00", method: "Yape", paid_at: "2026-08-14T14:15:00Z" }],
    );
    expect(view.payments).toHaveLength(1);
    expect(view.payments[0]).toEqual({ id: "1", amount: 150, method: "Yape", paidAt: "2026-08-14T14:15:00Z" });
  });

  it("derives the status from the real paid/outstanding values", () => {
    const base = { id: 1, service_execution_id: 1, amount: "100.00", created_at: "2026-08-14T14:15:00Z" };
    expect(toUiCharge({ ...base, paid: "100.00", outstanding: "0.00" }).status).toBe("Pagado");
    expect(toUiCharge({ ...base, paid: "40.00", outstanding: "60.00" }).status).toBe("Parcial");
    expect(toUiCharge({ ...base, paid: "0.00", outstanding: "100.00" }).status).toBe("Pendiente");
  });

  it("never fabricates location/party/owner in real mode", () => {
    const view = toUiCharge({ id: 7, service_execution_id: 42, amount: "100.00", paid: "0.00", outstanding: "100.00", created_at: "2026-08-14T14:15:00Z" });
    expect(view.branch).toBe("");
    expect(view.party).toBe("");
    expect(view.concept).toBe("");
    expect(view.owner).toBe("");
  });

  it("maps PaymentRead into the UI payment view model", () => {
    const payment = toUiPayment({ id: 9, charge_id: 7, amount: "50.00", method: "Plin", paid_at: "2026-08-14T15:00:00Z" });
    expect(payment).toEqual({ id: "9", amount: 50, method: "Plin", paidAt: "2026-08-14T15:00:00Z" });
  });
});

describe("sumOutstanding / sumPaid", () => {
  it("derives 'Por cobrar' as Σ outstanding over the real values", async () => {
    const rows = await loadCharges();
    // Seed: outstanding 300 (cargo 2) + 100 (cargo 4); paid 180+200+120+0+450.
    expect(sumOutstanding(rows)).toBe(400);
    expect(sumPaid(rows)).toBe(950);
  });

  it("tolerates an empty list", () => {
    expect(sumOutstanding([])).toBe(0);
    expect(sumPaid([])).toBe(0);
  });
});

describe("mock-mode charge list", () => {
  it("loads the charge list as copies (mutations never leak into the source)", async () => {
    const rows = await loadCharges();
    expect(rows).toHaveLength(seed.length);
    rows[0]!.payments.push({ id: "x", amount: 1, method: "X", paidAt: "2026-08-14T15:00:00Z" });
    expect(mockCharges[0]!.payments).toHaveLength(seed[0]!.payments.length);
  });
});

describe("registerPayment (mock mode)", () => {
  it("registers a partial payment and re-derives the balances", async () => {
    const payment = await registerPayment("2", { amount: 100, method: "Yape" }, "key-1");
    expect(payment.amount).toBe(100);
    expect(payment.method).toBe("Yape");

    const charge = mockCharges.find((item) => item.id === "2")!;
    expect(charge.paid).toBe(300);
    expect(charge.outstanding).toBe(200);
    expect(charge.status).toBe("Parcial");
  });

  it("registers a full payment and marks the charge Pagado", async () => {
    await registerPayment("4", { amount: 100, method: "Efectivo" }, "key-2");
    const charge = mockCharges.find((item) => item.id === "4")!;
    expect(charge.paid).toBe(100);
    expect(charge.outstanding).toBe(0);
    expect(charge.status).toBe("Pagado");
  });

  it("rejects overpayment with the backend envelope (no client-side fake math)", async () => {
    const error = await registerPayment("2", { amount: 500, method: "Tarjeta" }, "key-3")
      .then(() => null)
      .catch((caught) => caught as ApiError);
    expect(error).toBeInstanceOf(ApiError);
    expect(error!.code).toBe("PAYMENT_EXCEEDS_OUTSTANDING");
    expect(error!.httpStatus).toBe(422);
    expect(error!.message).toContain("supera el saldo pendiente");
    // The charge is untouched.
    const charge = mockCharges.find((item) => item.id === "2")!;
    expect(charge.outstanding).toBe(300);
  });

  it("rejects non-positive amounts with INVALID_INPUT", async () => {
    for (const amount of [0, -5, Number.NaN]) {
      const error = await registerPayment("2", { amount, method: "Efectivo" }, "key-4")
        .then(() => null)
        .catch((caught) => caught as ApiError);
      expect(error!.code).toBe("INVALID_INPUT");
    }
  });

  it("rejects unknown charges with CHARGE_NOT_FOUND", async () => {
    const error = await registerPayment("999", { amount: 10, method: "Efectivo" }, "key-5")
      .then(() => null)
      .catch((caught) => caught as ApiError);
    expect(error!.code).toBe("CHARGE_NOT_FOUND");
  });
});

describe("refresh after payment", () => {
  it("a subsequent loadCharges() reflects the recorded payment", async () => {
    await registerPayment("4", { amount: 100, method: "Efectivo" }, "key-6");
    const rows = await loadCharges();
    const charge = rows.find((item) => item.id === "4")!;
    expect(charge.paid).toBe(100);
    expect(charge.outstanding).toBe(0);
    expect(charge.status).toBe("Pagado");
  });
});
