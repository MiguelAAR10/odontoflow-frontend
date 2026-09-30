/** FE3A read-surface integration proof against the published backend. */
import { beforeAll, describe, expect, it } from "vitest";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8010";
let api: typeof import("../src/api");
let client: typeof import("../src/contracts/client");

beforeAll(async () => {
  process.env.NEXT_PUBLIC_USE_MOCKS = "false";
  process.env.NEXT_PUBLIC_BACKEND_URL = BACKEND_URL;
  api = await import("../src/api");
  client = await import("../src/contracts/client");
  if (api.useMocks) throw new Error("Service-to-cash integration must run with NEXT_PUBLIC_USE_MOCKS=false");
});

describe("Service-to-cash ↔ FastAPI ↔ PostgreSQL (no mocks)", () => {
  it("reads the canonical visits, uncharged executions, payments and active follow-ups", async () => {
    const [visits, executions, payments, followUps] = await Promise.all([
      client.listVisits(),
      client.listExecutions({ charged: false }),
      client.listAllPayments({ verification_status: "unverified" }),
      client.listFollowUps({ active: true }),
    ]);
    expect(Array.isArray(visits)).toBe(true);
    expect(Array.isArray(executions)).toBe(true);
    expect(Array.isArray(payments)).toBe(true);
    expect(Array.isArray(followUps)).toBe(true);
    expect(followUps.every((row) => row.state === "open" && Number(row.charge_outstanding) > 0)).toBe(true);
  });

  it("maps real charge context through the same adapter used by Cobros", async () => {
    const charges = await api.loadCharges();
    expect(Array.isArray(charges)).toBe(true);
    for (const charge of charges) {
      expect(charge.patientName.length).toBeGreaterThan(0);
      expect(charge.serviceName.length).toBeGreaterThan(0);
      expect(charge.locationName.length).toBeGreaterThan(0);
      expect(charge.practitionerName.length).toBeGreaterThan(0);
    }
  });
});
