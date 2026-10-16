import { cardFixture } from "./proposal-card.fixture";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InventoryCountDraft } from "../src/views/InventoryCountDraft";
import type { CountContext, InventoryCountReceipt } from "../src/contracts/client";
const model = vi.hoisted(() => ({ load: vi.fn(), propose: vi.fn(), key: vi.fn(), card: vi.fn(), record: vi.fn(), version: 1, identity: { principalType: "human", permissions: ["movements.read", "proposals.read"] } }));
vi.mock("../src/api", () => ({ loadProposalCard: model.card, loadProposalRecord: model.record, loadCountContext: model.load, proposeInventoryCount: model.propose, newIdempotencyKey: model.key, toApiError: (error: Error) => error }));
vi.mock("../src/components/PersonaContext", () => ({ usePersona: () => model }));
vi.mock("next/link", () => ({ default: "a" }));
const context: CountContext = { product: { id: 3, name: "Guantes", unit: "caja" }, location: { id: 2, name: "Sede real" }, balance: "8.00", ledger_version: "ledger-v1", open_count_proposal_id: null };
const result: InventoryCountReceipt = {
  created: true, product: context.product, location: context.location, balance_before: "8.00", counted_quantity: "5.00", delta: "-3.00", ledger_version: "ledger-v1",
  proposal: {
    id: 91, source: "agent_proposal", kind: "inventory_count", agent_key: "airi", status: "pending", location_id: 2,
    summary: "Conteo de Guantes", reason: "Cierre físico", facts: null, evidence: null,
    payload: { product_id: 3, location_id: 2, counted_quantity: "5.00", unit: "caja", reason: "Cierre físico", expected_ledger_version: "ledger-v1" },
    payload_hash: "a".repeat(64), subject: { type: "product_location", id: "3:2" }, conversation_id: null, confirmation_token: null,
    created_at: "2026-10-16T17:00:00Z", expires_at: "2026-10-17T17:00:00Z", decided_by: null, result_ref: null, error_code: null, actions: ["approve", "decline"],
  },
};
let view: ReactTestRenderer;
const content = () => JSON.stringify(view.toJSON());
const mount = async () => { await act(async () => { view = create(<InventoryCountDraft productId={3} locationId={2} />); }); };
const fill = () => act(() => { view.root.findByType("input").props.onChange({ target: { value: "5" } }); view.root.findByType("textarea").props.onChange({ target: { value: "Cierre físico" } }); });
const submit = async () => { await act(async () => { view.root.findByType("form").props.onSubmit({ preventDefault() {} }); }); };
beforeEach(() => { model.version = 1; model.identity.permissions = ["movements.read", "proposals.read"]; model.card.mockReset().mockResolvedValue(cardFixture(91)); model.record.mockReset().mockResolvedValue(result.proposal); model.load.mockReset().mockResolvedValue(context); model.propose.mockReset().mockResolvedValue(result); model.key.mockReset().mockReturnValue("same-intent"); });
afterEach(() => { if (view) act(() => view.unmount()); });
describe("guided physical count", () => {
  it("lets a sede-authorized human report and retry without an org-wide grant", async () => {
    model.identity.permissions = [];
    model.propose.mockRejectedValueOnce(new Error("Respuesta perdida")).mockResolvedValueOnce({ ...result, proposal: { ...result.proposal, actions: [] } });
    await mount(); fill(); await submit(); await submit();
    expect(model.propose.mock.calls[0]).toEqual(model.propose.mock.calls[1]);
    expect(model.card).toHaveBeenCalledWith(91);
    expect(content()).toContain("Contenido del backend");
    expect(view.root.findAllByType("a")).toHaveLength(0);
    expect(model.record).not.toHaveBeenCalled();
    expect(view.root.findAllByType("button").map(button => button.children.join(""))).not.toContain("Aprobar");
  });
  it("opens an existing count through its scoped card and retries a failed refresh", async () => {
    model.identity.permissions = [];
    model.load.mockResolvedValue({ ...context, open_count_proposal_id: 91 });
    model.card.mockRejectedValueOnce(new Error("Sin conexión")).mockResolvedValueOnce({ ...cardFixture(91), state: "approved", result: "Movimiento de inventario #72" });
    await mount();
    expect(content()).toContain("Reintentar tarjeta");
    await act(async () => { view.root.findAllByType("button").find(button => button.children.join("") === "Reintentar tarjeta")!.props.onClick(); });
    expect(model.card.mock.calls).toEqual([[91], [91]]);
    expect(content()).toContain("Movimiento de inventario #72");
    expect(view.root.findAllByType("a")).toHaveLength(0);
    expect(model.record).not.toHaveBeenCalled();
    expect(model.propose).not.toHaveBeenCalled();
  });
  it("discards a late report and clears its intent when identity changes", async () => {
    let resolve!: (value: InventoryCountReceipt) => void;
    model.propose.mockReturnValueOnce(new Promise<InventoryCountReceipt>(yes => { resolve = yes; }));
    await mount(); fill();
    act(() => { void view.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
    model.version++;
    await act(async () => { view.update(<InventoryCountDraft productId={3} locationId={2} />); });
    await act(async () => resolve(result));
    expect(content()).not.toContain("Estado al recibir el reporte");
    expect(view.root.findByType("input").props.value).toBe("");
    fill(); await submit();
    expect(model.key).toHaveBeenCalledTimes(2);
  });
  it("sends absolute quantity, catalog unit and ledger version, then links to human approval", async () => {
    await mount(); fill(); await submit();
    expect(model.propose).toHaveBeenCalledWith({ product_id: 3, location_id: 2, counted_quantity: "5", unit: "caja", reason: "Cierre físico", expected_ledger_version: "ledger-v1" }, "same-intent");
    expect(content()).toContain("Pendiente de aprobación humana");
    expect(content()).toContain("Reportar un conteo por sí solo no aplica movimientos");
    expect(content()).toContain("-3.00");
    expect(view.root.findByType("a").props.href).toBe("/aprobaciones?proposal=agent_proposal%3A91&status=pending");
  });
  it("does not calculate a delta before the backend responds and reuses the intent after a network error", async () => {
    model.propose.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(result);
    await mount(); fill();
    expect(content()).not.toContain("-3.00");
    await submit(); expect(content()).toContain("Offline"); await submit();
    expect(model.key).toHaveBeenCalledTimes(1);
    expect(model.propose.mock.calls[0]).toEqual(model.propose.mock.calls[1]);
  });
  it("shows an executed proposal returned after a lost response without claiming unchanged stock", async () => {
    model.record.mockResolvedValue({ ...result.proposal, status: "executed", result_ref: { type: "inventory_movement", id: 72 } });
    model.propose.mockRejectedValueOnce(new Error("Respuesta perdida")).mockResolvedValueOnce({ ...result, proposal: { ...result.proposal, status: "executed", result_ref: { type: "inventory_movement", id: 72 } } });
    await mount(); fill(); await submit(); await submit();
    expect(content()).toContain("Aplicada");
    expect(content()).not.toContain("stock sin modificar");
    expect(content()).not.toContain("Propuesta preparada");
    expect(content()).toContain("Ver resultado de la propuesta en Bandeja");
    expect(view.root.findByType("a").props.href).toBe("/aprobaciones?proposal=agent_proposal%3A91&status=executed");
    expect(model.propose.mock.calls[0]).toEqual(model.propose.mock.calls[1]);
  });
  it("requires a fresh balance after a ledger conflict", async () => {
    model.propose.mockRejectedValue(Object.assign(new Error("El saldo cambió"), { code: "INVENTORY_LEDGER_STALE" }));
    await mount(); fill(); await submit();
    expect(view.root.findAllByType("button").find(button => button.props.type === "submit")?.props.disabled).toBe(true);
    expect(content()).toContain("Volver a consultar saldo");
  });
});
