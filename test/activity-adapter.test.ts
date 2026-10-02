/** FE2 Actividad, Corridas y Productividad — real-mode adapters at the axios boundary. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityItem, AgentRunOut, ProductivityReport } from "../src/contracts/client";
import type { ClinicLocation, StaffIdentity } from "../src/types";

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }));

vi.mock("axios", () => ({
  default: {
    create: () => ({ get: mockGet, post: mockPost }),
    isAxiosError: (error: unknown) => Boolean((error as { isAxiosError?: boolean })?.isAxiosError),
  },
}));

const envelopeError = (status: number, code: string, message = "backend message", details: Record<string, unknown> = {}) =>
  ({ isAxiosError: true, response: { status, data: { error: { code, message, details } } } });

const LOCATIONS = new Map<number, ClinicLocation>([[1, { id: 1, name: "ODONTO SMART Lince", timeZone: "America/Lima" }]]);

const row = (overrides: Partial<ActivityItem>): ActivityItem => ({
  source: "proposal",
  id: 1,
  occurred_at: "2026-10-01T15:00:00Z",
  action: "agent_proposal.created",
  entity_type: "agent_proposal",
  entity_id: "7",
  actor_kind: "agent",
  actor_principal_id: 11,
  actor_display_name: "airy-cobranza",
  agent_key: "cobranza",
  location_id: 1,
  summary: "airy-cobranza propuso una acción para aprobar",
  ...overrides,
});

const run = (overrides: Partial<AgentRunOut>): AgentRunOut => ({
  id: 4,
  agent_key: "cobranza",
  trigger: "manual",
  status: "completed",
  triggered_by_principal_id: 2,
  counts: { candidates: 9, proposed: 5, deduped: 3, skipped: 1 },
  error_category: null,
  started_at: "2026-10-01T15:00:00Z",
  finished_at: "2026-10-01T15:00:04Z",
  ...overrides,
});

const report: ProductivityReport = {
  from: "2026-09-02",
  to: "2026-10-01",
  location_id: null,
  appointments: { completed: 14, no_show: 2, cancelled: 3 },
  money: { currency: "PEN", charged: "1250.50", collected: "20.00", outstanding: "130.00" },
  proposals: [
    { agent_key: "cobranza", created: 6, approved: 4, declined: 1, expired: 1 },
    { agent_key: "reception", created: 2, approved: 1, declined: 0, expired: 1 },
  ],
  collection_reminders_approved: 3,
};

const identity = (permissions: string[]): StaffIdentity => ({ principalType: "human", displayName: "X", organizationName: "ODONTO SMART", roles: [], permissions });

describe("FE2 real-mode adapters (mocked axios)", () => {
  let api: typeof import("../src/api");

  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false");
    api = await import("../src/api");
  });
  afterAll(() => vi.unstubAllEnvs());
  beforeEach(() => { mockGet.mockReset(); mockPost.mockReset(); });

  describe("Actividad", () => {
    it("asks for one page with the filters and keeps the cursor", async () => {
      mockGet.mockResolvedValue({ data: { items: [row({})], next_cursor: "next" } });
      const page = await api.loadActivity({ locationId: 1, agentKey: "cobranza", cursor: "prev" }, LOCATIONS);
      expect(mockGet).toHaveBeenCalledWith("/activity", { params: { location_id: 1, agent_key: "cobranza", limit: 25, cursor: "prev" } });
      expect(page.nextCursor).toBe("next");
      expect(page.entries).toHaveLength(1);
    });

    it("sends no filter the person did not choose", async () => {
      mockGet.mockResolvedValue({ data: { items: [], next_cursor: null } });
      await api.loadActivity({}, LOCATIONS);
      expect(mockGet).toHaveBeenCalledWith("/activity", { params: { limit: 25 } });
    });

    it("names an agent by what it does, not by its principal", () => {
      const entry = api.toUiActivityItem(row({}), LOCATIONS);
      expect(entry).toMatchObject({
        key: "proposal:1",
        actorKind: "agent",
        actorLabel: "El agente de Cobranza",
        verb: "propuso una acción para aprobar",
        context: null,
        agentLabel: "Cobranza",
        locationName: "ODONTO SMART Lince",
        timeZone: "America/Lima",
      });
      expect(api.activitySentence(entry)).toBe("El agente de Cobranza propuso una acción para aprobar");
    });

    it("a person's decision says which agent's proposal it was", () => {
      const entry = api.toUiActivityItem(row({ id: 2, action: "agent_proposal.approved", actor_kind: "human", actor_principal_id: 2, actor_display_name: "Lucía Ramos", summary: "Lucía Ramos aprobó una propuesta" }), LOCATIONS);
      expect(entry).toMatchObject({ actorKind: "human", actorLabel: "Lucía Ramos", verb: "aprobó una propuesta", context: "del agente de Cobranza" });
      expect(api.activitySentence(entry)).toBe("Lucía Ramos aprobó una propuesta del agente de Cobranza");
    });

    it("a run someone started reads as that person's, for that agent", () => {
      const entry = api.toUiActivityItem(row({ source: "agent_run", id: 4, action: "agent_run.completed", entity_type: "agent_run", entity_id: "4", actor_kind: "human", actor_display_name: "Lucía Ramos", location_id: null, summary: "Lucía Ramos completó una corrida" }), LOCATIONS);
      expect(api.activitySentence(entry)).toBe("Lucía Ramos completó una corrida del agente de Cobranza");
      expect(entry.locationName).toBeNull();
    });

    it("recognises an agent principal on rows without an agent key", () => {
      const entry = api.toUiActivityItem(row({ source: "audit", agent_key: null, actor_display_name: "airy-inventario", action: "agent_tool.called", summary: "airy-inventario usó una herramienta" }), LOCATIONS);
      expect(entry.actorLabel).toBe("El agente de Inventario");
      expect(entry.agentKey).toBe("inventario");
    });

    it("system rows and unknown agents keep the backend's name", () => {
      expect(api.toUiActivityItem(row({ source: "audit", actor_kind: "system", actor_principal_id: null, actor_display_name: "Sistema", agent_key: null, action: "outbound.settled", summary: "Sistema registró la entrega de un mensaje" }), LOCATIONS))
        .toMatchObject({ actorKind: "system", actorLabel: "Sistema", verb: "registró la entrega de un mensaje" });
      expect(api.toUiActivityItem(row({ agent_key: null, actor_display_name: "otro-bot", summary: "otro-bot propuso una acción para aprobar" }), LOCATIONS).actorLabel).toBe("El agente otro-bot");
    });

    it("renders an action without a template as it arrives (no client blocklist)", () => {
      const entry = api.toUiActivityItem(row({ source: "audit", action: "credential.issued", entity_type: "credential", actor_kind: "human", actor_display_name: "Carlos Vega", agent_key: null, location_id: null, summary: "Carlos Vega: credential.issued" }), LOCATIONS);
      expect(entry.verb).toBeNull();
      expect(api.activitySentence(entry)).toBe("Carlos Vega · credential.issued");
    });

    it("an unknown location degrades to no name, never an invented one", () => {
      expect(api.toUiActivityItem(row({ location_id: 99 }), LOCATIONS)).toMatchObject({ locationName: null, timeZone: "America/Lima" });
    });
  });

  describe("Corridas", () => {
    it("asks for the newest runs by limit (the contract has no cursor)", async () => {
      mockGet.mockResolvedValue({ data: { items: [run({})] } });
      const history = await api.loadAgentRuns({ agentKey: "cobranza", limit: 25 });
      expect(mockGet).toHaveBeenCalledWith("/agent-runs", { params: { agent_key: "cobranza", limit: 25 } });
      expect(history).toMatchObject({ hasMore: false, limit: 25 });
    });

    it("offers more only while a full page came back and the backend cap allows it", async () => {
      mockGet.mockResolvedValue({ data: { items: Array.from({ length: 50 }, (_, index) => run({ id: index + 1 })) } });
      expect((await api.loadAgentRuns({ limit: 50 })).hasMore).toBe(true);
      mockGet.mockResolvedValue({ data: { items: Array.from({ length: 100 }, (_, index) => run({ id: index + 1 })) } });
      const capped = await api.loadAgentRuns({ limit: 500 });
      expect(mockGet).toHaveBeenLastCalledWith("/agent-runs", { params: { limit: 100 } });
      expect(capped.hasMore).toBe(false);
    });

    it("a sweep shows its four counts in plain Spanish", () => {
      const entry = api.toUiAgentRun(run({}));
      expect(entry).toMatchObject({ key: "run:4", agentLabel: "Cobranza", triggerLabel: "Manual", conversationTurn: false, durationLabel: "4 s" });
      expect(entry.counts).toEqual([
        { label: "Revisados", value: 9 },
        { label: "Propuestas nuevas", value: 5 },
        { label: "Ya propuestas", value: 3 },
        { label: "Omitidos", value: 1 },
      ]);
    });

    it("Confirmaciones counts reminders in the queue", () => {
      expect(api.toUiAgentRun(run({ agent_key: "confirmaciones", counts: { candidates: 2, proposed: 2, deduped: 0, skipped: 0 } })).counts.map((count) => count.label))
        .toEqual(["Citas revisadas", "Recordatorios en cola", "Ya estaban en cola", "Omitidos"]);
    });

    it("a reception run is a conversation turn without counts", () => {
      const entry = api.toUiAgentRun(run({ agent_key: "reception", trigger: "event", counts: { candidates: 0, proposed: 0, deduped: 0, skipped: 0 } }));
      expect(entry).toMatchObject({ agentLabel: "Recepción", triggerLabel: "Por mensaje", conversationTurn: true, counts: [] });
    });

    it("a failed or running run keeps its category and has no duration yet", () => {
      expect(api.toUiAgentRun(run({ status: "failed", error_category: "timeout" }))).toMatchObject({ status: "failed", errorCategory: "timeout" });
      expect(api.toUiAgentRun(run({ status: "running", finished_at: null })).durationLabel).toBeNull();
    });
  });

  describe("Productividad", () => {
    it("asks for the inclusive local range and formats soles", async () => {
      mockGet.mockResolvedValue({ data: report });
      const view = await api.loadProductivity({ from: "2026-09-02", to: "2026-10-01", locationId: 1 });
      expect(mockGet).toHaveBeenCalledWith("/metrics/productivity", { params: { from: "2026-09-02", to: "2026-10-01", location_id: 1 } });
      expect(view.money).toEqual({ charged: "S/ 1,250.50", collected: "S/ 20.00", outstanding: "S/ 130.00" });
      expect(view.appointments).toEqual({ completed: 14, noShow: 2, cancelled: 3 });
      expect(view.remindersApproved).toBe(3);
      expect(view.proposals.map((agent) => agent.agentLabel)).toEqual(["Cobranza", "Recepción"]);
    });

    it("refuses an inverted or too-long range before calling the backend", async () => {
      await expect(api.loadProductivity({ from: "2026-10-02", to: "2026-10-01" })).rejects.toMatchObject({ code: "RANGE_INVALID" });
      await expect(api.loadProductivity({ from: "2026-06-30", to: "2026-10-01" })).rejects.toMatchObject({ code: "RANGE_INVALID" });
      expect(mockGet).not.toHaveBeenCalled();
      expect(api.productivityRangeError("2026-07-01", "2026-10-01")).toBeNull(); // 92 days apart: the backend's limit
      expect(api.productivityRangeError("2026-06-30", "2026-10-01")).toMatch(/92 días/);
    });

    it("builds presets in the clinic's local calendar", () => {
      // 02:00 UTC on Oct 2 is still Oct 1 in Lima.
      const now = new Date("2026-10-02T02:00:00Z");
      expect(api.productivityPreset("last30", now)).toEqual({ from: "2026-09-02", to: "2026-10-01" });
      expect(api.productivityPreset("month", now)).toEqual({ from: "2026-10-01", to: "2026-10-01" });
      expect(api.productivityPreset("last7", now)).toEqual({ from: "2026-09-25", to: "2026-10-01" });
      expect(api.productivityPreset("last90", now)).toEqual({ from: "2026-07-04", to: "2026-10-01" });
    });
  });

  describe("errors a person can act on", () => {
    it("explains a denied productivity read in role terms", () => {
      expect(api.describeObservabilityError(envelopeError(403, "PERMISSION_DENIED"), "productividad").message).toBe("Solo el administrador puede ver la productividad.");
      expect(api.describeObservabilityError(envelopeError(403, "PERMISSION_DENIED"), "actividad").message).toBe("Tu rol no permite ver la actividad de la clínica.");
      expect(api.describeObservabilityError(envelopeError(401, "AUTHENTICATION_REQUIRED"), "actividad").message).toBe("Elige una persona del equipo para continuar.");
    });

    it("a rejected cursor asks to reload, a rejected range asks to fix the dates", () => {
      expect(api.describeObservabilityError(envelopeError(422, "INVALID_INPUT", "The cursor is invalid."), "actividad")).toEqual({ message: "La lista cambió mientras la leías. Vuelve a cargarla.", reload: true });
      expect(api.describeObservabilityError(envelopeError(422, "INVALID_INPUT", "The range spans more than 92 days."), "productividad").message).toMatch(/92 días/);
    });

    it("a backend that is down says so", () => {
      expect(api.describeObservabilityError(envelopeError(502, "BACKEND_UNREACHABLE", "El backend no responde."), "corridas").message).toBe("El backend no responde.");
    });
  });

  describe("navigation follows /me", () => {
    it("Productividad needs audit.read; Actividad needs proposals.read", () => {
      expect(api.canOpen(identity(["proposals.read"]), "/productividad")).toBe(false);
      expect(api.canOpen(identity(["proposals.read", "audit.read"]), "/productividad")).toBe(true);
      expect(api.canOpen(identity(["proposals.read"]), "/agente")).toBe(true);
      expect(api.canOpen(identity([]), "/agente")).toBe(false);
    });
  });
});
