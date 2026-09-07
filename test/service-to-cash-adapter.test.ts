/** FE3A clinical-to-economic chain tests at the mock seam. */
import { beforeEach, describe, expect, it } from "vitest";
import {
  createChargeRecord,
  createPatientRecord,
  createServiceExecutionRecord,
  createVisitRecord,
  loadCharges,
  loadVisits,
  newIdempotencyKey,
} from "../src/api";
import { appointments, mockCharges, mockVisits, patients } from "../src/mockData";

beforeEach(() => {
  // These tests only read the stable seeded chain; mutations use unique keys
  // and are cleaned by restoring the canonical rows below.
  mockCharges.splice(0, mockCharges.length, {
    id: "1", serviceExecutionId: 101, amount: 180, paid: 180, outstanding: 0, createdAt: "2026-08-14T14:15:00Z", payments: [{ id: "p1", chargeId: 1, amount: 180, method: "yape", reference: null, receiver: null, reconciliationNote: null, verificationStatus: "unverified", verifiedAt: null, paidAt: "2026-08-14T14:15:00Z" }], status: "Pagado", visitId: 1, patientId: 1, patientName: "Ana Torres", serviceId: 1, serviceName: "Limpieza dental", locationId: 1, locationName: "Lince", practitionerId: 1, practitionerName: "Dra. Valeria Ruiz", executedAt: "2026-08-14T14:00:00Z", locationTimeZone: "America/Lima",
  }, {
    id: "2", serviceExecutionId: 102, amount: 500, paid: 200, outstanding: 300, createdAt: "2026-08-14T14:48:00Z", payments: [{ id: "p2", chargeId: 2, amount: 200, method: "yape", reference: "YAPE-20260814-002", receiver: "Billetera clínica", reconciliationNote: null, verificationStatus: "unverified", verifiedAt: null, paidAt: "2026-08-14T14:48:00Z" }], status: "Parcial", visitId: 2, patientId: 2, patientName: "Carlos Rojas", serviceId: 2, serviceName: "Evaluación dental", locationId: 2, locationName: "Jesús María", practitionerId: 2, practitionerName: "Dr. Mateo León", executedAt: "2026-08-14T14:30:00Z", locationTimeZone: "America/Lima",
  });
  // Preserve the original mock visit and patients; this file deliberately
  // exercises the canonical endpoints only, never Lead→Patient auto-creation.
  expect(appointments.some((appointment) => appointment.id === "apt-1")).toBe(true);
  expect(patients.some((patient) => patient.id === "ana")).toBe(true);
  expect(mockVisits.some((visit) => visit.id === "1")).toBe(true);
});

describe("attendance → execution → charge adapters", () => {
  it("replays each mutation under its own idempotency key", async () => {
    const visit = await createVisitRecord({ patient_id: "carlos" }, newIdempotencyKey());
    const executionKey = newIdempotencyKey();
    const firstExecution = await createServiceExecutionRecord(visit.id, { service_id: 2, executed_price: 80 }, executionKey);
    const replayExecution = await createServiceExecutionRecord(visit.id, { service_id: 2, executed_price: 80 }, executionKey);
    expect(replayExecution.id).toBe(firstExecution.id);
    const chargeKey = newIdempotencyKey();
    const firstCharge = await createChargeRecord(firstExecution.id, {}, chargeKey);
    const replayCharge = await createChargeRecord(firstExecution.id, {}, chargeKey);
    expect(replayCharge.id).toBe(firstCharge.id);
  });

  it("replays mock canonical patient creation under the same idempotency key", async () => {
    const before = patients.length;
    const input = { full_name: "Temporal Idempotency Patient", dni: "70987654", phone: "+51 900 000 009" };
    const key = newIdempotencyKey();
    let createdId: string | undefined;
    try {
      const first = await createPatientRecord(input, key);
      createdId = first.id;
      const replay = await createPatientRecord(input, key);
      expect(replay).toEqual(first);
      expect(patients).toHaveLength(before + 1);
      await expect(createPatientRecord({ full_name: "Different Patient" }, key)).rejects.toMatchObject({
        code: "IDEMPOTENCY_KEY_REUSED",
        httpStatus: 409,
      });
    } finally {
      const index = patients.findIndex((patient) => patient.id === createdId);
      if (index >= 0) patients.splice(index, 1);
    }
  });

  it("filters mock charges by execution when loading patient history", async () => {
    const rows = await loadCharges({ execution_id: 102 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "2", serviceExecutionId: 102 });
    expect(await loadCharges({ execution_id: 999 })).toEqual([]);
  });

  it("does not alter the canonical mock patient collection while creating a walk-in visit", async () => {
    const before = patients.length;
    const visits = await loadVisits();
    await createVisitRecord({ patient_id: "carlos" }, newIdempotencyKey());
    expect(patients).toHaveLength(before);
    expect(visits.some((visit) => visit.patientName === "Ana Torres")).toBe(true);
  });
});
