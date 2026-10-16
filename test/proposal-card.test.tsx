import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanonicalProposalCard } from "../src/views/CanonicalProposalCard";
import { cardFixture } from "./proposal-card.fixture";
const model = vi.hoisted(() => ({ load: vi.fn(), record: vi.fn(), version: 1, identity: { permissions: [] as string[] } }));
vi.mock("../src/api", () => ({ loadProposalCard: model.load, loadProposalRecord: model.record, toApiError: (error: Error) => error }));
vi.mock("../src/components/PersonaContext", () => ({ usePersona: () => model }));
vi.mock("next/link", () => ({ default: "a" }));
let view: ReactTestRenderer;
beforeEach(() => { model.version = 1; model.identity.permissions = []; model.load.mockReset(); model.record.mockReset(); });
afterEach(() => { if (view) act(() => view.unmount()); });
describe("sede card read boundary", () => {
  it.each(["approved", "executed", "declined", "failed", "expired", "superseded"])("uses the exact global record status %s in the inbox link", async status => {
    model.identity.permissions = ["proposals.read"];
    model.load.mockResolvedValue({ ...cardFixture(91), state: ["approved", "executed"].includes(status) ? "approved" : "declined" });
    model.record.mockResolvedValue({ id: 91, source: "agent_proposal", status, payload_hash: "a".repeat(64) });
    await act(async () => { view = create(<CanonicalProposalCard proposalId={91} inboxLink />); });
    expect(model.record).toHaveBeenCalledWith(91);
    expect(view.root.findByType("a").props.href).toBe(`/aprobaciones?proposal=agent_proposal%3A91&status=${status}`);
  });
  it("refreshes the exact global state instead of inferring execution from approved", async () => {
    model.identity.permissions = ["proposals.read"];
    model.load.mockResolvedValue({ ...cardFixture(91), state: "approved" });
    model.record.mockResolvedValueOnce({ status: "approved", payload_hash: "a".repeat(64) }).mockResolvedValueOnce({ status: "executed", payload_hash: "a".repeat(64) });
    await act(async () => { view = create(<CanonicalProposalCard proposalId={91} inboxLink />); });
    expect(view.root.findByType("a").props.href).toContain("status=approved");
    await act(async () => { view.root.findByType("button").props.onClick(); });
    expect(view.root.findByType("a").props.href).toContain("status=executed");
  });
  it("keeps a scoped reader on the card route even when an inbox link is requested", async () => {
    model.load.mockResolvedValue(cardFixture(91));
    await act(async () => { view = create(<CanonicalProposalCard proposalId={91} inboxLink />); });
    expect(model.record).not.toHaveBeenCalled();
    expect(view.root.findAllByType("a")).toHaveLength(0);
  });
  it("withholds the link if the global state cannot be read", async () => {
    model.identity.permissions = ["proposals.read"];
    model.load.mockResolvedValue({ ...cardFixture(91), state: "declined" });
    model.record.mockRejectedValue(new Error("Sin acceso a Bandeja"));
    await act(async () => { view = create(<CanonicalProposalCard proposalId={91} inboxLink />); });
    expect(JSON.stringify(view.toJSON())).toContain("Contenido del backend");
    expect(view.root.findAllByType("a")).toHaveLength(0);
  });
  it("never treats presentation action labels as permission to decide", async () => {
    model.load.mockResolvedValue(cardFixture(91));
    await act(async () => { view = create(<CanonicalProposalCard proposalId={91} />); });
    expect(view.root.findAllByType("button").map(button => button.children.join(""))).toEqual(["Actualizar tarjeta"]);
  });
  it("discards an old principal's late card and refetches the same record for the new identity", async () => {
    let resolve!: (value: ReturnType<typeof cardFixture>) => void;
    model.load.mockReturnValueOnce(new Promise(yes => { resolve = yes; }));
    await act(async () => { view = create(<CanonicalProposalCard proposalId={91} />); });
    model.version++;
    model.load.mockRejectedValue(new Error("Sin acceso con esta identidad"));
    await act(async () => { view.update(<CanonicalProposalCard proposalId={91} />); });
    await act(async () => resolve({ ...cardFixture(91), title: "Dato privado anterior" }));
    expect(JSON.stringify(view.toJSON())).not.toContain("Dato privado anterior");
    expect(JSON.stringify(view.toJSON())).toContain("Sin acceso con esta identidad");
  });
});
