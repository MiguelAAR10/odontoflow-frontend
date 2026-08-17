/**
 * M4 Pilot E2E — one deterministic real journey.
 *
 * real React adapters (src/api) + real FastAPI + real PostgreSQL.
 * Runs ONLY with VITE_USE_MOCKS=false and a live backend at VITE_BACKEND_URL
 * (default http://127.0.0.1:8010) whose database is migrated to HEAD (0008)
 * with a seeded bootstrap organization (migration 0002).
 *
 * The spec seeds its own fixtures idempotently (skip-if-exists), then walks
 * the full clinical + economic + inventory journey. Every business assertion
 * goes through the SAME adapter functions the Cash/Inventory/Agenda/Patients
 * pages bind to — so a passing run proves the pages reflect real server state
 * with zero mock business data (by construction of the module under test).
 *
 * Backend-only orchestration steps (visit/execution/consumption/charge-create)
 * are called via fetch because the current UI has no screens for them yet;
 * everything the UI actually renders goes through src/api + src/contracts/client.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { MovementRead } from "../src/contracts/client";

const BACKEND_URL = process.env.VITE_BACKEND_URL ?? "http://127.0.0.1:8010";

let api: typeof import("../src/api");
let client: typeof import("../src/contracts/client");

// --- fixtures ---------------------------------------------------------------
let locationLince: { id: number; name: string };
let locationJm: { id: number; name: string };
let service: { id: number; name: string };
let practitioner: { id: number; display_name: string };
let lead: { id: number };
let product: { id: number; name: string };

// --- journey ids ------------------------------------------------------------
let patientId: number;
let appointmentId: number;
let visitId: number;
let executionId: number;
let chargeId: number;

// --- helpers -----------------------------------------------------------------

async function fetchJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} → ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

const postJson = (path: string, payload: unknown) =>
  fetchJson(path, { method: "POST", body: JSON.stringify(payload) });

async function getJson<T>(path: string): Promise<T> {
  return (await fetchJson(path)) as T;
}

/** Peru is UTC-5 with no DST: UTC instant for a Lima wall-clock time. */
function limaUtc(y: number, m: number, d: number, hh: number, mm: number): string {
  return new Date(Date.UTC(y, m - 1, d, hh + 5, mm, 0)).toISOString();
}

/** Next calendar day after today (any weekday). */
function nextDay(): { y: number; m: number; d: number } {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { y: next.getFullYear(), m: next.getMonth() + 1, d: next.getDate() };
}

beforeAll(async () => {
  process.env.VITE_USE_MOCKS = "false";
  process.env.VITE_BACKEND_URL = BACKEND_URL;
  api = await import("../src/api");
  client = await import("../src/contracts/client");
  if (api.useMocks) throw new Error("Pilot E2E must run with VITE_USE_MOCKS=false");

  // ---- seed: locations, service, practitioner, capability, availability ----
  const locations = await client.listLocations();
  const byName = (list: { id: number; name: string }[], name: string) =>
    list.find((item) => item.name === name);

  const existingLince = byName(locations, "Sede Lince");
  const existingJm = byName(locations, "Sede Jesús María");
  locationLince = existingLince ?? ((await postJson("/locations", { name: "Sede Lince", timezone: "America/Lima" })) as typeof locationLince);
  locationJm = existingJm ?? ((await postJson("/locations", { name: "Sede Jesús María", timezone: "America/Lima" })) as typeof locationJm);

  const services = await client.listServices();
  const existingService = services.find((item) => item.name === "Limpieza dental E2E");
  service = existingService ?? ((await postJson("/services", { name: "Limpieza dental E2E", duration_minutes: 30, is_active: true })) as typeof service);

  // /practitioners, /capabilities and /availability-rules are create-only
  // (no list endpoints) — create them unconditionally; the E2E DB is reset
  // before each pilot run so duplicates never accumulate.
  practitioner = (await postJson("/practitioners", { display_name: "Dra. E2E Valeria", is_active: true })) as typeof practitioner;
  for (const location of [locationLince, locationJm]) {
    await postJson("/capabilities", {
      practitioner_id: practitioner.id,
      service_id: service.id,
      location_id: location.id,
      is_active: true,
    });

    // Availability Mon–Sun 09:00–17:00 (Lima) so booking tomorrow works.
    for (let day = 0; day <= 6; day += 1) {
      await postJson("/availability-rules", {
        practitioner_id: practitioner.id,
        location_id: location.id,
        day_of_week: day,
        start_local: "09:00:00",
        end_local: "17:00:00",
      });
    }
  }

  const leads = await client.listLeads();
  lead = leads.find((item) => item.full_name === "Lead E2E Piloto") ?? ((await postJson("/leads", { full_name: "Lead E2E Piloto", contact_phone: "+51 900 000 002", acquisition_source: "direct" })) as { id: number });

  // ---- seed: product + initial stock at Lince ----
  const products = await client.listProducts({ search: "Resina E2E" });
  product = products[0] ?? ((await client.createProduct({ name: "Resina E2E", unit: "unidades", kind: "consumible" }, client.newIdempotencyKey())) as unknown as { id: number; name: string });
  const initialBalance = await client.getBalance(product.id, locationLince.id);
  if (Number(initialBalance.available) === 0) {
    await client.registerEntry(product.id, { location_id: locationLince.id, quantity: 10, unit_price: 5 }, client.newIdempotencyKey());
  }
});

describe("Pilot E2E — Patient → Appointment → Visit → Execution → Consumption → Charge → Payment → Inventory (no mocks)", () => {
  it("1+2. creates a Patient and books a confirmed Appointment at Sede Lince", async () => {
    const patient = await api.createPatient({ name: "Paciente E2E Piloto", dni: "40123456", phone: "+51 900 000 001", branch: "", nextAppointment: "Sin cita", treatment: "Por definir", status: "Activo", origin: "Registro clínico", interest: "Por validar" }, client.newIdempotencyKey());
    expect(patient.name).toBe("Paciente E2E Piloto");
    patientId = Number(patient.id);

    const next = nextDay();
    const start = limaUtc(next.y, next.m, next.d, 9, 30);
    const appointment = await client.bookAppointment(
      { lead_id: lead.id, service_id: service.id, location_id: locationLince.id, practitioner_id: practitioner.id, start },
      client.newIdempotencyKey(),
    );
    expect(appointment.state).toBe("confirmed");
    expect(appointment.location_id).toBe(locationLince.id);
    appointmentId = appointment.id;
  });

  it("3. creates a Visit from the confirmed appointment (location derived from the appointment)", async () => {
    const visit = (await postJson("/visits", {
      patient_id: patientId,
      appointment_id: appointmentId,
    })) as { id: number; location_id: number; location_name: string };
    expect(visit.location_id).toBe(locationLince.id);
    visitId = visit.id;
  });

  it("4. records the ServiceExecution", async () => {
    const execution = (await postJson(`/visits/${visitId}/executions`, {
      service_id: service.id,
      executed_price: 150,
    })) as { id: number; service_name: string };
    expect(execution.service_name).toBe("Limpieza dental E2E");
    executionId = execution.id;
  });

  it("5+6. consumes stock at the Visit Location and emits a SALIDA there", async () => {
    const beforeLince = Number((await client.getBalance(product.id, locationLince.id)).available);
    const beforeJm = Number((await client.getBalance(product.id, locationJm.id)).available);

    const consumption = (await postJson(`/executions/${executionId}/consumptions`, {
      product_id: product.id,
      quantity: 2,
      unit_price: 5,
    })) as { id: number; product_name: string; quantity: string };

    expect(consumption.product_name).toBe("Resina E2E");
    expect(Number(consumption.quantity)).toBe(2);

    const afterLince = Number((await client.getBalance(product.id, locationLince.id)).available);
    const afterJm = Number((await client.getBalance(product.id, locationJm.id)).available);

    // step 7+8: SALIDA at the execution's location only; other location untouched.
    expect(afterLince).toBe(beforeLince - 2);
    expect(afterJm).toBe(beforeJm);

    const movements = await client.listMovements(product.id, locationLince.id);
    const salida = movements.find((movement) => movement.type === "SALIDA");
    expect(salida).toBeDefined();
    expect(Number(salida!.quantity)).toBe(2);
  });

  it("9. creates the Charge for the executed service", async () => {
    const charge = (await postJson(`/executions/${executionId}/charges`, { amount: 150 })) as { id: number; amount: string; paid: string; outstanding: string };
    expect(Number(charge.amount)).toBe(150);
    expect(Number(charge.paid)).toBe(0);
    expect(Number(charge.outstanding)).toBe(150);
    chargeId = charge.id;
  });

  it("10a. registers a PARTIAL payment (50) — paid/outstanding update, overpayment still rejected", async () => {
    const partial = await api.registerPayment(String(chargeId), { amount: 50, method: "Yape" }, client.newIdempotencyKey());
    expect(partial.amount).toBe(50);

    const charge = await client.getCharge(chargeId);
    expect(Number(charge.paid)).toBe(50);
    expect(Number(charge.outstanding)).toBe(100);

    // The backend's real envelope, surfaced the same way the Cash page does
    // (toApiError): overpayment is INVALID_INPUT with the stable message.
    const rejection = await api
      .registerPayment(String(chargeId), { amount: 500, method: "Yape" }, client.newIdempotencyKey())
      .catch((error) => error);
    const envelope = api.toApiError(rejection);
    expect(envelope.httpStatus).toBe(422);
    expect(envelope.code).toBe("INVALID_INPUT");
    expect(envelope.message).toContain("exceeds");
  });

  it("10b. registers the FULL payment (100) — outstanding reaches zero", async () => {
    await api.registerPayment(String(chargeId), { amount: 100, method: "Tarjeta" }, client.newIdempotencyKey());
    const charge = await client.getCharge(chargeId);
    expect(Number(charge.paid)).toBe(150);
    expect(Number(charge.outstanding)).toBe(0);
  });

  it("11. CashPage reflects the real paid/outstanding state (loadCharges — the exact page adapter)", async () => {
    const charges = await api.loadCharges();
    const view = charges.find((item) => item.id === String(chargeId));
    expect(view).toBeDefined();
    expect(view!.paid).toBe(150);
    expect(view!.outstanding).toBe(0);
    expect(view!.status).toBe("Pagado");
    expect(api.sumOutstanding([view!])).toBe(0);
  });

  it("12. InventoryPage reflects the new Location balance (loadProductBalance — the exact page adapter)", async () => {
    const lince = await api.loadProductBalance(String(product.id), String(locationLince.id));
    expect(lince.available).toBe(8); // 10 − 2 consumed
  });

  it("13+14. transfers 3 units Lince → Jesús María, conserving the total", async () => {
    const beforeLince = Number((await client.getBalance(product.id, locationLince.id)).available);
    const beforeJm = Number((await client.getBalance(product.id, locationJm.id)).available);
    const totalBefore = beforeLince + beforeJm;

    const transfer = await api.registerTransfer(
      String(product.id),
      { origin_location_id: locationLince.id, destination_location_id: locationJm.id, quantity: 3, reason: "E2E pilot transfer" },
      client.newIdempotencyKey(),
    );
    expect(transfer.transferId).toBeTruthy();
    expect(transfer.outMovementId).toBeGreaterThan(0);
    expect(transfer.inMovementId).toBeGreaterThan(0);

    // The kardex rows (real ledger) carry the shared transfer identity.
    const linceMoves = await client.listMovements(product.id, locationLince.id);
    const jmMoves = await client.listMovements(product.id, locationJm.id);
    const out = linceMoves.find((movement: MovementRead) => movement.type === "TRANSFER_OUT");
    const incoming = jmMoves.find((movement: MovementRead) => movement.type === "TRANSFER_IN");
    expect(out).toBeDefined();
    expect(incoming).toBeDefined();
    expect(out!.transfer_id).toBe(incoming!.transfer_id);
    expect(out!.transfer_id).toBe(transfer.transferId);

    const afterLince = Number((await client.getBalance(product.id, locationLince.id)).available);
    const afterJm = Number((await client.getBalance(product.id, locationJm.id)).available);
    expect(afterLince).toBe(beforeLince - 3);
    expect(afterJm).toBe(beforeJm + 3);
    expect(afterLince + afterJm).toBe(totalBefore); // conservation
  });

  it("audits + kardex: Lince shows ENTRADA/SALIDA/TRANSFER_OUT; Jesús María shows TRANSFER_IN", async () => {
    const lince = await client.listMovements(product.id, locationLince.id);
    const jm = await client.listMovements(product.id, locationJm.id);
    expect(lince.map((movement: MovementRead) => movement.type)).toEqual(
      expect.arrayContaining(["ENTRADA", "SALIDA", "TRANSFER_OUT"]),
    );
    expect(jm.map((movement: MovementRead) => movement.type)).toContain("TRANSFER_IN");
  });

  it("location-isolated adjustment at Jesús María leaves Lince untouched", async () => {
    const before = Number((await client.getBalance(product.id, locationLince.id)).available);
    await api.registerAdjustment(String(product.id), { location_id: locationJm.id, quantity: -1, reason: "E2E merma" }, client.newIdempotencyKey());
    const jm = Number((await client.getBalance(product.id, locationJm.id)).available);
    const after = Number((await client.getBalance(product.id, locationLince.id)).available);
    expect(jm).toBe(2); // 3 transferred − 1 adjusted
    expect(after).toBe(before);
  });
});