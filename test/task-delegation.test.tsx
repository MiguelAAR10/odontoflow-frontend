import { cardFixture } from "./proposal-card.fixture";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskDelegationDraft } from "../src/views/TaskDelegationDraft";
import type { Appointment } from "../src/types";
const model = vi.hoisted(() => ({ load: vi.fn(), propose: vi.fn(), key: vi.fn(), card: vi.fn(), record: vi.fn(), version: 1, identity: { principalType: "human", permissions: ["proposals.read"] } }));
vi.mock("../src/api", () => ({ loadProposalCard: model.card, loadProposalRecord: model.record, loadTaskAssignees: model.load, proposeTaskDelegation: model.propose, newIdempotencyKey: model.key, toApiError: (error: Error) => error }));
vi.mock("../src/components/PersonaContext", () => ({ usePersona: () => model }));
vi.mock("next/link", () => ({ default: "a" }));
const appointment: Appointment = { id: "12", patient: "Paciente", treatment: "Consulta", doctor: "Doctor de la cita", branch: "Sede clínica", locationId: 2, patientId: "8", status: "Confirmada", day: 0, time: "10:00" };
let view: ReactTestRenderer;
const content = () => JSON.stringify(view.toJSON());
const mount = async () => { await act(async () => { view = create(<TaskDelegationDraft appointment={appointment} />); }); };
const fill = (due = "2026-11-01T11:30") => act(() => {
  view.root.findByType("select").props.onChange({ target: { value: "45" } });
  view.root.findAllByType("input").find(input => input.props.type === "datetime-local")!.props.onChange({ target: { value: due } });
  view.root.findAllByType("input").find(input => input.props.maxLength === 200)!.props.onChange({ target: { value: "Revisar preparación" } });
});
const submit = async () => { await act(async () => { await view.root.findByType("form").props.onSubmit({ preventDefault() {} }); }); };
beforeEach(() => { model.version = 1; model.identity.permissions = ["proposals.read"]; model.card.mockReset().mockResolvedValue(cardFixture(91)); model.record.mockReset().mockResolvedValue({ id: 91, source: "agent_proposal", status: "pending", payload_hash: "a".repeat(64) }); model.load.mockReset().mockResolvedValue([{ principal_id: 45, display_name: "Responsable real" }]); model.propose.mockReset().mockResolvedValue({ id: 91, source: "agent_proposal", status: "pending" }); model.key.mockReset().mockReturnValue("intent"); });
afterEach(() => { if (view) act(() => view.unmount()); });
describe("delegation from a canonical appointment", () => {
  it.each(["2026-11-01T11:30", "2026-11-01T11:30:00"])("accepts a sede-only reporter and retries the same intent with deadline %s", async due => {
    model.identity.permissions = [];
    model.propose.mockRejectedValueOnce(new Error("Respuesta perdida")).mockResolvedValueOnce({ id: 91, source: "agent_proposal", status: "pending", actions: [] });
    await mount(); fill(due); await submit(); await submit();
    expect(model.propose.mock.calls[0]).toEqual(model.propose.mock.calls[1]);
    expect(model.propose.mock.calls[0]![0].due_at).toBe("2026-11-01T16:30:00.000Z");
    expect(model.card).toHaveBeenCalledWith(91);
    expect(content()).toContain("Contenido del backend");
    expect(view.root.findAllByType("a")).toHaveLength(0);
    expect(model.record).not.toHaveBeenCalled();
    expect(view.root.findAllByType("button").map(button => button.children.join(""))).not.toContain("Aprobar");
  });
  it("clears the selected person and ignores a report response after changing identity", async () => {
    let resolve!: (value: unknown) => void;
    model.propose.mockReturnValueOnce(new Promise(yes => { resolve = yes; }));
    await mount(); fill();
    act(() => { void view.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
    model.version++;
    await act(async () => { view.update(<TaskDelegationDraft appointment={appointment} />); });
    await act(async () => resolve({ id: 91, source: "agent_proposal", status: "pending" }));
    expect(content()).not.toContain("Estado al recibir el reporte");
    expect(view.root.findByType("select").props.value).toBe("");
    fill(); await submit();
    expect(model.key).toHaveBeenCalledTimes(2);
  });
  it("requires a named authorized assignee and carries the exact appointment and patient", async () => {
    await mount();
    expect(model.load).toHaveBeenCalledWith(2);
    expect(view.root.findByType("select").props.value).toBe("");
    expect(content()).toContain("Responsable real");
    expect(content()).not.toContain("practitioner_id");
    act(() => {
      view.root.findByType("select").props.onChange({ target: { value: "45" } });
      view.root.findAllByType("input").find(input => input.props.type === "datetime-local")!.props.onChange({ target: { value: "2026-11-01T11:30" } });
      view.root.findAllByType("input").find(input => input.props.maxLength === 200)!.props.onChange({ target: { value: "Revisar preparación" } });
    });
    await act(async () => { view.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
    expect(model.propose).toHaveBeenCalledWith({ title: "Revisar preparación", location_id: 2, assignee_principal_id: 45, due_at: "2026-11-01T16:30:00.000Z", appointment_id: 12, patient_id: 8 }, "intent");
    expect(view.root.findByType("a").props.href).toContain("agent_proposal%3A91");
  });
  it("shows the backend outcome when a lost-response retry returns an already applied delegation", async () => {
    model.record.mockResolvedValue({ id: 91, source: "agent_proposal", status: "executed", payload_hash: "a".repeat(64), result_ref: { type: "delegation_task", id: 70 } });
    model.propose.mockRejectedValueOnce(new Error("Respuesta perdida")).mockResolvedValueOnce({ id: 91, source: "agent_proposal", status: "executed", result_ref: { type: "delegation_task", id: 70 } });
    await mount();
    act(() => {
      view.root.findByType("select").props.onChange({ target: { value: "45" } });
      view.root.findAllByType("input").find(input => input.props.type === "datetime-local")!.props.onChange({ target: { value: "2026-11-01T11:30" } });
      view.root.findAllByType("input").find(input => input.props.maxLength === 200)!.props.onChange({ target: { value: "Revisar preparación" } });
    });
    await act(async () => { view.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
    await act(async () => { view.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
    expect(content()).toContain("Aplicada");
    expect(content()).not.toContain("Propuesta preparada");
    expect(content()).toContain("Ver resultado de la propuesta en Bandeja");
    expect(view.root.findByType("a").props.href).toContain("status=executed");
    expect(model.propose.mock.calls[0]).toEqual(model.propose.mock.calls[1]);
    expect(model.key).toHaveBeenCalledTimes(1);
  });
  it("does not replace a failed staff catalogue with a mock physician", async () => {
    model.load.mockRejectedValue(new Error("Sin acceso a esta sede")); await mount();
    expect(content()).toContain("Sin acceso a esta sede");
    expect(view.root.findAllByType("option")).toHaveLength(1);
    expect(model.propose).not.toHaveBeenCalled();
  });
});
