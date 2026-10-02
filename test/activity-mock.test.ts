/** FE2 mock mode: contract shapes, backend rules, and the trace of Bandeja actions. */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("Actividad, Corridas y Productividad in mock mode", () => {
  let api: typeof import("../src/api");

  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "true");
    api = await import("../src/api");
  });
  beforeEach(async () => { await api.choosePersona("secretaria"); });

  const failure = (promise: Promise<unknown>) => promise.then(() => { throw new Error("expected a rejection"); }, (caught) => api.toApiError(caught));
  const allActivity = async (filters: Parameters<typeof api.loadActivity>[0] = {}) => {
    const locations = await api.loadClinicLocations();
    const entries = [];
    let cursor: string | null = null;
    do {
      const page: Awaited<ReturnType<typeof api.loadActivity>> = await api.loadActivity({ ...filters, cursor }, locations);
      entries.push(...page.entries);
      cursor = page.nextCursor;
    } while (cursor);
    return entries;
  };

  it("tells people and agents apart, newest first", async () => {
    const entries = await allActivity();
    expect(entries.some((entry) => entry.actorKind === "human" && entry.actorLabel === "Lucía Ramos")).toBe(true);
    expect(entries.some((entry) => entry.actorLabel === "El agente de Cobranza")).toBe(true);
    const times = entries.map((entry) => entry.occurredAt);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it("pages with an opaque cursor without repeating rows", async () => {
    const entries = await allActivity();
    expect(entries.length).toBeGreaterThan(25);
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(entries.length);
  });

  it("filters by agent and by sede like the backend", async () => {
    const cobranza = await allActivity({ agentKey: "cobranza" });
    expect(cobranza.length).toBeGreaterThan(0);
    expect(cobranza.every((entry) => entry.agentKey === "cobranza")).toBe(true);
    const lince = await allActivity({ locationId: 1 });
    expect(lince.length).toBeGreaterThan(0);
    expect(lince.every((entry) => entry.locationName === "Lince")).toBe(true);
  });

  it("refuses the feed without a persona (401)", async () => {
    await api.choosePersona(null);
    const error = await failure(api.loadActivity({}, new Map()));
    expect(error).toMatchObject({ httpStatus: 401 });
  });

  it("Productividad is administrator-only (403 for the secretaria)", async () => {
    const range = api.productivityPreset("last30");
    const error = await failure(api.loadProductivity(range));
    expect(error).toMatchObject({ httpStatus: 403, code: "PERMISSION_DENIED" });
    await api.choosePersona("administrador");
    const view = await api.loadProductivity(range);
    expect(view.appointments.completed).toBeGreaterThan(0);
    expect(view.money.charged).toMatch(/^S\/\s[\d,]+\.\d{2}$/);
    expect(view.proposals.map((row) => row.agent)).toEqual(expect.arrayContaining(["cobranza", "reception"]));
  });

  it("mirrors the 92-day limit with the backend's 422", async () => {
    await api.choosePersona("administrador");
    const error = await failure(api.loadProductivity({ from: "2026-01-01", to: "2026-10-01" }));
    expect(error.code).toBe("RANGE_INVALID");
  });

  it("'Ejecutar ahora' leaves a run in Corridas and a line in Actividad", async () => {
    const before = await api.loadAgentRuns({ agentKey: "cobranza" });
    await api.runAgentNow("cobranza", api.newIdempotencyKey());
    const after = await api.loadAgentRuns({ agentKey: "cobranza" });
    expect(after.entries.length).toBe(before.entries.length + 1);
    expect(after.entries[0]).toMatchObject({ agent: "cobranza", triggerLabel: "Manual", status: "completed" });
    // The run row is stamped when it started; the proposals it created come after it.
    const entries = (await api.loadActivity({}, await api.loadClinicLocations())).entries;
    const latestRun = entries.find((entry) => entry.source === "agent_run");
    expect(api.activitySentence(latestRun!)).toBe("Lucía Ramos completó una corrida del agente de Cobranza");
    expect(entries[0]!.occurredAt >= latestRun!.occurredAt).toBe(true);
  });

  it("approving in the Bandeja shows up in Actividad and in Productividad", async () => {
    await api.choosePersona("administrador");
    const range = api.productivityPreset("last30");
    const approvedBefore = (await api.loadProductivity(range)).proposals.find((row) => row.agent === "cobranza")!.approved;
    const remindersBefore = (await api.loadProductivity(range)).remindersApproved;
    const reminder = (await api.loadInbox({ status: "pending" })).items.find((item) => item.kind === "collection_reminder")!;
    await api.decideInboxItem(reminder, api.beginDecision(reminder, "approve"));
    const entries = (await api.loadActivity({ agentKey: "cobranza" }, await api.loadClinicLocations())).entries;
    expect(entries.some((entry) => api.activitySentence(entry) === "Carlos Vega aprobó una propuesta del agente de Cobranza")).toBe(true);
    const after = await api.loadProductivity(range);
    expect(after.proposals.find((row) => row.agent === "cobranza")!.approved).toBe(approvedBefore + 1);
    expect(after.remindersApproved).toBe(remindersBefore + 1);
  });

  it("run history pages by limit up to the backend's 100", async () => {
    const history = await api.loadAgentRuns({ limit: 2 });
    expect(history.entries).toHaveLength(2);
    expect(history.hasMore).toBe(true);
  });
});
