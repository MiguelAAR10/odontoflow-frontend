/** FE3A collection rules: active debt cases and clinic-local due dates. */
import { beforeEach, describe, expect, it } from "vitest";
import { clinicToday, isActiveFollowUp, loadFollowUps, openFollowUpRecord, registerPayment, newIdempotencyKey } from "../src/api";
import { mockCharges, mockFollowUps } from "../src/mockData";

const chargeSeed = structuredClone(mockCharges);
const followUpSeed = structuredClone(mockFollowUps);

beforeEach(() => {
  mockCharges.splice(0, mockCharges.length, ...structuredClone(chargeSeed));
  mockFollowUps.splice(0, mockFollowUps.length, ...structuredClone(followUpSeed));
});

describe("collections worklist adapter", () => {
  it("uses the active-case rule and excludes a fully paid charge", async () => {
    const active = await loadFollowUps({ active: true });
    expect(active.every(isActiveFollowUp)).toBe(true);
    expect(active.map((row) => row.chargeId)).not.toContain(1);
  });

  it("filters due cases using the operator's clinic-local calendar date", async () => {
    expect(clinicToday("America/Lima", new Date("2026-09-07T04:30:00.000Z"))).toBe("2026-09-06");
    const due = await loadFollowUps({ active: true, due_on_or_before: "2026-09-08" });
    expect(due.map((row) => row.id)).toContain("2");
  });

  it("closes a follow-up when a payment settles the charge, without client write-off", async () => {
    const beforeAmount = mockCharges.find((charge) => charge.id === "2")!.amount;
    await registerPayment("2", { amount: 300, method: "efectivo" }, newIdempotencyKey());
    const active = await loadFollowUps({ active: true });
    expect(active.map((row) => row.chargeId)).not.toContain(2);
    expect(mockCharges.find((charge) => charge.id === "2")!.amount).toBe(beforeAmount);
  });

  it("does not permit a follow-up on a fully paid charge", async () => {
    await expect(openFollowUpRecord("1", { next_follow_up_on: clinicToday() }, newIdempotencyKey())).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});
