/** FE3A cash adapter tests: canonical context, typed methods and settlement. */
import { beforeEach, describe, expect, it } from "vitest";
import {
  clinicToday,
  closeFollowUpRecord,
  createChargeRecord,
  createServiceExecutionRecord,
  createVisitRecord,
  isActiveFollowUp,
  loadCharges,
  loadFollowUps,
  loadReconciliationPayments,
  newIdempotencyKey,
  openFollowUpRecord,
  registerPayment,
  rescheduleFollowUpRecord,
  sumOutstanding,
  sumPaid,
  toMoneyNumber,
  toUiCharge,
  toUiPayment,
  verifyPaymentRecord,
} from "../src/api";
import { ApiError } from "../src/contracts/client";
import { mockCharges, mockFollowUps } from "../src/mockData";
import { PAYMENT_METHOD_LABEL } from "../src/ui";

const seedCharges = structuredClone(mockCharges);
const seedFollowUps = structuredClone(mockFollowUps);

const chargeRead = {
  id: 7,
  service_execution_id: 42,
  amount: "250.00",
  paid: "100.00",
  outstanding: "150.00",
  created_at: "2026-08-14T14:15:00Z",
  visit_id: 5,
  patient_id: 9,
  patient_name: "Paciente Canónico",
  service_id: 3,
  service_name: "Evaluación dental",
  location_id: 2,
  location_name: "Jesús María",
  practitioner_id: 1,
  practitioner_name: "Dra. Valeria Ruiz",
  executed_at: "2026-08-14T14:00:00Z",
};

const paymentRead = {
  id: 1,
  charge_id: 7,
  amount: "100.00",
  method: "yape" as const,
  paid_at: "2026-08-14T14:15:00Z",
  reference: "YAPE-001",
  receiver: "Caja",
  reconciliation_note: null,
  verification_status: "unverified" as const,
  verified_at: null,
  reversed: false,
  reversed_at: null,
};

beforeEach(() => {
  mockCharges.length = 0;
  mockCharges.push(...structuredClone(seedCharges));
  mockFollowUps.length = 0;
  mockFollowUps.push(...structuredClone(seedFollowUps));
});

describe("canonical cash mappers", () => {
  it("parses decimal money and maps charge context without legacy fields", () => {
    expect(toMoneyNumber("180.456")).toBe(180.46);
    const view = toUiCharge(chargeRead);
    expect(view).toMatchObject({ id: "7", serviceExecutionId: 42, amount: 250, paid: 100, outstanding: 150, patientName: "Paciente Canónico", serviceName: "Evaluación dental", locationName: "Jesús María", practitionerName: "Dra. Valeria Ruiz" });
    expect("party" in view).toBe(false);
    expect("owner" in view).toBe(false);
  });

  it("maps typed payment metadata and exposes labels only at presentation", () => {
    const view = toUiPayment(paymentRead);
    expect(view).toMatchObject({ id: "1", amount: 100, method: "yape", reference: "YAPE-001", receiver: "Caja", verificationStatus: "unverified" });
    expect(PAYMENT_METHOD_LABEL[view.method]).toBe("Yape");
    expect("verifiedBy" in view).toBe(false);
  });
});

describe("cash totals and reconciliation", () => {
  it("derives totals from canonical rows and retains historical digital payments", async () => {
    const rows = await loadCharges();
    expect(sumOutstanding(rows)).toBe(400);
    expect(sumPaid(rows)).toBe(950);
    const pending = await loadReconciliationPayments();
    expect(pending.map((payment) => payment.id)).toEqual(expect.arrayContaining(["p1", "p2"]));
    expect(pending.find((payment) => payment.id === "p1")?.reference).toBeNull();
  });

  it("keeps active cases backend-shaped and uses clinic-local dates", async () => {
    const rows = await loadFollowUps({ active: true });
    expect(rows.every(isActiveFollowUp)).toBe(true);
    expect(rows.some((row) => row.chargeOutstanding === 0)).toBe(false);
    expect(clinicToday("America/Lima", new Date("2026-09-07T04:30:00.000Z"))).toBe("2026-09-06");
  });
});

describe("FE3A mock rejection and settlement rules", () => {
  it("rejects amount, charge and overpayment errors through ApiError", async () => {
    for (const amount of [0, -5, Number.NaN]) {
      await expect(registerPayment("2", { amount, method: "efectivo" }, newIdempotencyKey())).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    await expect(registerPayment("999", { amount: 10, method: "efectivo" }, newIdempotencyKey())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(registerPayment("2", { amount: 500, method: "tarjeta" }, newIdempotencyKey())).rejects.toMatchObject({ code: "INVALID_INPUT", httpStatus: 422 });
  });

  it("rejects digital payments without a reference and duplicate operation codes", async () => {
    await expect(registerPayment("2", { amount: 10, method: "yape" }, newIdempotencyKey())).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(registerPayment("2", { amount: 10, method: "yape", reference: "YAPE-20260814-002" }, newIdempotencyKey())).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("rejects duplicate execution and duplicate visit, then creates a canonical chain", async () => {
    await expect(createServiceExecutionRecord("1", { service_id: 1, executed_price: 180 }, newIdempotencyKey())).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(createVisitRecord({ patient_id: "ana", appointment_id: "apt-1" }, newIdempotencyKey())).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(createVisitRecord({ patient_id: "carlos", appointment_id: "apt-2" }, newIdempotencyKey())).rejects.toMatchObject({ code: "ENTITY_INACTIVE" });
    const visit = await createVisitRecord({ patient_id: "carlos" }, newIdempotencyKey());
    const execution = await createServiceExecutionRecord(visit.id, { service_id: 2, executed_price: 75 }, newIdempotencyKey());
    const charge = await createChargeRecord(execution.id, {}, newIdempotencyKey());
    await expect(createChargeRecord(execution.id, {}, newIdempotencyKey())).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(charge.amount).toBe(75);
  });

  it("rejects closed follow-up transitions and fully paid follow-up openings", async () => {
    await expect(openFollowUpRecord("1", { next_follow_up_on: clinicToday() }, newIdempotencyKey())).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(openFollowUpRecord("2", { next_follow_up_on: "2020-01-01" }, newIdempotencyKey())).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(openFollowUpRecord("2", { next_follow_up_on: clinicToday() }, newIdempotencyKey())).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(rescheduleFollowUpRecord("1", { next_follow_up_on: clinicToday() }, newIdempotencyKey())).rejects.toMatchObject({ code: "ENTITY_INACTIVE" });
    await expect(closeFollowUpRecord("1", {}, newIdempotencyKey())).rejects.toMatchObject({ code: "ENTITY_INACTIVE" });
  });

  it("rejects verification replay on a verified payment and settles an open case", async () => {
    await expect(verifyPaymentRecord("p3", {}, newIdempotencyKey())).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const opened = await openFollowUpRecord("4", { next_follow_up_on: clinicToday(), note: "Llamar" }, newIdempotencyKey());
    expect(opened.isActiveCase).toBe(true);
    await registerPayment("4", { amount: 100, method: "efectivo" }, newIdempotencyKey());
    const active = await loadFollowUps({ active: true });
    expect(active.some((row) => row.chargeId === 4)).toBe(false);
    const closed = mockFollowUps.find((row) => row.id === opened.id);
    expect(closed?.closeReason).toBe("settled");
  });
});
