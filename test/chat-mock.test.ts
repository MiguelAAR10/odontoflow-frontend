/** FE3 Chat — mock mode serves contract shapes and mirrors the backend rules. */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("Chat mock mode", () => {
  let api: typeof import("../src/api");
  let mocks: typeof import("../src/mockData");

  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "true");
    api = await import("../src/api");
    mocks = await import("../src/mockData");
  });
  beforeEach(async () => { await api.choosePersona("secretaria"); });

  const failure = (promise: Promise<unknown>) => promise.then(() => { throw new Error("expected a rejection"); }, (caught) => api.toApiError(caught));

  it("lists conversations by recency, newest first", async () => {
    const { items, nextCursor } = await api.loadConversations({});
    const times = items.map((item) => item.lastMessageAt);
    expect(times).toEqual([...times].sort().reverse());
    expect(items[0]!.name).toBe("Rosa Quispe");
    expect(nextCursor).toBeNull();
    expect(items.find((item) => item.maskedPhone)?.name).toBe("+•••••••••123");
  });

  it("filters by status like the backend", async () => {
    const { items } = await api.loadConversations({ status: "human_handoff" });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.status === "human_handoff")).toBe(true);
  });

  it("pages with a keyset cursor: no row twice, none skipped", async () => {
    const seen: number[] = [];
    let cursor: string | null = null;
    do {
      const page: Awaited<ReturnType<typeof api.loadConversations>> = await api.loadConversations({ cursor, limit: 3 });
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBe(mocks.mockConversations.length);
    await expect(failure(api.loadConversations({ cursor: "not-a-cursor" }))).resolves.toMatchObject({ httpStatus: 422, code: "INVALID_INPUT" });
  });

  it("reads a thread oldest to newest, with the agent's approved messages and unavailable states", async () => {
    const ana = await api.loadThread(9);
    const times = ana.messages.map((item) => item.occurredAt);
    expect(times).toEqual([...times].sort());
    expect(ana.messages.some((item) => item.from === "clinic" && item.text?.includes("saldo pendiente de S/ 60.00"))).toBe(true);

    const urgent = await api.loadThread(17);
    const unavailable = urgent.messages.filter((item) => item.unavailable);
    expect(unavailable.map((item) => item.unavailable).sort()).toEqual(["expired", "media", "redacted"]);
    expect(urgent.messages.every((item) => item.text !== null || item.unavailableLabel)).toBe(true);
  });

  it("pages a thread forward and answers 404 for an unknown conversation", async () => {
    const first = await api.loadThread(17, { limit: 4 });
    expect(first.messages).toHaveLength(4);
    const rest = await api.loadThread(17, { cursor: first.nextCursor, limit: 4 });
    expect(rest.messages[0]!.occurredAt >= first.messages[3]!.occurredAt).toBe(true);
    expect(new Set([...first.messages, ...rest.messages].map((item) => item.id)).size).toBe(mocks.mockConversationMessages[17]!.length);
    await expect(failure(api.loadThread(999))).resolves.toMatchObject({ httpStatus: 404, code: "NOT_FOUND" });
  });

  it("queues pending handoffs oldest first", async () => {
    const { items } = await api.loadHandoffs({});
    expect(items.every((item) => item.status === "pending")).toBe(true);
    const created = items.map((item) => item.createdAt);
    expect(created).toEqual([...created].sort());
    const claimed = await api.loadHandoffs({ status: "claimed" });
    expect(claimed.items[0]).toMatchObject({ claimedBy: "Lucía Ramos" });
  });

  it("a secretaria takes a handoff; the same intent replays; the chat shows who has it", async () => {
    const intent = api.beginClaim(8);
    const first = await api.claimHandoff(intent);
    expect(first).toMatchObject({ replayed: false, handoff: { id: 8, status: "claimed", claimedBy: "Lucía Ramos" } });
    const replay = await api.claimHandoff(intent);
    expect(replay).toMatchObject({ replayed: true, handoff: { status: "claimed", claimedBy: "Lucía Ramos" } });
    // Taking it again with a fresh intent is idempotent for the same person.
    expect(await api.claimHandoff(api.beginClaim(8))).toMatchObject({ replayed: false, handoff: { status: "claimed" } });

    const conversation = (await api.loadConversations({})).items.find((item) => item.id === 22)!;
    expect(conversation).toMatchObject({ assignedTo: "Lucía Ramos", pendingHandoffId: null });
    expect(mocks.mockActivityItems.some((row) => row.action === "reception_handoff.claimed" && row.entity_id === "8" && row.actor_display_name === "Lucía Ramos")).toBe(true);
  });

  it("someone else's or a resolved handoff is 409 HANDOFF_NOT_PENDING", async () => {
    await api.choosePersona("administrador");
    const taken = await failure(api.claimHandoff(api.beginClaim(6)));
    expect(taken).toMatchObject({ httpStatus: 409, code: "HANDOFF_NOT_PENDING", details: { status: "claimed" } });
    expect(api.describeChatError(taken, "tomar").reload).toBe(true);
    const resolved = await failure(api.claimHandoff(api.beginClaim(3)));
    expect(resolved).toMatchObject({ httpStatus: 409, details: { status: "resolved" } });
    await expect(failure(api.claimHandoff(api.beginClaim(404)))).resolves.toMatchObject({ httpStatus: 404 });
  });

  it("one key cannot claim two handoffs", async () => {
    const intent = api.beginClaim(7);
    await api.claimHandoff(intent);
    const reused = await failure(api.claimHandoff({ ...intent, handoffId: 8 }));
    expect(reused).toMatchObject({ httpStatus: 409, code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("without a persona the reads answer 401", async () => {
    await api.choosePersona(null);
    await expect(failure(api.loadConversations({}))).resolves.toMatchObject({ httpStatus: 401 });
    await expect(failure(api.loadHandoffs({}))).resolves.toMatchObject({ httpStatus: 401 });
  });

  it("the chat menu entry and the claim follow /me permissions", async () => {
    const identity = await api.loadIdentity();
    expect(api.canOpen(identity, "/chat")).toBe(true);
    expect(api.canClaimHandoffs(identity)).toBe(true);
    const withoutResume = { ...identity, permissions: identity.permissions.filter((code) => code !== "conversations.resume") };
    expect(api.canClaimHandoffs(withoutResume)).toBe(false);
    const withoutRead = { ...identity, permissions: identity.permissions.filter((code) => code !== "conversations.read") };
    expect(api.canOpen(withoutRead, "/chat")).toBe(false);
    expect(api.canClaimHandoffs({ ...identity, principalType: "integration" })).toBe(false);
  });
});
