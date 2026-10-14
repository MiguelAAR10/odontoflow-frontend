import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MiTurnoPage } from "../../../src/views/MiTurnoPage";
import agenda from "../../../src/agui/sim/fixtures/agenda.json";
import snapshots from "../../../src/agui/sim/fixtures/state.json";

const model = vi.hoisted(() => ({ useMocks: false, role: "admin", locationId: "1", version: 1, worldState: {} as unknown, loadAgenda: vi.fn(), loadInbox: vi.fn() }));
vi.mock("../../../src/api", () => ({ get useMocks() { return model.useMocks; }, loadAgenda: model.loadAgenda, loadInbox: model.loadInbox, describeApprovalError: (error: Error) => ({ message: error.message }), toApiError: (error: Error) => ({ message: error.message }) }));
vi.mock("../../../src/components/shell/ShellContext", () => ({ useShellContext: () => model }));
vi.mock("../../../src/components/PersonaContext", () => ({ usePersona: () => model }));
vi.mock("../../../src/agui/useAgent", () => ({ useAgent: () => ({ worldState: model.worldState, cards: {}, working: false }) }));
vi.mock("../../../src/views/ActivityPage", () => ({ OperationsStyles: () => null }));
vi.mock("next/link", () => ({ default: "a" }));
const row = { id: "real", status: "Confirmada", startUtc: "2026-10-14T15:30:00Z", endUtc: "2026-10-14T16:00:00Z", patient: "Paciente real", doctor: "Doctora", treatment: "Control", branch: "Sede real" };
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
let view: ReactTestRenderer;
const content = () => JSON.stringify(view.toJSON());
const mount = async () => { await act(async () => { view = create(<MiTurnoPage />); }); };
const refresh = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(30_000); }); };
const rerender = async () => { await act(async () => { view.update(<MiTurnoPage />); }); };

describe("Mi turno: fuentes honestas y recarga por ámbito", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-14T15:00:00Z"));
    Object.assign(model, { useMocks: false, role: "admin", locationId: "1", version: 1, worldState: {} });
    model.loadAgenda.mockReset().mockResolvedValue([row]);
    model.loadInbox.mockReset().mockResolvedValue({ items: [], nextCursor: null });
  });
  afterEach(() => { if (view) act(() => view.unmount()); vi.useRealTimers(); });
  it("sin proyección de llegadas declara indisponibilidad, incluso con agenda vacía", async () => {
    model.loadAgenda.mockResolvedValue([]);
    await mount();
    expect(content()).toContain("Llegadas y pacientes en consulta no disponibles");
    expect(content()).not.toContain("en espera");
    expect(view.root.findAllByProps({ "aria-label": "Ahora" })).toHaveLength(0);
    expect(view.root.findAllByProps({ "aria-label": "Próximas 2 h" })).toHaveLength(1);
  });
  it("snapshot completo conserva Ahora y el conteo informado", async () => {
    model.worldState = { agenda, cut_at: snapshots[0]!.cut_at };
    await mount();
    expect(content()).toContain("en espera");
    expect(view.root.findAllByProps({ className: "operations-count" })[0]!.children).toEqual([String(agenda.filter(row => row.state === "llegó").length)]);
    expect(content()).not.toContain("no disponibles");
    const now = view.root.findByProps({ "aria-label": "Ahora" });
    expect(now.findAllByProps({ className: "operations-appointment" })).toHaveLength(agenda.filter(row => ["llegó", "en consulta"].includes(row.state)).length);
  });
  it("snapshot sin campos de llegada no habilita el conteo", async () => {
    model.worldState = { agenda: agenda.map(({ arrived_at, ...row }) => row), cut_at: snapshots[0]!.cut_at };
    await mount();
    expect(content()).toContain("no disponibles");
  });
  it("fixture simulado conserva el conteo de espera", async () => {
    model.useMocks = true;
    await mount();
    expect(content()).toContain("en espera");
    expect(view.root.findAllByProps({ className: "operations-count" })[0]!.children).toEqual([String(agenda.filter(row => row.state === "llegó").length)]);
    expect(content()).toContain("Carlos Rojas");
    expect(model.loadAgenda).not.toHaveBeenCalled();
  });
  it("abre la cola de la clínica aunque el hilo no tenga propuestas", async () => {
    model.useMocks = true;
    await mount();
    expect(content()).toContain("Responder a Daniela Soto");
    expect(content()).toContain("Confirmar ingreso Yape");
    expect(content()).not.toContain("No hay decisiones pendientes en este hilo");
  });
  it("en modo real consulta la bandeja sin cargar los casos simulados", async () => {
    await mount();
    expect(model.loadInbox).toHaveBeenCalledWith({ status: "pending" });
    expect(content()).not.toContain("Daniela Soto");
    expect(content()).not.toContain("Confirmar ingreso Yape");
  });
  it("recarga lenta mantiene el radar y reemplaza el corte al resolver", async () => {
    await mount();
    const second = deferred<typeof row[]>(); model.loadAgenda.mockReturnValueOnce(second.promise);
    await refresh();
    expect(content()).toContain("Paciente real");
    expect(content()).toContain("Actualizando agenda");
    expect(content()).not.toContain("Cargando turno");
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(model.loadAgenda).toHaveBeenCalledTimes(2);
    await act(async () => { second.resolve([{ ...row, patient: "Paciente actualizado" }]); });
    expect(content()).toContain("Paciente actualizado");
    expect(content()).not.toContain("Actualizando agenda");
  });
  it("error en recarga mantiene el corte y permite reintentar", async () => {
    await mount(); model.loadAgenda.mockRejectedValueOnce(new Error("Red no disponible"));
    await refresh();
    expect(content()).toContain("Paciente real"); expect(content()).toContain("Red no disponible");
    await act(async () => { view.root.findAllByType("button").find(button => button.children.join("") === "Reintentar")!.props.onClick(); });
    expect(content()).not.toContain("Red no disponible");
  });
  it.each(["locationId", "version", "role"] as const)("cambio de %s limpia el corte y descarta respuesta anterior", async field => {
    await mount();
    const second = deferred<typeof row[]>(); model.loadAgenda.mockReturnValueOnce(second.promise);
    await refresh();
    if (field === "locationId") model.locationId = "2";
    else if (field === "version") model.version = 2;
    else model.role = "doctor";
    const third = deferred<typeof row[]>(); model.loadAgenda.mockReturnValueOnce(third.promise);
    await rerender();
    expect(content()).not.toContain("Paciente real");
    await act(async () => { second.resolve([{ ...row, patient: "Respuesta obsoleta" }]); });
    expect(content()).not.toContain("Respuesta obsoleta");
    if (field !== "role") {
      await act(async () => { third.resolve([{ ...row, patient: "Nuevo ámbito" }]); });
      expect(content()).toContain("Nuevo ámbito");
    }
  });
});
