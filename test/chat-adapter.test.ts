/** FE3 Chat — real-mode adapter and transport at the axios boundary. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationSummary, HandoffRead, StaffMessageRead } from "../src/contracts/client";

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }));

vi.mock("axios", () => ({
  default: {
    create: () => ({ get: mockGet, post: mockPost }),
    isAxiosError: (error: unknown) => Boolean((error as { isAxiosError?: boolean })?.isAxiosError),
  },
}));

const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const NOW = new Date("2026-10-02T17:00:00Z"); // 12:00 in Lima

const conversation: ConversationSummary = {
  id: 9,
  status: "open",
  contact_identity_id: 109,
  contact_display_name: "Ana Torres",
  assigned_principal_id: null,
  assigned_display_name: null,
  last_message_at: "2026-10-02T16:42:00Z",
  last_message_preview: { direction: "inbound", text: "Gracias por el aviso, paso a pagar el sábado.", occurred_at: "2026-10-02T16:42:00Z" },
  pending_handoff_id: null,
};

const message = (patch: Partial<StaffMessageRead>): StaffMessageRead => ({
  id: 1,
  direction: "inbound",
  message_type: "text",
  text: "Hola",
  has_media: false,
  content_state: "available",
  delivery_status: "received",
  occurred_at: "2026-10-02T16:00:00Z",
  ...patch,
});

const pendingHandoff: HandoffRead = {
  id: 7,
  conversation_id: 12,
  contact_display_name: "Rosa Quispe",
  reason_code: "complaint",
  reason_summary: "Dice que ya pagó el saldo que se le recordó.",
  status: "pending",
  claimed_by_principal_id: null,
  claimed_by_display_name: null,
  created_at: "2026-10-02T16:48:00Z",
  updated_at: "2026-10-02T16:48:00Z",
};

const envelopeError = (status: number, code: string, details: Record<string, unknown> = {}) =>
  ({ isAxiosError: true, response: { status, data: { error: { code, message: "backend message", details } } } });

describe("Chat real-mode adapter (mocked axios)", () => {
  let api: typeof import("../src/api");

  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false");
    api = await import("../src/api");
  });
  afterAll(() => vi.unstubAllEnvs());
  beforeEach(() => { mockGet.mockReset(); mockPost.mockReset(); });

  describe("the conversation list", () => {
    it("asks for one page by status and keeps the cursor", async () => {
      mockGet.mockResolvedValue({ data: { items: [conversation], next_cursor: "next" } });
      const page = await api.loadConversations({ status: "human_handoff", cursor: "prev" });
      expect(mockGet).toHaveBeenCalledWith("/conversations", { params: { status: "human_handoff", cursor: "prev", limit: 25 } });
      expect(page.nextCursor).toBe("next");
      expect(page.items).toHaveLength(1);
    });

    it("sends no status for 'all' and no empty cursor", async () => {
      mockGet.mockResolvedValue({ data: { items: [], next_cursor: null } });
      await api.loadConversations({});
      expect(mockGet).toHaveBeenCalledWith("/conversations", { params: { limit: 25 } });
    });

    it("reads a row as a name, a status and the last message", () => {
      const row = api.toUiConversation(conversation, NOW);
      expect(row).toMatchObject({
        id: 9,
        name: "Ana Torres",
        initials: "AT",
        maskedPhone: false,
        statusLabel: "Abierta",
        preview: "Gracias por el aviso, paso a pagar el sábado.",
        previewFrom: "patient",
        previewUnavailable: false,
        timeLabel: "11:42",
        assignedTo: null,
        pendingHandoffId: null,
      });
    });

    it("never shows an empty preview: redacted or expired text says so", () => {
      const row = api.toUiConversation({ ...conversation, last_message_preview: { direction: "inbound", text: null, occurred_at: conversation.last_message_at } }, NOW);
      expect(row.preview).toBe("Mensaje no disponible");
      expect(row.previewUnavailable).toBe(true);
      expect(api.toUiConversation({ ...conversation, last_message_preview: null }, NOW).preview).toBe("Sin mensajes todavía");
    });

    it("marks the clinic's own last message and the 80-character cut", () => {
      const long = "x".repeat(80);
      const row = api.toUiConversation({ ...conversation, last_message_preview: { direction: "outbound", text: long, occurred_at: conversation.last_message_at } }, NOW);
      expect(row.previewFrom).toBe("clinic");
      expect(row.preview).toBe(`Clínica: ${long}…`);
    });

    it("keeps a masked phone as the backend sends it", () => {
      const row = api.toUiConversation({ ...conversation, contact_display_name: "+•••••••••123", status: "human_handoff", assigned_display_name: "Lucía Ramos", assigned_principal_id: 2 }, NOW);
      expect(row).toMatchObject({ name: "+•••••••••123", maskedPhone: true, initials: "23", statusLabel: "Derivada", assignedTo: "Lucía Ramos" });
    });

    it("labels older messages by day", () => {
      expect(api.toUiConversation({ ...conversation, last_message_at: "2026-10-01T20:00:00Z" }, NOW).timeLabel).toBe("Ayer");
      expect(api.toUiConversation({ ...conversation, last_message_at: "2026-09-20T20:00:00Z" }, NOW).timeLabel).toBe("20/09");
    });
  });

  describe("a thread", () => {
    it("pages oldest to newest without re-sorting", async () => {
      mockGet.mockResolvedValue({ data: { items: [message({ id: 1 }), message({ id: 2, direction: "outbound", delivery_status: "delivered" })], next_cursor: "c2" } });
      const page = await api.loadThread(9, { cursor: "c1" }, NOW);
      expect(mockGet).toHaveBeenCalledWith("/conversations/9/messages", { params: { cursor: "c1", limit: 50 } });
      expect(page.messages.map((item) => item.id)).toEqual([1, 2]);
      expect(page.nextCursor).toBe("c2");
    });

    it("tells who wrote it and how delivery went", () => {
      expect(api.toUiMessage(message({ direction: "inbound" }), NOW)).toMatchObject({ from: "patient", text: "Hola", unavailable: null, deliveryLabel: null, timeLabel: "11:00", dayLabel: "Hoy" });
      expect(api.toUiMessage(message({ direction: "outbound", delivery_status: "read" }), NOW)).toMatchObject({ from: "clinic", deliveryLabel: "Leído", deliveryFailed: false });
      expect(api.toUiMessage(message({ direction: "outbound", delivery_status: "dead_letter" }), NOW)).toMatchObject({ deliveryLabel: "No se entregó", deliveryFailed: true });
    });

    it("never renders an empty bubble", () => {
      const cases: Array<[Partial<StaffMessageRead>, string, string]> = [
        [{ text: null, content_state: "redacted" }, "redacted", "Mensaje no disponible: se eliminó por privacidad."],
        [{ text: null, content_state: "expired" }, "expired", "Mensaje no disponible: venció su plazo de conservación."],
        [{ text: null, message_type: "audio", has_media: true }, "media", "Nota de voz: no se muestra aquí."],
        [{ text: null, message_type: "image", has_media: true }, "media", "Imagen: no se muestra aquí."],
        [{ text: "   " }, "empty", "Mensaje no disponible."],
      ];
      for (const [patch, reason, label] of cases) {
        const item = api.toUiMessage(message(patch), NOW);
        expect(item).toMatchObject({ text: null, unavailable: reason, unavailableLabel: label });
      }
    });

    it("a redacted state wins even if text came back", () => {
      expect(api.toUiMessage(message({ text: "secreto", content_state: "redacted" }), NOW)).toMatchObject({ text: null, unavailable: "redacted" });
    });
  });

  describe("the handoff queue", () => {
    it("asks for pending by default, oldest first as the backend sends it", async () => {
      const older = { ...pendingHandoff, id: 6, created_at: "2026-10-02T12:00:00Z" };
      mockGet.mockResolvedValue({ data: { items: [older, pendingHandoff], next_cursor: null } });
      const page = await api.loadHandoffs({}, NOW);
      expect(mockGet).toHaveBeenCalledWith("/handoffs", { params: { status: "pending", limit: 25 } });
      expect(page.items.map((item) => item.id)).toEqual([6, 7]);
      expect(page.items[0]).toMatchObject({ reasonLabel: "Reclamo", statusLabel: "Pendiente", waitingLabel: "hace 5 h", claimedBy: null });
      expect(page.items[1]!.waitingLabel).toBe("hace 12 min");
    });

    it("shows the claimant only while claimed", () => {
      const claimed = api.toUiHandoff({ ...pendingHandoff, status: "claimed", claimed_by_principal_id: 2, claimed_by_display_name: "Lucía Ramos" }, NOW);
      expect(claimed).toMatchObject({ statusLabel: "Tomada", claimedBy: "Lucía Ramos", claimedById: 2 });
      const resolved = api.toUiHandoff({ ...pendingHandoff, status: "resolved", claimed_by_principal_id: 2, claimed_by_display_name: "Lucía Ramos" }, NOW);
      expect(resolved).toMatchObject({ statusLabel: "Resuelta", claimedBy: null, claimedById: null });
    });

    it("an unknown reason code still reads", () => {
      expect(api.toUiHandoff({ ...pendingHandoff, reason_code: "something_new" }, NOW).reasonLabel).toBe("Otro motivo");
    });
  });

  describe("taking a handoff", () => {
    it("posts no body with a UUIDv4 key, and a retry of the same intent reuses it", async () => {
      mockPost.mockResolvedValue({ data: { ...pendingHandoff, status: "claimed", claimed_by_principal_id: 2, claimed_by_display_name: "Lucía Ramos" }, headers: {} });
      const intent = api.beginClaim(7);
      expect(intent.idempotencyKey).toMatch(UUID4);
      const first = await api.claimHandoff(intent);
      await api.claimHandoff(intent);
      expect(mockPost).toHaveBeenNthCalledWith(1, "/handoffs/7/claim", null, { headers: { "Idempotency-Key": intent.idempotencyKey } });
      expect(mockPost.mock.calls[1]![2]).toEqual({ headers: { "Idempotency-Key": intent.idempotencyKey } });
      expect(first).toMatchObject({ replayed: false, handoff: { status: "claimed", claimedBy: "Lucía Ramos" } });
      expect(api.beginClaim(7).idempotencyKey).not.toBe(intent.idempotencyKey);
    });

    it("surfaces a replay, which returns the live state", async () => {
      mockPost.mockResolvedValue({ data: { ...pendingHandoff, status: "resolved" }, headers: { "idempotent-replay": "true" } });
      const result = await api.claimHandoff(api.beginClaim(7));
      expect(result).toMatchObject({ replayed: true, handoff: { status: "resolved", claimedBy: null } });
    });

    it("someone else got there first: an actionable 409", async () => {
      mockPost.mockRejectedValue(envelopeError(409, "HANDOFF_NOT_PENDING", { status: "claimed" }));
      const caught = await api.claimHandoff(api.beginClaim(7)).catch((error: unknown) => error);
      expect(api.describeChatError(caught, "tomar")).toEqual({ message: "Otra persona ya tomó esta conversación. Vuelve a cargar la cola para ver quién la atiende.", reload: true });
      expect(api.describeChatError(envelopeError(409, "HANDOFF_NOT_PENDING", { status: "resolved" }), "tomar")).toEqual({ message: "Esta derivación ya se resolvió y la conversación volvió al agente. Vuelve a cargar la cola.", reload: true });
    });

    it("explains permission, session, stale lists and missing rows", () => {
      expect(api.describeChatError(envelopeError(403, "PERMISSION_DENIED"), "tomar").message).toBe("Tu rol no permite tomar conversaciones.");
      expect(api.describeChatError(envelopeError(403, "PERMISSION_DENIED"), "conversaciones").message).toBe("Tu rol no permite ver las conversaciones de la clínica.");
      expect(api.describeChatError(envelopeError(401, "AUTHENTICATION_REQUIRED"), "mensajes").message).toBe("Elige una persona del equipo para continuar.");
      expect(api.describeChatError(envelopeError(422, "INVALID_INPUT"), "conversaciones")).toEqual({ message: "La lista cambió mientras la leías. Vuelve a cargarla.", reload: true });
      expect(api.describeChatError(envelopeError(404, "NOT_FOUND"), "mensajes")).toEqual({ message: "Esta conversación ya no está disponible.", reload: true });
      expect(api.describeChatError(envelopeError(404, "NOT_FOUND"), "tomar")).toEqual({ message: "Esta derivación ya no existe. Vuelve a cargar la cola.", reload: true });
    });
  });

  it("the façade offers no send and no hand-back: neither exists for staff", () => {
    expect("sendMessage" in api).toBe(false);
    expect("getConversations" in api).toBe(false);
    expect(Object.keys(api).some((name) => /resume/i.test(name))).toBe(false);
  });
});
