/**
 * Agenda E2E proof: the real frontend adapter against a live FastAPI +
 * PostgreSQL backend. Runs ONLY with NEXT_PUBLIC_USE_MOCKS=false and a real
 * NEXT_PUBLIC_BACKEND_URL — every assertion below proves the data came from the
 * backend (no mockData), by construction of the module under test.
 *
 * Requires: backend up at NEXT_PUBLIC_BACKEND_URL with seeded fixture data
 * (service, location, practitioner, capability, availability, lead).
 */
import { beforeAll, describe, expect, it } from "vitest";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8010";

let api: typeof import("../src/api");
let client: typeof import("../src/contracts/client");
let ids: { leadId: number; serviceId: number; locationId: number; practitionerId: number } | null = null;
let createdId: number | null = null;

async function loadSelectors() {
  const leads = await api.getLeads();
  const services = await api.getServices();
  const locations = await api.getLocations();
  if (leads.length === 0 || services.length === 0 || locations.length === 0) {
    throw new Error(`Backend fixtures missing: leads=${leads.length} services=${services.length} locations=${locations.length}`);
  }
  const practitioners = await api.getEligiblePractitioners(services[0].id, locations[0].id);
  if (practitioners.length === 0) {
    throw new Error("No eligible practitioner for the fixture service/location.");
  }
  ids = { leadId: leads[0].id, serviceId: services[0].id, locationId: locations[0].id, practitionerId: practitioners[0].id };
}

beforeAll(async () => {
  // Set the real-mode flags BEFORE the modules load (they read env at import).
  process.env.NEXT_PUBLIC_USE_MOCKS = "false";
  process.env.NEXT_PUBLIC_BACKEND_URL = BACKEND_URL;
  api = await import("../src/api");
  client = await import("../src/contracts/client");
  if (api.useMocks) throw new Error("E2E must run with NEXT_PUBLIC_USE_MOCKS=false");
  await loadSelectors();
});

describe("Agenda ↔ FastAPI ↔ PostgreSQL (no mocks)", () => {
  it("lists real availability slots for the week", async () => {
    expect(ids).not.toBeNull();
    const window = api.currentWeekWindow();
    const slots = await api.getSlots({
      service_id: ids!.serviceId,
      location_id: ids!.locationId,
      window_start: window.from,
      window_end: window.to,
    });
    expect(Array.isArray(slots)).toBe(true);
    // A seeded Monday 09:00-14:00 rule must yield bookable slots.
    expect(slots.some((slot) => slot.start.includes("T14:00"))).toBe(true);
  });

  it("books once inside the visible week and replays with the same Idempotency-Key", async () => {
    expect(ids).not.toBeNull();
    const window = api.currentWeekWindow();
    // Book the FIRST slot the backend currently considers bookable — the
    // query only returns free slots, so this is deterministic across runs.
    const slots = await api.getSlots({
      service_id: ids!.serviceId,
      location_id: ids!.locationId,
      window_start: window.from,
      window_end: window.to,
    });
    expect(slots.length).toBeGreaterThan(0);
    const start = slots[0].start;
    const key = client.newIdempotencyKey();

    const first = await client.bookAppointment(
      { lead_id: ids!.leadId, service_id: ids!.serviceId, location_id: ids!.locationId, practitioner_id: ids!.practitionerId, start },
      key,
    );
    expect(first.state).toBe("confirmed");
    expect(first.id).toBeGreaterThan(0);
    createdId = first.id;

    const replay = await client.bookAppointment(
      { lead_id: ids!.leadId, service_id: ids!.serviceId, location_id: ids!.locationId, practitioner_id: ids!.practitionerId, start },
      key,
    );
    expect(replay.id).toBe(first.id); // exactly-once: same logical outcome

    const listed = await client.listAppointments({ from_date: window.from, to_date: window.to });
    const matches = listed.filter((row) => row.id === first.id);
    expect(matches.length).toBe(1); // no duplicate appointment
    expect(matches[0].lead_name.length).toBeGreaterThan(0);
    expect(matches[0].location_name.length).toBeGreaterThan(0);

    // The agenda view model is derived from the real row.
    const view = api.toUiAppointment(matches[0], new Map([[matches[0].location_id, "America/Lima"]]));
    expect(view.status).toBe("Confirmada");
    expect(view.patient).toBe(matches[0].lead_name);
  });

  it("reloads, reschedules and cancels the booked appointment", async () => {
    expect(ids).not.toBeNull();
    expect(createdId).not.toBeNull();
    const window = api.currentWeekWindow();

    const reloaded = await client.getAppointment(createdId!);
    expect(reloaded.id).toBe(createdId);
    expect(reloaded.state).toBe("confirmed");

    // Reschedule to a different free slot of the same week.
    const slots = await api.getSlots({
      service_id: ids!.serviceId,
      location_id: ids!.locationId,
      window_start: window.from,
      window_end: window.to,
    });
    const newStart = slots.length > 1 ? slots[1].start : new Date(new Date(slots[0].start).getTime() + 15 * 60_000).toISOString();
    expect(new Date(newStart).getTime()).not.toBe(new Date(reloaded.start_utc).getTime());
    const rescheduled = await client.rescheduleAppointment(createdId!, newStart, client.newIdempotencyKey());
    expect(rescheduled.state).toBe("confirmed");
    expect(new Date(rescheduled.start_utc).getTime()).toBe(new Date(newStart).getTime());

    const afterReschedule = await client.getAppointment(createdId!);
    expect(new Date(afterReschedule.start_utc).getTime()).toBe(new Date(newStart).getTime());

    const cancelled = await client.cancelAppointment(createdId!, client.newIdempotencyKey());
    expect(cancelled.state).toBe("cancelled");

    const after = await client.getAppointment(createdId!);
    expect(after.state).toBe("cancelled");
  });
});
