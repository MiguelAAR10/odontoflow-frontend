import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createElement } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovalItem } from "../src/types";

const stubs = vi.hoisted(() => ({ load: vi.fn(), decide: vi.fn(), begin: vi.fn() }));
vi.mock("../src/api", () => ({
  useMocks: false, loadInbox: stubs.load, decideInboxItem: stubs.decide, beginDecision: stubs.begin,
  canRunAgent: () => false, RUNNABLE_AGENTS: [], newIdempotencyKey: () => "key",
  runAgentNow: vi.fn(), describeApprovalError: (error: Error) => ({ message: error.message, reload: false }),
}));
vi.mock("../src/components/PersonaContext", () => ({ usePersona: () => ({ identity: { principalType: "human", permissions: [] }, loading: false, version: 1 }) }));
const item: ApprovalItem = {
  key: "agent_proposal:7", source: "agent_proposal", id: 7, kind: "collection_reminder", category: "cobranza", categoryLabel: "Cobranza", agentLabel: "Cobranza",
  status: "pending", headline: "Recordar el pago", detail: "Debe S/ 180", facts: [], message: "Hola Ana", locationName: "Lince",
  expiresAt: "2027-01-01T00:00:00Z", createdAt: "2026-10-13T00:00:00Z", actions: ["approve", "decline"], payloadHash: "a".repeat(64), conversationId: 12, confirmationToken: null, decidedBy: null, outcome: null, errorCode: null,
};
let Page: typeof import("../src/views/ApprovalsPage").ApprovalsPage;
beforeAll(async () => { process.env.NEXT_PUBLIC_USE_MOCKS = "false"; Page = (await import("../src/views/ApprovalsPage")).ApprovalsPage; });
beforeEach(() => { stubs.load.mockReset(); stubs.decide.mockReset(); stubs.begin.mockReset(); });
const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());
const button = (renderer: ReactTestRenderer, label: string) => renderer.root.findAllByType("button").find(node => node.children.join("") === label)!;
async function render(rows: ApprovalItem[]) {
  stubs.load.mockResolvedValue({ items: rows, nextCursor: null });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(createElement(Page)); });
  return renderer;
}

describe("Bandeja real uses existing transport", () => {
  it("rejects construction of the fixture authority when mocks are disabled", async () => {
    const { createDraftInbox } = await import("../src/approvals");
    expect(() => createDraftInbox([])).toThrow("desactivado");
  });
  it("never loads p-* fixture cards and retries a failure with the same intent", async () => {
    const intent = { decision: "approve", idempotencyKey: "same-key" };
    stubs.begin.mockReturnValue(intent);
    stubs.decide.mockRejectedValueOnce(new Error("Conexión interrumpida"))
      .mockResolvedValueOnce({ item: { ...item, status: "executed" }, replayed: false });
    const renderer = await render([item]);
    expect(text(renderer)).not.toContain("Daniela");
    await act(async () => { await button(renderer, "Aprobar").props.onClick(); });
    expect(text(renderer)).toContain("Conexión interrumpida");
    // Card's latch releases on failure; its primary action remains retryable.
    expect(button(renderer, "Aprobar").props.disabled).toBe(false);
    await act(async () => { await button(renderer, "Aprobar").props.onClick(); });
    expect(stubs.begin).toHaveBeenCalledTimes(1);
    expect(stubs.decide.mock.calls.map(call => call[1])).toEqual([intent, intent]);
    expect(text(renderer)).toContain("Aprobada y ejecutada");
    await act(async () => renderer.unmount());
  });
  it("shows backend status without falsely claiming a human stopped an approved run", async () => {
    const renderer = await render([{ ...item, status: "approved", actions: [] }]);
    expect(text(renderer)).toContain("Aprobada");
    expect(text(renderer)).not.toContain("Detenido por ti");
    expect(text(renderer)).not.toContain("catalog-stamp");
    await act(async () => renderer.unmount());
  });
  it("filters Mías using available backend actions without inventing assignees", async () => {
    const renderer = await render([item, { ...item, id: 8, key: "agent_proposal:8", headline: "Sin permiso", actions: [] }]);
    const mine = renderer.root.findAllByType("button").find(node => node.children[0] === "Mías ")!;
    await act(async () => mine.props.onClick());
    expect(text(renderer)).not.toContain("Sin permiso");
    expect(text(renderer)).toContain("Recordar el pago");
    await act(async () => renderer.unmount());
  });
});
