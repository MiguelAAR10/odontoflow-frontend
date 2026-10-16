import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const transport = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("axios", () => ({ default: { create: () => transport, isAxiosError: () => false } }));
describe("honest visual demo boundary", () => {
  let api: typeof import("../src/api");
  beforeAll(async () => { vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "true"); api = await import("../src/api"); });
  afterAll(() => vi.unstubAllEnvs());
  it("does not invent canonical links, assigned staff or tasks", async () => {
    expect(await api.loadConversationContext(7)).toBeNull();
    expect(await api.loadTasks()).toEqual([]);
    expect(await api.loadTaskAssignees(2)).toEqual([]);
    await expect(api.loadProposalCard(91)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(api.loadProposalRecord(91)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(transport.get).not.toHaveBeenCalled();
  });
  it("declares count and staff mutations unavailable instead of fabricating success", async () => {
    await expect(api.loadCountContext(3, 2)).rejects.toMatchObject({ code: "DEMO_UNAVAILABLE" });
    await expect(api.proposeInventoryCount({ product_id: 3, location_id: 2, counted_quantity: "5", unit: "caja", reason: "Conteo", expected_ledger_version: "v" }, "intent")).rejects.toMatchObject({ code: "DEMO_UNAVAILABLE" });
    await expect(api.proposeTaskDelegation({ title: "Preparar", location_id: 2, assignee_principal_id: 45, due_at: "2026-11-01T15:00:00Z" }, "intent")).rejects.toMatchObject({ code: "DEMO_UNAVAILABLE" });
    await expect(api.acceptTask(8, "intent")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(transport.post).not.toHaveBeenCalled();
  });
});
