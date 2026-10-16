import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskPanel } from "../src/views/TaskPanel";
import type { TaskOut } from "../src/contracts/client";
const model = vi.hoisted(() => ({ version: 1, load: vi.fn(), finish: vi.fn(), ack: vi.fn(), key: vi.fn(), identity: { principalType: "human", principalId: 42 } }));
vi.mock("../src/components/PersonaContext", () => ({ usePersona: () => model }));
vi.mock("../src/api", () => ({
  loadTasks: model.load, finishTask: model.finish, acceptTask: model.ack, newIdempotencyKey: model.key,
  toApiError: (error: Error) => error, useMocks: false,
  canCompleteTask: (identity: { principalId: number }, task: TaskOut) => identity.principalId === task.assignee_principal_id && task.status === "open",
}));
const task = { id: 8, title: "Preparar material", status: "open", location_id: 1, assignee_principal_id: 42, assignee_name: "Responsable", due_at: null, overdue: false } as TaskOut;
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
let view: ReactTestRenderer;
const content = () => JSON.stringify(view.toJSON());
const mount = async () => { await act(async () => { view = create(<TaskPanel locationId="1" />); }); };
const click = async (label: string) => { await act(async () => { view.root.findAllByType("button").find(button => button.children.join("") === label)!.props.onClick(); }); };
beforeEach(() => { model.version = 1; model.load.mockReset().mockResolvedValue([task]); model.finish.mockReset(); model.ack.mockReset(); model.key.mockReset().mockReturnValue("intent-1"); });
afterEach(() => { if (view) act(() => view.unmount()); });
describe("task UI", () => {
  it("reads open and escalated tasks without a sede permission gate and keeps history separate", async () => {
    model.load.mockImplementation(async (query: { status: string; location_id?: number }) => {
      if (query.location_id) throw new Error("403 sede");
      if (query.status === "open") return [task, { ...task, id: 99, location_id: 2, title: "Otra sede" }];
      if (query.status === "escalated") return [{ ...task, id: 9, status: "escalated", title: "Tarea escalada" }];
      return query.status === "done" ? Array.from({ length: 100 }, (_, id) => ({ ...task, id: id + 100, status: "done", title: "Historial completado" })) : [];
    });
    await mount();
    expect(model.load.mock.calls).toEqual([[{ status: "open", limit: 100 }], [{ status: "escalated", limit: 100 }]]);
    expect(content()).toContain("Preparar material");
    expect(content()).toContain("Tarea escalada");
    expect(content()).not.toContain("Historial completado");
    expect(content()).not.toContain("Otra sede");
    await click("Historial");
    expect(content()).toContain("Historial completado");
    expect(content()).not.toContain("Tarea escalada");
    await click("Activas");
    expect(content()).toContain("Tarea escalada");
  });
  it("retries both active-state reads after a failed read without adding a restrictive sede", async () => {
    model.load.mockRejectedValueOnce(new Error("Sin conexión"));
    await mount();
    expect(content()).toContain("Sin conexión");
    await click("Reintentar");
    expect(content()).toContain("Preparar material");
    expect(model.load.mock.calls.every(([query]) => !Object.hasOwn(query, "location_id"))).toBe(true);
  });
  it("acknowledges separately from completion and shows the unconfigured channel", async () => {
    model.load.mockResolvedValue([{ ...task, delivery: { channel: "whatsapp", state: "not_configured", reason: "staff_channel_not_linked" } }]);
    model.ack.mockResolvedValue({ ...task, acknowledged_at: "2026-10-16T12:00:00-05:00", delivery: { channel: "whatsapp", state: "not_configured", reason: "staff_channel_not_linked" } });
    await mount(); await click("Aceptar tarea");
    expect(model.finish).not.toHaveBeenCalled();
    expect(model.ack).toHaveBeenCalledWith(8, "intent-1");
    expect(content()).toContain("Aceptada:");
    expect(content()).toContain("Pendiente");
    expect(content()).toContain("No configurado");
    expect(content()).not.toContain("Entregado");
  });
  it("retries a lost acknowledgement response with its own action and original key", async () => {
    model.ack.mockRejectedValueOnce(new Error("Se perdió la respuesta")).mockResolvedValueOnce({ ...task, acknowledged_at: "2026-10-16T12:00:00-05:00" });
    await mount(); await click("Aceptar tarea");
    expect(content()).toContain("Reintentar aceptación");
    expect(content()).not.toContain("Reintentar completar");
    expect(content()).toContain("Completar tarea");
    await click("Reintentar aceptación");
    expect(model.key).toHaveBeenCalledTimes(1);
    expect(model.ack.mock.calls).toEqual([[8, "intent-1"], [8, "intent-1"]]);
    expect(model.finish).not.toHaveBeenCalled();
    expect(content()).toContain("Aceptada:");
    expect(content()).not.toContain("Completada");
  });
  it("preserves the failed completion intent on retry and shows only the server result", async () => {
    model.finish.mockRejectedValueOnce(new Error("Sin conexión")).mockResolvedValueOnce({ ...task, status: "done" });
    await mount(); await click("Completar tarea");
    expect(content()).toContain("Sin conexión");
    expect(content()).not.toContain("Completada");
    await click("Reintentar completar");
    expect(model.key).toHaveBeenCalledTimes(1);
    expect(model.finish.mock.calls).toEqual([[8, {}, "intent-1"], [8, {}, "intent-1"]]);
    expect(content()).toContain("Completada");
  });
  it("keeps the completion key if acceptance is recorded between two completion attempts", async () => {
    model.key.mockReturnValueOnce("complete-intent").mockReturnValueOnce("ack-intent");
    model.finish.mockRejectedValueOnce(new Error("Respuesta perdida")).mockResolvedValueOnce({ ...task, status: "done" });
    model.ack.mockResolvedValue({ ...task, acknowledged_at: "2026-10-16T12:00:00-05:00" });
    await mount(); await click("Completar tarea"); await click("Aceptar tarea"); await click("Completar tarea");
    expect(model.finish.mock.calls).toEqual([[8, {}, "complete-intent"], [8, {}, "complete-intent"]]);
    expect(model.ack).toHaveBeenCalledWith(8, "ack-intent");
    expect(model.key).toHaveBeenCalledTimes(2);
  });
  it("does not show old tasks after a principal change while a read is pending", async () => {
    const pending = deferred<TaskOut[]>(); model.load.mockReturnValueOnce(pending.promise);
    await mount(); model.version = 2; model.load.mockResolvedValue([]);
    await act(async () => { view.update(<TaskPanel locationId="1" />); });
    await act(async () => pending.resolve([{ ...task, title: "Dato de otra identidad" }]));
    expect(content()).not.toContain("Dato de otra identidad");
    expect(content()).toContain("No hay tareas accesibles");
  });
  it("ignores a completion result after changing sede", async () => {
    const pending = deferred<TaskOut[]>();
    await mount(); model.finish.mockReturnValueOnce(pending.promise);
    await click("Completar tarea"); model.load.mockResolvedValue([]);
    await act(async () => { view.update(<TaskPanel locationId="2" />); });
    await act(async () => pending.resolve([{ ...task, title: "Resultado anterior" }]));
    expect(content()).not.toContain("Resultado anterior");
    expect(content()).not.toContain("Completada");
  });
});
