/** FE3A digital reconciliation state and metadata coverage. */
import { beforeEach, describe, expect, it } from "vitest";
import { cashContextForLocation, loadCashContext, loadReconciliationPayments, registerPayment, toUiPayment, verifyPaymentRecord, newIdempotencyKey } from "../src/api";
import { mockCharges } from "../src/mockData";

const seed = structuredClone(mockCharges);
beforeEach(() => mockCharges.splice(0, mockCharges.length, ...structuredClone(seed)));

describe("digital payment reconciliation", () => {
  it("applies the same selected-site filter to mock history and the shared snapshot", async () => {
    const all = await loadCashContext();
    const lince = await loadCashContext({ location_id: 1 });
    expect(lince.charges.map(charge => charge.id)).toEqual(["1", "4"]);
    expect(lince.reconciliation.map(payment => payment.id)).toEqual(["p1"]);
    expect(cashContextForLocation(all, "1")).toEqual(lince);
    expect(cashContextForLocation(all, "")).toBe(all);
    expect(all.reconciliation.map(payment => payment.id)).toEqual(["p1", "p2"]);
  });
  it("reveals only digital unverified payments and labels grandfathered references", async () => {
    const payments = await loadReconciliationPayments();
    expect(payments.every((payment) => ["yape", "plin", "transferencia"].includes(payment.method))).toBe(true);
    expect(payments.every((payment) => payment.verificationStatus === "unverified")).toBe(true);
    expect(payments.find((payment) => payment.id === "p1")?.reference).toBeNull();
    expect(payments.find((payment) => payment.id === "p2")?.reference).toBe("YAPE-20260814-002");
  });

  it("maps no verifier identity and verifies only a reproducible reference in the UI path", async () => {
    const historical = (await loadReconciliationPayments()).find((payment) => payment.id === "p1")!;
    expect("verifiedBy" in historical).toBe(false);
    const reproducible = (await loadReconciliationPayments()).find((payment) => payment.id === "p2")!;
    const verified = await verifyPaymentRecord(reproducible.id, {}, newIdempotencyKey());
    expect(verified.verificationStatus).toBe("verified");
    expect("verifiedBy" in verified).toBe(false);
  });

  it("omits empty optional metadata at the adapter boundary by constructing no empty values", async () => {
    const payment = await registerPayment("4", { amount: 10, method: "yape", reference: "YAPE-OPTIONAL" }, newIdempotencyKey());
    expect(payment.receiver).toBeNull();
    expect(payment.reconciliationNote).toBeNull();
    const mapped = toUiPayment({ id: Number(payment.id.replace(/\D/g, "")) || 99, charge_id: 4, amount: "10.00", method: "yape", paid_at: payment.paidAt, reference: "YAPE-OPTIONAL", receiver: null, reconciliation_note: null, verification_status: "unverified", verified_at: null });
    expect(mapped.receiver).toBeNull();
    expect(mapped.reconciliationNote).toBeNull();
  });
});
