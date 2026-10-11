import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }));

vi.mock("axios", () => ({
  default: {
    create: () => ({ get: mockGet, post: mockPost }),
    isAxiosError: (error: unknown) => Boolean((error as { isAxiosError?: boolean })?.isAxiosError),
  },
}));

type Adapter = typeof import("../src/practitioners");
type Roster = Awaited<ReturnType<Adapter["loadRoster"]>>;

const load = () => import("../src/practitioners");
const byName = (roster: Roster, name: string) => roster.find((row) => row.display_name.includes(name))!;
/** An active doctor nothing depends on: the one a demo can switch off. */
const freeDoctor = (roster: Roster) => roster.find((row) => row.membership_active && row.future_confirmed_appointments === 0)!;

/** Demo mode answers as the chosen persona would be answered by the backend: by its `/me` permissions. */
const asPersona = async (key: "secretaria" | "administrador") => (await import("../src/session")).choosePersona(key);

describe("practitioners adapter (mocks)", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "true");
    mockGet.mockReset();
    mockPost.mockReset();
    await asPersona("administrador");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("deactivates and reactivates a practitioner reversibly", async () => {
    const adapter = await load();
    const first = freeDoctor(await adapter.loadRoster());
    const off = await adapter.toggleAdminEntity("practitioners", first.id, false, "k-1", "Fin de contrato");
    expect(off).toMatchObject({ entity_type: "practitioner_membership", id: first.id, practitioner_id: first.id, is_active: false, reason: "Fin de contrato" });
    expect(off.deactivated_at).not.toBeNull();
    expect((await adapter.loadRoster()).find((row) => row.id === first.id)?.membership_active).toBe(false);
    const on = await adapter.toggleAdminEntity("practitioners", first.id, true, "k-2");
    expect(on).toMatchObject({ is_active: true, deactivated_at: null, reason: null });
    expect((await adapter.loadRoster()).find((row) => row.id === first.id)?.membership_active).toBe(true);
  });

  it("refuses a deactivation with future appointments like the backend (409)", async () => {
    const adapter = await load();
    const busy = (await adapter.loadRoster()).find((row) => row.future_confirmed_appointments > 0)!;
    const failure = await adapter.toggleAdminEntity("practitioners", busy.id, false, "k-3", "Fin de contrato").catch((caught: unknown) => caught);
    expect(failure).toMatchObject({ httpStatus: 409, code: "APPOINTMENT_CONFLICT" });
    const details = (failure as { details: { reason: string; appointment_ids: number[] } }).details;
    expect(details.reason).toBe("future_appointments");
    expect(details.appointment_ids).toHaveLength(busy.future_confirmed_appointments);
    expect((await adapter.loadRoster()).find((row) => row.id === busy.id)?.membership_active).toBe(true);
  });

  it("replays the same idempotency key and rejects it with other data", async () => {
    const adapter = await load();
    const first = freeDoctor(await adapter.loadRoster());
    const a = await adapter.toggleAdminEntity("practitioners", first.id, false, "k-4", "Motivo A");
    const b = await adapter.toggleAdminEntity("practitioners", first.id, false, "k-4", "Motivo A");
    expect(b).toEqual(a);
    await expect(adapter.toggleAdminEntity("practitioners", first.id, false, "k-4", "Motivo B"))
      .rejects.toMatchObject({ httpStatus: 409, code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("requires a reason of at least 3 characters to deactivate, and nothing changes without it", async () => {
    const adapter = await load();
    const first = freeDoctor(await adapter.loadRoster());
    await expect(adapter.toggleAdminEntity("practitioners", first.id, false, "k-5", "  ")).rejects.toMatchObject({ httpStatus: 422, code: "INVALID_INPUT" });
    await expect(adapter.toggleAdminEntity("practitioners", first.id, false, "k-6", "no")).rejects.toMatchObject({ httpStatus: 422, code: "INVALID_INPUT" });
    expect((await adapter.loadRoster()).find((row) => row.id === first.id)?.membership_active).toBe(true);
  });

  it("mirrors the backend state errors: already inactive 409, already active 422, unknown 404", async () => {
    const adapter = await load();
    const roster = await adapter.loadRoster();
    const former = roster.find((row) => !row.membership_active)!;
    const active = freeDoctor(roster);
    await expect(adapter.toggleAdminEntity("practitioners", former.id, false, "k-7", "Otra vez")).rejects.toMatchObject({ httpStatus: 409, code: "ENTITY_INACTIVE" });
    await expect(adapter.toggleAdminEntity("practitioners", active.id, true, "k-8")).rejects.toMatchObject({ httpStatus: 422, code: "INVALID_INPUT" });
    await expect(adapter.toggleAdminEntity("practitioners", 9999, true, "k-9")).rejects.toMatchObject({ httpStatus: 404, code: "NOT_FOUND" });
  });

  it("ships the ODONTO SMART demo stories: Renato out, Valeria without Saturdays, Andrea multi-site, Torres paused", async () => {
    const adapter = await load();
    const roster = await adapter.loadRoster();
    const renato = byName(roster, "Renato Paredes");
    expect(renato).toMatchObject({ membership_active: false, platform_active: true, future_confirmed_appointments: 0 });
    expect(renato.deactivated_at).not.toBeNull();

    const valeria = byName(roster, "Valeria Ruiz");
    const saturday = valeria.availability_rules.filter((rule) => rule.day_of_week === 5);
    expect(saturday.length).toBeGreaterThan(0);
    expect(saturday.every((rule) => !rule.is_active && rule.deactivated_at !== null)).toBe(true);
    expect(valeria.availability_rules.some((rule) => rule.is_active && rule.day_of_week < 5)).toBe(true);

    const andrea = byName(roster, "Andrea Salazar");
    expect(new Set(andrea.capabilities.map((capability) => capability.location_id)).size).toBeGreaterThan(1);
    expect(andrea.future_confirmed_appointments).toBeGreaterThan(0);

    const torres = byName(roster, "Torres");
    expect(torres.membership_active).toBe(true);
    expect(torres.capabilities.some((capability) => !capability.is_active)).toBe(true);
    expect(torres.capabilities.some((capability) => capability.is_active)).toBe(true);
  });

  it("toggles a capability and a schedule rule on their own, without touching the doctor", async () => {
    const adapter = await load();
    const andrea = byName(await adapter.loadRoster(), "Carlos Mendoza");
    const capability = andrea.capabilities.find((item) => item.is_active)!;
    const rule = andrea.availability_rules.find((item) => item.is_active)!;

    const capabilityOff = await adapter.toggleAdminEntity("capabilities", capability.id, false, "k-10", "Pausa temporal");
    expect(capabilityOff).toMatchObject({ entity_type: "practitioner_capability", id: capability.id, practitioner_id: andrea.id, is_active: false, reason: "Pausa temporal" });
    const ruleOff = await adapter.toggleAdminEntity("availability-rules", rule.id, false, "k-11", "Cambia de horario");
    expect(ruleOff).toMatchObject({ entity_type: "availability_rule", id: rule.id, practitioner_id: andrea.id, is_active: false });

    let after = byName(await adapter.loadRoster(), "Carlos Mendoza");
    expect(after.capabilities.find((item) => item.id === capability.id)).toMatchObject({ is_active: false });
    expect(after.availability_rules.find((item) => item.id === rule.id)).toMatchObject({ is_active: false });
    expect(after.membership_active).toBe(true);

    await adapter.toggleAdminEntity("capabilities", capability.id, true, "k-12");
    await adapter.toggleAdminEntity("availability-rules", rule.id, true, "k-13");
    after = byName(await adapter.loadRoster(), "Carlos Mendoza");
    expect(after.capabilities.find((item) => item.id === capability.id)).toMatchObject({ is_active: true, deactivated_at: null });
    expect(after.availability_rules.find((item) => item.id === rule.id)).toMatchObject({ is_active: true, deactivated_at: null });
  });

  it("switches locations and services off and on in the settings catalogs", async () => {
    const adapter = await load();
    const settings = await import("../src/settings");
    // Nothing is booked in Magdalena nor for Ortodoncia: the backend lets them go.
    const location = (await settings.loadSettingsLocations()).find((row) => row.name === "Magdalena");
    const service = (await settings.loadSettingsServices()).find((row) => row.name === "Ortodoncia");

    const locationOff = await adapter.toggleAdminEntity("locations", location!.id, false, "k-14", "Remodelación");
    expect(locationOff).toMatchObject({ entity_type: "location", id: location!.id, practitioner_id: null, is_active: false });
    const serviceOff = await adapter.toggleAdminEntity("services", service!.id, false, "k-15", "Ya no se ofrece");
    expect(serviceOff).toMatchObject({ entity_type: "service", id: service!.id, practitioner_id: null, is_active: false });
    expect((await settings.loadSettingsLocations()).find((row) => row.id === location!.id)?.is_active).toBe(false);
    expect((await settings.loadSettingsServices()).find((row) => row.id === service!.id)?.is_active).toBe(false);

    await adapter.toggleAdminEntity("locations", location!.id, true, "k-16");
    await adapter.toggleAdminEntity("services", service!.id, true, "k-17");
    expect((await settings.loadSettingsLocations()).find((row) => row.id === location!.id)?.is_active).toBe(true);
    expect((await settings.loadSettingsServices()).find((row) => row.id === service!.id)?.is_active).toBe(true);
  });

  it("adds a doctor, then a service and a schedule for them, and refuses a duplicate service pointing at the existing row", async () => {
    const adapter = await load();
    const created = await adapter.addPractitioner({ display_name: "  Dra. Camila Vega ", is_active: true }, "k-18");
    expect(created).toMatchObject({ display_name: "Dra. Camila Vega", is_active: true });
    expect((await adapter.loadRoster()).find((row) => row.id === created.id)).toMatchObject({ membership_active: true, capabilities: [], availability_rules: [] });

    const capability = await adapter.addCapability({ practitioner_id: created.id, service_id: 1, location_id: 1, is_active: true }, "k-19");
    expect(capability).toMatchObject({ practitioner_id: created.id, service_id: 1, location_id: 1, is_active: true });
    const failure = await adapter.addCapability({ practitioner_id: created.id, service_id: 1, location_id: 1, is_active: true }, "k-20").catch((caught: unknown) => caught);
    expect(failure).toMatchObject({ httpStatus: 422, code: "INVALID_INPUT", details: { capability_id: capability.id, is_active: true } });

    const rule = await adapter.addAvailabilityRule({ practitioner_id: created.id, location_id: 1, day_of_week: 2, start_local: "09:00:00", end_local: "13:00:00" }, "k-21");
    expect(rule).toMatchObject({ practitioner_id: created.id, location_id: 1, day_of_week: 2, start_local: "09:00:00", end_local: "13:00:00" });
    const roster = (await adapter.loadRoster()).find((row) => row.id === created.id)!;
    expect(roster.capabilities).toHaveLength(1);
    expect(roster.availability_rules).toHaveLength(1);
    await expect(adapter.addAvailabilityRule({ practitioner_id: created.id, location_id: 1, day_of_week: 2, start_local: "13:00:00", end_local: "09:00:00" }, "k-22"))
      .rejects.toMatchObject({ httpStatus: 422, code: "INVALID_INPUT" });
  });

  it("points a duplicate that is paused at the paused row, so it can be reactivated instead", async () => {
    const adapter = await load();
    const torres = byName(await adapter.loadRoster(), "Torres");
    const paused = torres.capabilities.find((capability) => !capability.is_active)!;
    await expect(adapter.addCapability({ practitioner_id: torres.id, service_id: paused.service_id, location_id: paused.location_id, is_active: true }, "k-23"))
      .rejects.toMatchObject({ httpStatus: 422, details: { capability_id: paused.id, is_active: false } });
  });

  it("renames a doctor and refuses an empty name", async () => {
    const adapter = await load();
    const first = freeDoctor(await adapter.loadRoster());
    expect(await adapter.renameRosterPractitioner(first.id, "  Dr. Nuevo Nombre ", "k-24")).toEqual({ id: first.id, display_name: "Dr. Nuevo Nombre" });
    expect((await adapter.loadRoster()).find((row) => row.id === first.id)?.display_name).toBe("Dr. Nuevo Nombre");
    await expect(adapter.renameRosterPractitioner(first.id, "   ", "k-25")).rejects.toMatchObject({ httpStatus: 422 });
    await expect(adapter.renameRosterPractitioner(9999, "X", "k-26")).rejects.toMatchObject({ httpStatus: 404 });
  });

  it("keeps a history: the demo stories plus every change made in the session, with the reason", async () => {
    const adapter = await load();
    const renato = byName(await adapter.loadRoster(), "Renato Paredes");
    const before = await adapter.loadHistory(renato.id);
    expect(before.map((event) => event.action)).toContain("practitioner_membership.deactivated");
    expect(before.find((event) => event.action === "practitioner_membership.deactivated")?.after_state).toMatchObject({ reason: expect.any(String) });

    await adapter.toggleAdminEntity("practitioners", renato.id, true, "k-27");
    const after = await adapter.loadHistory(renato.id);
    expect(after).toHaveLength(before.length + 1);
    const latest = after.reduce((a, b) => (new Date(a.occurred_at) > new Date(b.occurred_at) ? a : b));
    expect(latest).toMatchObject({ action: "practitioner_membership.reactivated", entity_type: "practitioner_membership", actor_type: "human" });
    expect(after.every((event) => typeof event.id === "number" && typeof event.entity_id === "string")).toBe(true);

    const busy = (await adapter.loadRoster()).find((row) => row.future_confirmed_appointments > 0)!;
    const untouched = await adapter.loadHistory(busy.id);
    await adapter.toggleAdminEntity("practitioners", busy.id, false, "k-28", "Motivo").catch(() => undefined);
    expect(await adapter.loadHistory(busy.id)).toHaveLength(untouched.length);
  });

  it("guards what the backend guards: a doctor, a capability, a site or a service with future confirmed appointments (409 + ids), never a schedule", async () => {
    const adapter = await load();
    const settings = await import("../src/settings");
    const andrea = byName(await adapter.loadRoster(), "Andrea Salazar");
    const booked = andrea.capabilities.find((item) => item.service_name === "Limpieza dental" && item.location_name === "Lince")!;
    const lince = (await settings.loadSettingsLocations()).find((row) => row.name === "Lince")!;
    const cleaning = (await settings.loadSettingsServices()).find((row) => row.name === "Limpieza dental")!;
    for (const [entity, id] of [["practitioners", andrea.id], ["capabilities", booked.id], ["locations", lince.id], ["services", cleaning.id]] as const) {
      const failure = await adapter.toggleAdminEntity(entity, id, false, `guard-${entity}`, "Motivo claro").catch((caught: unknown) => caught);
      expect(failure).toMatchObject({ httpStatus: 409, code: "APPOINTMENT_CONFLICT", details: { reason: "future_appointments" } });
      expect((failure as { details: { appointment_ids: number[] } }).details.appointment_ids.length).toBeGreaterThan(0);
    }
    const rule = andrea.availability_rules.find((item) => item.is_active)!;
    await expect(adapter.toggleAdminEntity("availability-rules", rule.id, false, "guard-rule", "Cambia de horario")).resolves.toMatchObject({ is_active: false });
  });

  it("lists in the 409 exactly the appointments the roster counts for that doctor", async () => {
    const adapter = await load();
    const andrea = byName(await adapter.loadRoster(), "Andrea Salazar");
    const failure = await adapter.toggleAdminEntity("practitioners", andrea.id, false, "count", "Motivo claro").catch((caught: unknown) => caught);
    expect((failure as { details: { appointment_ids: number[] } }).details.appointment_ids).toHaveLength(andrea.future_confirmed_appointments);
  });

  it("answers a profile without *.manage like the backend: roster readable, every change and the history 403 PERMISSION_DENIED, nothing changes", async () => {
    await asPersona("secretaria");
    const adapter = await load();
    const roster = await adapter.loadRoster();
    const free = freeDoctor(roster);
    const denied = { httpStatus: 403, code: "PERMISSION_DENIED" };
    await expect(adapter.toggleAdminEntity("practitioners", free.id, false, "s-1", "Fin de contrato")).rejects.toMatchObject(denied);
    await expect(adapter.toggleAdminEntity("capabilities", free.capabilities[0]!.id, false, "s-2", "Pausa temporal")).rejects.toMatchObject(denied);
    await expect(adapter.toggleAdminEntity("availability-rules", free.availability_rules[0]!.id, false, "s-3", "Pausa temporal")).rejects.toMatchObject(denied);
    await expect(adapter.toggleAdminEntity("locations", 3, false, "s-4", "Remodelación")).rejects.toMatchObject(denied);
    await expect(adapter.toggleAdminEntity("services", 3, false, "s-5", "Ya no se ofrece")).rejects.toMatchObject(denied);
    await expect(adapter.renameRosterPractitioner(free.id, "Otro nombre", "s-6")).rejects.toMatchObject(denied);
    await expect(adapter.addPractitioner({ display_name: "Dr. Nuevo", is_active: true }, "s-7")).rejects.toMatchObject(denied);
    await expect(adapter.addCapability({ practitioner_id: free.id, service_id: 5, location_id: 3, is_active: true }, "s-8")).rejects.toMatchObject(denied);
    await expect(adapter.addAvailabilityRule({ practitioner_id: free.id, location_id: 1, day_of_week: 6, start_local: "09:00:00", end_local: "12:00:00" }, "s-9")).rejects.toMatchObject(denied);
    await expect(adapter.loadHistory(free.id)).rejects.toMatchObject(denied);
    expect(await adapter.loadRoster()).toEqual(roster);
  });

  it("gives the demo administrador the *.manage grants of the backend profile (B8), and the secretaria none", async () => {
    const { mockStaff } = await import("../src/mockData");
    const grants = ["practitioners.manage", "capabilities.read", "capabilities.manage", "availability.manage", "locations.manage", "services.manage"];
    const permissionsOf = (key: string) => mockStaff.find((staff) => staff.key === key)!.me.permissions;
    expect(permissionsOf("administrador")).toEqual(expect.arrayContaining(grants));
    expect(permissionsOf("secretaria").filter((code) => grants.includes(code))).toEqual([]);
  });

  it("scopes an idempotency key to one command like PF4: the same key on another command is a new change", async () => {
    const adapter = await load();
    const free = freeDoctor(await adapter.loadRoster());
    await adapter.toggleAdminEntity("practitioners", free.id, false, "shared-key", "Fin de contrato");
    await expect(adapter.toggleAdminEntity("practitioners", free.id, true, "shared-key")).resolves.toMatchObject({ is_active: true });
  });

  it("refuses a key another person already used for the same command (IDEMPOTENCY_KEY_REUSED), even with the same data", async () => {
    const adapter = await load();
    const free = freeDoctor(await adapter.loadRoster());
    await adapter.toggleAdminEntity("practitioners", free.id, false, "k-person", "Fin de contrato");
    const session = await import("../src/session");
    const { mockStaff } = await import("../src/mockData");
    mockStaff.find((staff) => staff.key === "secretaria")!.me.permissions.push("practitioners.manage");
    await session.choosePersona("secretaria");
    await expect(adapter.toggleAdminEntity("practitioners", free.id, false, "k-person", "Fin de contrato"))
      .rejects.toMatchObject({ httpStatus: 409, code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("does not pretend the altas are idempotent: the backend ignores the key there, so a retry creates another doctor", async () => {
    const adapter = await load();
    const a = await adapter.addPractitioner({ display_name: "Dra. Repetida", is_active: true }, "same");
    const b = await adapter.addPractitioner({ display_name: "Dra. Repetida", is_active: true }, "same");
    expect(b.id).not.toBe(a.id);
  });

  it("adds a capability on a site or service that is switched off, like the backend (it only checks they exist)", async () => {
    const adapter = await load();
    const free = freeDoctor(await adapter.loadRoster());
    await adapter.toggleAdminEntity("services", 3, false, "svc-off", "Ya no se ofrece");
    await expect(adapter.addCapability({ practitioner_id: free.id, service_id: 3, location_id: 3, is_active: true }, "cap-on-off"))
      .resolves.toMatchObject({ service_id: 3, location_id: 3 });
  });

  it("never touches the network in mock mode", async () => {
    const adapter = await load();
    await adapter.loadRoster();
    await adapter.loadHistory(1);
    await adapter.toggleAdminEntity("practitioners", freeDoctor(await adapter.loadRoster()).id, false, "k-29", "Motivo");
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe("practitioners adapter (real backend)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false");
    mockGet.mockReset();
    mockPost.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  const keyed = (key: string) => ({ headers: { "Idempotency-Key": key } });

  it("reads the roster and the history from the backend and consumes zero mock rows", async () => {
    mockGet.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({ data: [] });
    const adapter = await load();
    expect(await adapter.loadRoster()).toEqual([]);
    expect(await adapter.loadHistory(7)).toEqual([]);
    expect(mockGet).toHaveBeenNthCalledWith(1, "/admin/practitioners");
    expect(mockGet).toHaveBeenNthCalledWith(2, "/admin/practitioners/7/history");
  });

  it.each([
    ["practitioners", "/admin/practitioners/5/deactivate"],
    ["capabilities", "/admin/capabilities/5/deactivate"],
    ["availability-rules", "/admin/availability-rules/5/deactivate"],
    ["locations", "/admin/locations/5/deactivate"],
    ["services", "/admin/services/5/deactivate"],
  ] as const)("deactivates %s through the typed client with the reason and the idempotency key", async (entity, url) => {
    const outcome = { entity_type: "service", id: 5, practitioner_id: null, is_active: false, deactivated_at: "2026-10-10T12:00:00Z", reason: "Motivo claro" };
    mockPost.mockResolvedValueOnce({ data: outcome });
    const adapter = await load();
    expect(await adapter.toggleAdminEntity(entity, 5, false, "key-1", "Motivo claro")).toEqual(outcome);
    expect(mockPost).toHaveBeenCalledWith(url, { reason: "Motivo claro" }, keyed("key-1"));
  });

  it("reactivates without a body", async () => {
    mockPost.mockResolvedValueOnce({ data: { entity_type: "practitioner_membership", id: 5, practitioner_id: 5, is_active: true, deactivated_at: null, reason: null } });
    const adapter = await load();
    await adapter.toggleAdminEntity("practitioners", 5, true, "key-2");
    expect(mockPost).toHaveBeenCalledWith("/admin/practitioners/5/reactivate", undefined, keyed("key-2"));
  });

  it("renames and creates through the typed client", async () => {
    mockPost.mockResolvedValue({ data: { id: 5, display_name: "X" } });
    const adapter = await load();
    await adapter.renameRosterPractitioner(5, "Dra. Ana", "key-3");
    await adapter.addPractitioner({ display_name: "Dra. Ana", is_active: true }, "key-4");
    await adapter.addCapability({ practitioner_id: 5, service_id: 1, location_id: 2, is_active: true }, "key-5");
    await adapter.addAvailabilityRule({ practitioner_id: 5, location_id: 2, day_of_week: 1, start_local: "09:00:00", end_local: "13:00:00" }, "key-6");
    expect(mockPost.mock.calls).toEqual([
      ["/admin/practitioners/5/profile", { display_name: "Dra. Ana" }, keyed("key-3")],
      ["/practitioners", { display_name: "Dra. Ana", is_active: true }, keyed("key-4")],
      ["/capabilities", { practitioner_id: 5, service_id: 1, location_id: 2, is_active: true }, keyed("key-5")],
      ["/availability-rules", { practitioner_id: 5, location_id: 2, day_of_week: 1, start_local: "09:00:00", end_local: "13:00:00" }, keyed("key-6")],
    ]);
  });
});
