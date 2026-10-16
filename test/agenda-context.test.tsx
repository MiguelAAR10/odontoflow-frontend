import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgendaPage } from "../src/views/AgendaPage";
const model = vi.hoisted(() => ({ detail: vi.fn(), list: vi.fn() }));
vi.mock("../src/api", async importOriginal => ({
  ...await importOriginal<typeof import("../src/api")>(), useMocks: false,
  getAgendaDetail: model.detail, loadAgenda: model.list, getLocations: async () => [],
  toUiAppointment: (row: { id: number; patient: string }) => ({ id: String(row.id), patient: row.patient, treatment: "Consulta", doctor: "Profesional", branch: "Sede", locationId: 2, day: 0, time: "10:00", status: "Confirmada" }),
}));
vi.mock("next/link", () => ({ default: "a" }));
vi.mock("../src/components/Drawer", () => ({ Drawer: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <aside>{children}</aside> : null }));
vi.mock("../src/components/Modal", () => ({ Modal: () => null }));
vi.mock("../src/components/AttendancePanel", () => ({ AttendancePanel: () => null }));
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
let view: ReactTestRenderer;
const content = () => JSON.stringify(view.toJSON());
beforeEach(() => {
  model.list.mockReset().mockResolvedValue([]); model.detail.mockReset();
  vi.stubGlobal("window", { setInterval, clearInterval, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => { if (view) act(() => view.unmount()); vi.unstubAllGlobals(); });
describe("canonical appointment navigation", () => {
  it("opens the exact appointment even when absent from the calendar list", async () => {
    model.detail.mockResolvedValue({ id: 901, patient: "Paciente del caso", state: "confirmed" });
    await act(async () => { view = create(<AgendaPage appointmentId={901} conversationId={13} />); });
    expect(model.detail).toHaveBeenCalledWith(901);
    expect(content()).toContain("Paciente del caso");
    expect(view.root.findByType("a").props.href).toBe("/chat?conversation=13");
  });
  it("does not overwrite a newer linked record with an old response", async () => {
    const pending = deferred<{ id: number; patient: string; state: string }>();
    model.detail.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ id: 902, patient: "Paciente actual", state: "confirmed" });
    await act(async () => { view = create(<AgendaPage appointmentId={901} />); });
    await act(async () => { view.update(<AgendaPage appointmentId={902} />); });
    await act(async () => pending.resolve({ id: 901, patient: "Paciente anterior", state: "confirmed" }));
    expect(content()).toContain("Paciente actual");
    expect(content()).not.toContain("Paciente anterior");
  });
});
