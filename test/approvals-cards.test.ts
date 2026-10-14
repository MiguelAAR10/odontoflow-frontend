import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { ApprovalItem } from "../src/types";
import type { Card } from "../src/agui/card";

let api: typeof import("../src/approvals");
beforeAll(async () => { process.env.NEXT_PUBLIC_USE_MOCKS = "true"; api = await import("../src/approvals"); });
const proposals = JSON.parse(readFileSync(new URL("../src/agui/sim/fixtures/proposals.json", import.meta.url), "utf8")) as Card[];
const item: ApprovalItem = {
  key: "agent_proposal:7", source: "agent_proposal", id: 7, kind: "collection_reminder", category: "cobranza", categoryLabel: "Cobranza", agentLabel: "Cobranza",
  status: "pending", headline: "Recordar el pago", detail: "Debe S/ 180", facts: [{ label: "Saldo", value: "S/ 180" }], message: "Hola <Ana>", locationName: "Lince",
  expiresAt: "2027-01-01T00:00:00Z", createdAt: "2026-10-13T00:00:00Z", actions: ["approve", "decline"], payloadHash: "a".repeat(64), conversationId: 12, confirmationToken: null, decidedBy: null, outcome: null, errorCode: null,
};

describe("Bandeja Card", () => {
  it("maps real data without inventing evidence, amounts or reversibility", () => {
    const card = api.toCard(item);
    expect(card).toMatchObject({ id: item.key, agent: "pasta", why: item.detail, approve: "Aprobar", alt: "Declinar" });
    expect(card.scope).toContainEqual({ label: "Saldo", value: "S/ 180" });
    expect(card.srcs).toEqual([]);
    expect(card.body).toContain("Hola &lt;Ana&gt;");
    expect(card.amounts).toBeUndefined();
    expect(card.reversible).toBeUndefined();
    expect(item.payloadHash).toBe("a".repeat(64));
  });
  it("keeps appointment IDs distinct and honors grants", () => {
    const card = api.toCard({ ...item, source: "appointment_proposal", key: "appointment_proposal:7", category: "cita", actions: [] });
    expect(card.id).not.toBe(api.toCard(item).id);
    expect(card.agent).toBe("cepillo");
    expect(card.approve).toBeNull();
  });
  it("does not claim failed/expired/superseded/approved-in-progress items are executed", () => {
    for (const status of ["failed", "expired", "superseded", "approved"] as const) {
      expect(api.toCard({ ...item, status }).state).toBe("ready");
    }
    expect(api.toCard({ ...item, status: "executed" }).state).toBe("approved");
  });
  it("loads exactly the five unchanged official proposal DTOs", () => {
    const inbox = api.createDraftInbox(proposals);
    expect(inbox.list().map(row => row.card)).toEqual(proposals);
    expect(inbox.list().every(row => row.envelope.version === 1)).toBe(true);
  });
  it("edits create a new version/hash, reject stale intents and preserve financial evidence", () => {
    const inbox = api.createDraftInbox(proposals);
    const draft = inbox.list().find(row => row.card.level === "borrador")!;
    const next = inbox.edit(draft.envelope, "Revisar los dos movimientos con Caja");
    expect(next.envelope.version).toBe(2);
    expect(next.envelope.payload_hash).not.toBe(draft.envelope.payload_hash);
    expect(next.card.version).toBe(2);
    expect(next.card.payload_hash).toBe(next.envelope.payload_hash);
    expect(next.card.amounts).toEqual(draft.card.amounts);
    expect(next.card.scope).toEqual(draft.card.scope);
    expect(() => inbox.decide(draft.envelope, "approve", "old-key")).toThrow("cambió");
    expect(inbox.decide(next.envelope, "approve", "new-key").card.state).toBe("approved");
  });
  it("requires nonempty edits and only edits pending drafts", () => {
    const inbox = api.createDraftInbox(proposals);
    expect(() => inbox.edit(inbox.list()[0]!.envelope, "Otro texto")).toThrow("borrador");
    const draft = inbox.list()[1]!;
    expect(() => inbox.edit(draft.envelope, " ")).toThrow("texto");
    inbox.decide(draft.envelope, "decline", "decline-key");
    expect(() => inbox.edit(draft.envelope, "Otro texto")).toThrow();
  });
  it("replays an intent but rejects double decisions and reused keys", () => {
    const inbox = api.createDraftInbox(proposals);
    const first = inbox.list()[0]!;
    const settled = inbox.decide(first.envelope, "approve", "key");
    expect(inbox.decide(first.envelope, "approve", "key")).toEqual(settled);
    expect(() => inbox.decide(first.envelope, "approve", "new-key")).toThrow();
    expect(() => inbox.decide(inbox.list()[1]!.envelope, "approve", "key")).toThrow();
    expect(() => inbox.decide(first.envelope, "decline", "key")).toThrow();
  });
  it("returns isolated copies so clients cannot mutate proposal authority", () => {
    const inbox = api.createDraftInbox(proposals);
    inbox.list()[0]!.card.title = "mutated";
    expect(inbox.list()[0]!.card.title).toBe(proposals[0]!.title);
  });
});
