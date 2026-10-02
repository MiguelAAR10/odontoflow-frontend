/** FE1 Bandeja — real-mode adapter and transport at the axios boundary. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { InboxItem } from "../src/contracts/client";

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }));

vi.mock("axios", () => ({
  default: {
    create: () => ({ get: mockGet, post: mockPost }),
    isAxiosError: (error: unknown) => Boolean((error as { isAxiosError?: boolean })?.isAxiosError),
  },
}));

const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = "a".repeat(64);

const base: Omit<InboxItem, "kind" | "payload" | "evidence" | "facts" | "summary" | "reason"> = {
  source: "agent_proposal",
  id: 7,
  agent_key: "cobranza",
  status: "pending",
  location_id: 1,
  payload_hash: HASH,
  subject: { type: "charge", id: "31" },
  conversation_id: 12,
  confirmation_token: null,
  expires_at: "2026-10-04T15:00:00Z",
  created_at: "2026-10-01T15:00:00Z",
  decided_by: null,
  result_ref: null,
  error_code: null,
  actions: ["approve", "decline"],
};

const reminder: InboxItem = {
  ...base,
  kind: "collection_reminder",
  summary: "Recordatorio de pago a Rosa Quispe — saldo S/ 180.00",
  reason: "Saldo vencido de S/ 180.00 hace 12 días",
  facts: { charge_id: 31, patient_id: 4, patient_name: "Rosa Quispe", amount: "250.00", paid: "70.00", balance: "180.00" },
  evidence: { run_id: 3, amount: "250.00", balance: "180.00", days_since_issued: 12, issued_on: "2026-09-19", last_payment_at: "2026-09-20T15:00:00+00:00", last_payment_amount: "70.00" },
  payload: { charge_id: 31, message_text: "Hola Rosa, le escribimos de ODONTO SMART Lince. Tiene un saldo pendiente de S/ 180.00." },
};

const transfer: InboxItem = {
  ...base,
  id: 8,
  agent_key: "inventario",
  kind: "inventory_transfer",
  subject: { type: "product_location", id: "2:1" },
  conversation_id: null,
  location_id: 1,
  summary: "Traspaso de 16.00 uds. (producto #2) sede #2 → #1",
  reason: "Guantes: Lince 4.00 < mín. 10.00; traspasar 16.00 desde Jesús María",
  facts: null,
  evidence: {
    run_id: 4, product_id: 2, product_name: "Guantes de nitrilo", unit: "caja",
    target: { location_id: 1, name: "ODONTO SMART Lince", balance: "4.00", min_quantity: "10.00", consumption_7d: "6.00" },
    donor: { location_id: 2, name: "ODONTO SMART Jesús María", balance: "40.00", min_quantity: "10.00", consumption_7d: "2.00", surplus: "30.00" },
    target_fill: "16.00", quantity: "16.00", subject_version: "v1",
  },
  payload: { product_id: 2, origin_location_id: 2, destination_location_id: 1, quantity: "16.00" },
  actions: ["decline"],
};

const offer: InboxItem = {
  ...base,
  id: 9,
  agent_key: "backfill",
  kind: "waitlist_offer",
  subject: { type: "appointment", id: "55" },
  conversation_id: null,
  summary: "Cupo libre — ofrecer a 3 pacientes en lista de espera (cita #55)",
  reason: "Cancelación: Limpieza 02/10 10:00 en ODONTO SMART Lince; 4 pacientes en lista de espera, se ofrece a 3",
  facts: null,
  evidence: { run_id: 5, job_key: "k", appointment_id: 55, start_utc: "2026-10-02T15:00:00+00:00", service: "Limpieza dental", location: "ODONTO SMART Lince", matched: 4, offered_to: [3, 4, 5] },
  payload: { appointment_id: 55, entry_ids: [3, 4, 5], message_text: "Se liberó un cupo de Limpieza dental mañana a las 10:00." },
};

const booking: InboxItem = {
  ...base,
  source: "appointment_proposal",
  id: 7,
  agent_key: null,
  kind: "appointment_booking",
  location_id: 1,
  summary: "Cita para Jorge Huamán — 02/10/2026 11:00",
  reason: null,
  facts: null,
  evidence: null,
  payload: { lead_id: 3, patient_id: null, full_name: "Jorge Huamán", service_id: 2, practitioner_id: 9, start_utc: "2026-10-02T16:00:00+00:00", end_utc: "2026-10-02T16:30:00+00:00" },
  payload_hash: null,
  subject: null,
  conversation_id: 41,
  confirmation_token: "7d4f6a1e-2c3b-4f5a-9b6c-1d2e3f4a5b61",
};

const envelopeError = (status: number, code: string, message = "backend message", details: Record<string, unknown> = {}) =>
  ({ isAxiosError: true, response: { status, data: { error: { code, message, details } } } });

const catalogs = async (url: string, config?: { params?: Record<string, unknown> }) => {
  if (url === "/locations") return { data: [{ id: 1, name: "ODONTO SMART Lince", timezone: "America/Lima", is_active: true }] };
  if (url === "/services") return { data: [{ id: 2, name: "Evaluación dental", duration_minutes: 30, is_active: true }] };
  if (url === "/practitioners/eligible") return { data: config?.params?.service_id === 2 ? [{ id: 9, display_name: "Dra. Valeria Ruiz", is_active: true }] : [] };
  throw new Error(`unexpected GET ${url}`);
};

describe("Bandeja real-mode adapter (mocked axios)", () => {
  let api: typeof import("../src/api");

  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false");
    api = await import("../src/api");
  });
  afterAll(() => vi.unstubAllEnvs());
  beforeEach(() => { mockGet.mockReset(); mockPost.mockReset(); });

  describe("reading the inbox", () => {
    it("asks for one status page and keeps the cursor", async () => {
      mockGet.mockImplementation(async (url: string, config?: { params?: Record<string, unknown> }) => {
        if (url === "/agent/inbox") return { data: { items: [reminder], next_cursor: "abc" } };
        return catalogs(url, config);
      });
      const page = await api.loadInbox({ status: "executed", cursor: "prev" });
      const inboxCall = mockGet.mock.calls.find(([url]) => url === "/agent/inbox")!;
      expect(inboxCall[1]).toEqual({ params: { status: "executed", cursor: "prev", limit: 50 } });
      expect(page.nextCursor).toBe("abc");
      expect(page.items).toHaveLength(1);
    });

    it("a collection reminder reads as money and time, not ids", () => {
      const item = api.toUiInboxItem(reminder, { locations: new Map([[1, { name: "ODONTO SMART Lince", timezone: "America/Lima" }]]) });
      expect(item).toMatchObject({
        key: "agent_proposal:7",
        category: "cobranza",
        categoryLabel: "Cobranza",
        headline: "Recordar el pago a Rosa Quispe",
        detail: "Debe S/ 180 hace 12 días",
        message: reminder.payload.message_text,
        locationName: "ODONTO SMART Lince",
        payloadHash: HASH,
        actions: ["approve", "decline"],
      });
      expect(item.facts).toEqual(expect.arrayContaining([
        { label: "Monto del cargo", value: "S/ 250" },
        { label: "Ya pagó", value: "S/ 70" },
      ]));
      expect(item.headline).not.toMatch(/#\d/);
    });

    it("an inventory transfer names the product and both sedes", () => {
      const item = api.toUiInboxItem(transfer);
      expect(item.category).toBe("inventario");
      expect(item.headline).toBe("Traspasar 16 cajas de Guantes de nitrilo a ODONTO SMART Lince");
      expect(item.detail).toBe("ODONTO SMART Lince tiene 4 (mínimo 10); ODONTO SMART Jesús María tiene 40 y le sobran 30");
      expect(item.headline).not.toMatch(/#\d/);
      expect(item.actions).toEqual(["decline"]);
    });

    it("a waitlist offer says how many patients wait and how many get the offer", () => {
      const item = api.toUiInboxItem(offer);
      expect(item.category).toBe("lista_espera");
      expect(item.headline).toBe("Ofrecer el cupo liberado de Limpieza dental");
      expect(item.detail).toBe("4 pacientes esperan este cupo; se ofrece a 3");
      expect(item.facts).toEqual(expect.arrayContaining([{ label: "Sede", value: "ODONTO SMART Lince" }]));
      expect(item.message).toBe(offer.payload.message_text);
    });

    it("an appointment proposal resolves names from real catalog reads", async () => {
      mockGet.mockImplementation(async (url: string, config?: { params?: Record<string, unknown> }) => {
        if (url === "/agent/inbox") return { data: { items: [booking], next_cursor: null } };
        return catalogs(url, config);
      });
      const { items: [item] } = await api.loadInbox({ status: "pending" });
      expect(item).toMatchObject({
        key: "appointment_proposal:7",
        category: "cita",
        headline: "Cita para Jorge Huamán",
        locationName: "ODONTO SMART Lince",
        conversationId: 41,
        confirmationToken: booking.confirmation_token,
      });
      expect(item!.facts).toEqual(expect.arrayContaining([
        { label: "Servicio", value: "Evaluación dental" },
        { label: "Profesional", value: "Dra. Valeria Ruiz" },
      ]));
    });

    it("a failed catalog read leaves names out instead of inventing them", async () => {
      mockGet.mockImplementation(async (url: string) => {
        if (url === "/agent/inbox") return { data: { items: [booking], next_cursor: null } };
        throw envelopeError(403, "PERMISSION_DENIED");
      });
      const { items: [item] } = await api.loadInbox({ status: "pending" });
      expect(item!.locationName).toBeNull();
      expect(item!.facts.find((fact) => fact.label === "Servicio")).toBeUndefined();
      expect(item!.headline).toBe("Cita para Jorge Huamán");
    });

    it("falls back to the backend's own summary and reason when evidence is missing", () => {
      const bare = api.toUiInboxItem({ ...transfer, evidence: null });
      expect(bare.headline).toBe(transfer.summary);
      expect(bare.detail).toBe(transfer.reason);
    });

    it("describes settled outcomes and who decided", () => {
      const done = api.toUiInboxItem({ ...reminder, status: "executed", actions: [], decided_by: { id: 2, display_name: "Lucía Ramos" }, result_ref: { type: "outbound_message", id: 90 } });
      expect(done.decidedBy).toBe("Lucía Ramos");
      expect(done.outcome).toBe("Mensaje en cola de envío");
    });
  });

  describe("deciding", () => {
    it("approves an agent proposal with exactly {payload_hash} and one key per intent", async () => {
      mockPost.mockResolvedValue({ data: { ...reminder, status: "executed", actions: [] }, headers: {} });
      const item = api.toUiInboxItem(reminder);
      const intent = api.beginDecision(item, "approve");
      expect(intent.idempotencyKey).toMatch(UUID4);
      const result = await api.decideInboxItem(item, intent);
      const [url, body, config] = mockPost.mock.calls[0]!;
      expect(url).toBe("/agent/proposals/7/approve");
      expect(body).toEqual({ payload_hash: HASH });
      expect(config).toEqual({ headers: { "Idempotency-Key": intent.idempotencyKey } });
      expect(result.item.status).toBe("executed");
      expect(result.replayed).toBe(false);

      await api.decideInboxItem(item, intent);
      expect(mockPost.mock.calls[1]![2]).toEqual({ headers: { "Idempotency-Key": intent.idempotencyKey } });
      expect(api.beginDecision(item, "approve").idempotencyKey).not.toBe(intent.idempotencyKey);
    });

    it("reports a backend replay", async () => {
      mockPost.mockResolvedValue({ data: { ...reminder, status: "executed", actions: [] }, headers: { "idempotent-replay": "true" } });
      const item = api.toUiInboxItem(reminder);
      expect((await api.decideInboxItem(item, api.beginDecision(item, "approve"))).replayed).toBe(true);
    });

    it("declines an agent proposal with no body", async () => {
      mockPost.mockResolvedValue({ data: { ...transfer, status: "declined", actions: [] }, headers: {} });
      const item = api.toUiInboxItem(transfer);
      const intent = api.beginDecision(item, "decline");
      const result = await api.decideInboxItem(item, intent);
      expect(mockPost.mock.calls[0]).toEqual(["/agent/proposals/8/decline", null, { headers: { "Idempotency-Key": intent.idempotencyKey } }]);
      expect(result.item.status).toBe("declined");
    });

    it("confirms an appointment proposal through the scheduling route", async () => {
      mockPost.mockResolvedValue({ data: { id: 7, status: "confirmed", appointment_id: 501, expires_at: booking.expires_at } });
      const item = api.toUiInboxItem(booking);
      const intent = api.beginDecision(item, "approve");
      const result = await api.decideInboxItem(item, intent);
      expect(mockPost.mock.calls[0]).toEqual([
        "/scheduling/appointment-proposals/confirm",
        { conversation_id: 41, confirmation_token: booking.confirmation_token },
        { headers: { "Idempotency-Key": intent.idempotencyKey } },
      ]);
      expect(result.item.status).toBe("executed");
      expect(result.item.outcome).toBe("Cita creada");
    });

    it("declines an appointment proposal through the scheduling route", async () => {
      mockPost.mockResolvedValue({ data: { id: 7, status: "expired", appointment_id: null, expires_at: booking.expires_at } });
      const item = api.toUiInboxItem(booking);
      const result = await api.decideInboxItem(item, api.beginDecision(item, "decline"));
      expect(mockPost.mock.calls[0]![0]).toBe("/scheduling/appointment-proposals/decline");
      expect(result.item.status).toBe("declined");
    });

    it("refuses to approve an agent proposal without a payload hash", async () => {
      const item = api.toUiInboxItem({ ...reminder, payload_hash: null });
      await expect(api.decideInboxItem(item, api.beginDecision(item, "approve"))).rejects.toThrow();
      expect(mockPost).not.toHaveBeenCalled();
    });
  });

  describe("errors a person can act on", () => {
    it.each([
      [envelopeError(403, "PERMISSION_DENIED"), "Tu rol no permite esta acción.", false],
      [envelopeError(409, "PROPOSAL_SUPERSEDED"), "La propuesta cambió, vuelve a cargar la bandeja.", true],
      [envelopeError(409, "PROPOSAL_HASH_MISMATCH"), "La propuesta cambió, vuelve a cargar la bandeja.", true],
      [envelopeError(409, "PROPOSAL_NOT_PENDING", "x", { status: "executed" }), "Alguien ya resolvió esta propuesta. Vuelve a cargar la bandeja.", true],
      [envelopeError(410, "PROPOSAL_EXPIRED"), "La propuesta venció. Vuelve a cargar la bandeja.", true],
      [envelopeError(401, "AUTHENTICATION_REQUIRED"), "Elige una persona del equipo para continuar.", false],
      [envelopeError(429, "RATE_LIMITED"), "Demasiadas solicitudes seguidas. Espera un momento y vuelve a intentar.", false],
    ])("maps %j", (error, message, reload) => {
      expect(api.describeApprovalError(error)).toEqual({ message, reload });
    });

    it("explains a disabled agent by reason", () => {
      expect(api.describeApprovalError(envelopeError(409, "AGENT_DISABLED", "x", { agent_key: "cobranza", reason: "disabled" })).message)
        .toBe("El agente de Cobranza está apagado en esta clínica.");
      expect(api.describeApprovalError(envelopeError(409, "AGENT_DISABLED", "x", { agent_key: "backfill", reason: "not_provisioned" })).message)
        .toBe("El agente de Cupos liberados no está habilitado en esta clínica.");
    });

    it("keeps the backend message for anything else", () => {
      expect(api.describeApprovalError(envelopeError(422, "INVALID_INPUT", "The appointment proposal is no longer confirmable."))).toEqual({
        message: "The appointment proposal is no longer confirmable.",
        reload: false,
      });
    });
  });

  describe("Ejecutar ahora", () => {
    it("runs Cobranza with exactly {agent_key} and reports the counts", async () => {
      mockPost.mockResolvedValue({
        data: { id: 3, agent_key: "cobranza", trigger: "manual", status: "completed", triggered_by_principal_id: 2, counts: { candidates: 9, proposed: 5, deduped: 3, skipped: 1 }, error_category: null, started_at: "x", finished_at: "y" },
        headers: {},
      });
      const key = api.newIdempotencyKey();
      const result = await api.runAgentNow("cobranza", key);
      expect(mockPost.mock.calls[0]).toEqual(["/agent-runs", { agent_key: "cobranza" }, { headers: { "Idempotency-Key": key } }]);
      expect(result).toEqual({
        agent: "cobranza",
        status: "completed",
        lines: ["9 cargos revisados", "5 propuestas nuevas", "3 ya estaban propuestas", "1 omitido"],
        replayed: false,
        disabled: false,
      });
    });

    it("Confirmaciones counts queued reminders", async () => {
      mockPost.mockResolvedValue({ data: { id: 4, agent_key: "confirmaciones", trigger: "manual", status: "completed", triggered_by_principal_id: 2, counts: { candidates: 2, proposed: 1, deduped: 0, skipped: 1 }, error_category: null, started_at: "x", finished_at: "y" }, headers: {} });
      const result = await api.runAgentNow("confirmaciones", api.newIdempotencyKey());
      expect(result.lines).toEqual(["2 citas de mañana revisadas", "1 recordatorio en cola", "0 ya estaban en cola", "1 omitido"]);
    });

    it("runs the Backfill tick through run-due", async () => {
      mockPost.mockResolvedValue({ data: { enqueued: 1, claimed: 1, done: 1, failed: 0, dead: 0, lost: 0, disabled_agents: [], jobs: [] } });
      const key = api.newIdempotencyKey();
      const result = await api.runAgentNow("backfill", key);
      expect(mockPost.mock.calls[0]).toEqual(["/agent-runs/jobs/run-due", {}, { headers: { "Idempotency-Key": key } }]);
      expect(result.lines).toEqual(["1 cancelación nueva detectada", "1 revisada"]);
      expect(result.disabled).toBe(false);
    });

    it("reports a switched-off Backfill agent", async () => {
      mockPost.mockResolvedValue({ data: { enqueued: 2, claimed: 0, done: 0, failed: 0, dead: 0, lost: 0, disabled_agents: ["backfill"], jobs: [] } });
      const result = await api.runAgentNow("backfill", api.newIdempotencyKey());
      expect(result.disabled).toBe(true);
    });
  });

  describe("who is signed in", () => {
    const meRead = {
      principal: { id: 2, type: "human", display_name: "Lucía Ramos" },
      organization: { id: 1, name: "ODONTO SMART" },
      roles: [{ code: "staff-secretaria", name: "Secretaria" }],
      permissions: ["appointments.read", "charges.read", "deliveries.create", "patients.read", "proposals.decide", "proposals.read", "waitlist.read"],
    };

    it("maps GET /me", async () => {
      mockGet.mockResolvedValue({ data: meRead });
      const identity = await api.loadIdentity();
      expect(mockGet).toHaveBeenCalledWith("/me");
      expect(identity).toEqual({
        principalType: "human",
        displayName: "Lucía Ramos",
        organizationName: "ODONTO SMART",
        roles: ["Secretaria"],
        permissions: meRead.permissions,
      });
    });

    it("decides runnable agents and visible modules from permissions only", async () => {
      mockGet.mockResolvedValue({ data: meRead });
      const identity = await api.loadIdentity();
      expect(api.canRunAgent(identity, "cobranza")).toBe(true);
      expect(api.canRunAgent(identity, "confirmaciones")).toBe(true);
      expect(api.canRunAgent(identity, "backfill")).toBe(true);
      expect(api.canRunAgent(identity, "inventario")).toBe(false);
      expect(api.canOpen(identity, "/aprobaciones")).toBe(true);
      expect(api.canOpen(identity, "/inventario")).toBe(false);
      expect(api.canOpen(identity, "/home")).toBe(true);
      expect(api.canOpen(null, "/caja")).toBe(false);
    });

    it("machine callers need proposals.create and never run Confirmaciones", () => {
      const integration = { principalType: "integration", displayName: "x", organizationName: "y", roles: [], permissions: ["proposals.create", "charges.read", "appointments.read", "deliveries.create"] };
      expect(api.canRunAgent(integration, "cobranza")).toBe(true);
      expect(api.canRunAgent(integration, "confirmaciones")).toBe(false);
    });
  });

  describe("persona session", () => {
    it("reads and switches the persona through /api/session", async () => {
      const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => Response.json({
        personas: [{ key: "secretaria", display_name: "Lucía Ramos", role: "secretaria" }],
        current: init?.method === "POST" ? "secretaria" : null,
      }));
      vi.stubGlobal("fetch", fetchMock);
      try {
        expect(await api.loadPersonas()).toEqual({ personas: [{ key: "secretaria", displayName: "Lucía Ramos", role: "secretaria" }], current: null });
        expect((await api.choosePersona("secretaria")).current).toBe("secretaria");
        const [url, init] = fetchMock.mock.calls[1]!;
        expect(url).toBe("/api/session");
        expect(init).toMatchObject({ method: "POST", body: JSON.stringify({ persona: "secretaria" }) });
        expect(new Headers(init!.headers).get("content-type")).toBe("application/json");
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("surfaces a refused switch through the error envelope", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { code: "PERSONA_UNKNOWN", message: "Esa persona no está configurada en este servidor.", details: {} } }, { status: 400 })));
      try {
        await expect(api.choosePersona("gerente")).rejects.toMatchObject({ code: "PERSONA_UNKNOWN", httpStatus: 400 });
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});
