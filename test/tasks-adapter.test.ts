import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskOut } from "../src/contracts/client";
import type { StaffIdentity } from "../src/types";
const transport = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("axios", () => ({ default: { create: () => transport, isAxiosError: () => false } }));
export const task: TaskOut = {
  id: 8, title: "Revisar preparación", status: "open", location_id: 2, proposal_id: 20,
  assignee_principal_id: 42, assignee_name: "Profesional autorizado", escalation_principal_id: 43,
  due_at: "2026-10-16T18:00:00-05:00", overdue: false, result_ref: null,
  completed_by_principal_id: null, completed_at: null, escalated_at: null, created_at: null,
  context: { appointment: null, patient: null, restricted: false },
  delivery: { channel: "whatsapp", state: "not_configured", reason: "staff_channel_not_linked" },
};
const identity: StaffIdentity = { principalId: 42, principalType: "human", displayName: "Profesional autorizado", organizationName: "Clínica", roles: [], permissions: [] };

describe("delegated task adapter", () => {
  let api: typeof import("../src/api");
  beforeAll(async () => { vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false"); api = await import("../src/api"); });
  afterAll(() => vi.unstubAllEnvs());
  beforeEach(() => { transport.get.mockReset(); transport.post.mockReset(); });
  it("reads the authorized tasks without assigning a mock physician", async () => {
    transport.get.mockResolvedValue({ data: [task] });
    expect(await api.loadTasks({ location_id: 2, limit: 100 })).toEqual([task]);
    expect(transport.get).toHaveBeenCalledWith("/tasks", { params: { location_id: 2, limit: 100 } });
  });
  it("retries completion with the same intent and never changes a clinical record", async () => {
    const key = api.newIdempotencyKey();
    transport.post.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ data: { ...task, status: "done" } });
    await expect(api.finishTask(8, {}, key)).rejects.toThrow("offline");
    expect(await api.finishTask(8, {}, key)).toMatchObject({ status: "done" });
    expect(transport.post.mock.calls).toEqual(Array(2).fill(["/tasks/8/complete", {}, { headers: { "Idempotency-Key": key } }]));
  });
  it("retries a lost acknowledgement on the ack route with the same intent", async () => {
    const key = api.newIdempotencyKey();
    transport.post.mockRejectedValueOnce(new Error("response lost")).mockResolvedValueOnce({ data: { ...task, acknowledged_at: "2026-10-16T12:00:00-05:00" } });
    await expect(api.acceptTask(8, key)).rejects.toThrow("response lost");
    expect(await api.acceptTask(8, key)).toMatchObject({ status: "open", acknowledged_at: "2026-10-16T12:00:00-05:00" });
    expect(transport.post.mock.calls).toEqual(Array(2).fill(["/tasks/8/ack", {}, { headers: { "Idempotency-Key": key } }]));
  });
  it("gates completion by canonical principal, status and escalation", () => {
    expect(api.canCompleteTask(identity, task)).toBe(true);
    expect(api.canCompleteTask({ ...identity, principalId: 99 }, task)).toBe(false);
    expect(api.canCompleteTask({ ...identity, principalId: undefined }, task)).toBe(false);
    expect(api.canCompleteTask({ ...identity, principalType: "agent" }, task)).toBe(false);
    expect(api.canCompleteTask(identity, { ...task, status: "done" })).toBe(false);
    expect(api.canCompleteTask({ ...identity, principalId: 43 }, task)).toBe(false);
    expect(api.canCompleteTask({ ...identity, principalId: 43 }, { ...task, status: "escalated" })).toBe(true);
  });
});
