import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
const transport = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("axios", () => ({ default: { create: () => transport, isAxiosError: (error: unknown) => Boolean((error as { isAxiosError?: boolean })?.isAxiosError) } }));
describe("v10 real transport contracts", () => {
  let api: typeof import("../src/api");
  beforeAll(async () => { vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false"); api = await import("../src/api"); });
  afterAll(() => vi.unstubAllEnvs());
  beforeEach(() => { transport.get.mockReset(); transport.post.mockReset(); });
  it("reads exact legacy state only through the explicit global record adapter", async () => {
    const item = { id: 91, source: "agent_proposal", status: "failed" };
    transport.get.mockResolvedValue({ data: item });
    expect(await api.loadProposalRecord(91)).toEqual(item);
    expect(transport.get.mock.calls).toEqual([["/agent/proposals/91"]]);
    transport.get.mockResolvedValue({ data: { ...item, id: 92 } });
    await expect(api.loadProposalRecord(91)).rejects.toMatchObject({ code: "PROPOSAL_CHANGED" });
  });
  it("reads the exact scoped card without consulting the legacy inbox", async () => {
    const card = { id: "91", proposal_id: 91, version: 1, payload_hash: "a".repeat(64), agent: "airi", level: "aprobar", state: "pending", title: "Conteo canónico", body: "Del backend" };
    transport.get.mockResolvedValue({ data: card });
    expect(await api.loadProposalCard(91)).toEqual(card);
    expect(transport.get.mock.calls).toEqual([["/agent/cards/91"]]);
    transport.get.mockResolvedValue({ data: { ...card, id: "92", proposal_id: 92 } });
    await expect(api.loadProposalCard(91)).rejects.toMatchObject({ code: "PROPOSAL_CHANGED" });
  });
  it("retains scoped-card errors and reads a fresh result on retry", async () => {
    const denied = { isAxiosError: true, response: { status: 403, data: { error: { code: "PERMISSION_DENIED", message: "Sin acceso", details: {} } } } };
    transport.get.mockRejectedValueOnce(denied).mockResolvedValueOnce({ data: { id: "91", proposal_id: 91, version: 2, payload_hash: "a".repeat(64), agent: "airi", level: "aprobar", state: "approved", title: "Conteo canónico", body: "Del backend", result: "Movimiento #72" } });
    await expect(api.loadProposalCard(91)).rejects.toBe(denied);
    expect(await api.loadProposalCard(91)).toMatchObject({ result: "Movimiento #72" });
    expect(transport.get.mock.calls).toEqual([["/agent/cards/91"], ["/agent/cards/91"]]);
  });
  it("translates a wire error by code and reason while retaining its envelope", () => {
    const wire = { isAxiosError: true, response: { status: 422, data: { error: { code: "INVALID_INPUT", message: "Unit mismatch", details: { reason: "unit_mismatch", expected_unit: "unidad" } } } } };
    expect(api.toApiError(wire)).toMatchObject({ httpStatus: 422, code: "INVALID_INPUT", message: "La unidad no coincide con el catálogo. Vuelve a consultar el producto.", details: { reason: "unit_mismatch", expected_unit: "unidad" } });
  });
  it("loads exact conversation context, not a contact search", async () => {
    const context = { conversation: { id: 7 }, patient: null, lead: null };
    transport.get.mockResolvedValue({ data: context });
    expect(await api.loadConversationContext(7)).toEqual(context);
    expect(transport.get.mock.calls).toEqual([["/conversations/7/context"]]);
  });
  it("uses only staff reply/resume routes and per-intent idempotency", async () => {
    transport.post.mockResolvedValue({ data: { status: "pending" } });
    await api.sendConversationReply(7, { text: "Respuesta" }, "reply-intent");
    await api.returnConversationToAgent(7, "resume-intent");
    expect(transport.post.mock.calls).toEqual([
      ["/conversations/7/reply", { text: "Respuesta" }, { headers: { "Idempotency-Key": "reply-intent" } }],
      ["/conversations/7/resume", {}, { headers: { "Idempotency-Key": "resume-intent" } }],
    ]);
  });
  it("reads count version and proposes the absolute count without adjusting stock", async () => {
    transport.get.mockResolvedValue({ data: { ledger_version: "v1", balance: "8.00" } });
    transport.post.mockResolvedValue({ data: { delta: "-3.00" } });
    await api.loadCountContext(3, 2);
    const input = { product_id: 3, location_id: 2, counted_quantity: "5", unit: "caja", reason: "Conteo físico", expected_ledger_version: "v1" };
    expect(await api.proposeInventoryCount(input, "count-intent")).toEqual({ delta: "-3.00" });
    expect(transport.get).toHaveBeenCalledWith("/inventory/count-context", { params: { product_id: 3, location_id: 2 } });
    expect(transport.post.mock.calls).toEqual([["/inventory/counts", input, { headers: { "Idempotency-Key": "count-intent" } }]]);
  });
  it("keeps authorization failures as errors, never demo fallback", async () => {
    const denied = { isAxiosError: true, response: { status: 403, data: { error: { code: "PERMISSION_DENIED", message: "Sin acceso", details: {} } } } };
    transport.get.mockRejectedValue(denied);
    await expect(api.loadConversationContext(7)).rejects.toBe(denied);
    await expect(api.loadCountContext(3, 2)).rejects.toBe(denied);
    expect(api.toApiError(denied)).toMatchObject({ httpStatus: 403, message: "Sin acceso" });
  });
  it("submits a delegation proposal with canonical context and no clinical practitioner mapping", async () => {
    const input = { title: "Revisar preparación", location_id: 2, assignee_principal_id: 45, due_at: "2026-11-01T16:30:00Z", appointment_id: 12, patient_id: 8 };
    transport.post.mockResolvedValue({ data: { source: "agent_proposal", id: 91, kind: "delegation", status: "pending" } });
    expect(await api.proposeTaskDelegation(input, "delegation-intent")).toMatchObject({ status: "pending" });
    expect(transport.post.mock.calls).toEqual([["/tasks/delegations", input, { headers: { "Idempotency-Key": "delegation-intent" } }]]);
  });
  it("reads responsible people by sede, preserving principal ids", async () => {
    transport.get.mockResolvedValue({ data: [{ principal_id: 45, display_name: "Responsable" }] });
    expect(await api.loadTaskAssignees(2)).toEqual([{ principal_id: 45, display_name: "Responsable" }]);
    expect(transport.get).toHaveBeenCalledWith("/tasks/assignees", { params: { location_id: 2 } });
  });
});
