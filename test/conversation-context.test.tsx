import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationCase } from "../src/views/ConversationCase";
import type { ConversationContext } from "../src/contracts/client";
import type { ChatConversation } from "../src/types";
const model = vi.hoisted(() => ({ load: vi.fn(), reply: vi.fn(), resume: vi.fn(), key: vi.fn(), card: vi.fn(), version: 1, identity: { principalType: "human", permissions: ["proposals.read"] } }));
vi.mock("../src/api", () => ({ loadProposalCard: model.card, loadConversationContext: model.load, sendConversationReply: model.reply, returnConversationToAgent: model.resume, newIdempotencyKey: model.key, toApiError: (error: Error) => error }));
vi.mock("../src/components/PersonaContext", () => ({ usePersona: () => model }));
vi.mock("next/link", () => ({ default: "a" }));
const context: ConversationContext = {
  conversation: { id: 7, status: "human_handoff", automation: "paused", created_at: "2026-10-16T12:00:00Z", last_message_at: "2026-10-16T12:00:00Z" },
  origin: { channel_provider: "sandbox", channel_display_name: "Clínica sandbox", first_message: null },
  contact: { contact_identity_id: 30, display_name: "Ana", masked_phone: "+•••123", consent_status: "unknown", link_state: "lead_and_patient" },
  patient: { id: 40, full_name: "Paciente canónico" }, lead: { id: 50, full_name: "Lead canónico" }, responsible: null, handoff: null,
  location: null, location_state: "unknown", location_evidence: [],
  proposals: [{ source: "appointment_proposal", id: 9, kind: "appointment_booking", agent_key: null, status: "pending", location_id: 1, summary: "Propuesta real", appointment_id: null, start_utc: null, payload_hash: null, confirmation_token: null, created_at: "2026-10-16T12:00:00Z", expires_at: "2026-10-17T12:00:00Z" }],
  appointments: [{ id: 60, state: "confirmed", start_utc: "2026-10-17T12:00:00Z", end_utc: "2026-10-17T13:00:00Z", location_id: 1, location_name: "Sede real", service_name: "Consulta real", practitioner_name: "Profesional real", relations: ["conversation_proposal"] }],
  actions: ["reply", "resume"],
};
const conversation = { id: 7 } as ChatConversation;
let view: ReactTestRenderer;
const content = () => JSON.stringify(view.toJSON());
const changed = vi.fn();
const mount = async () => { await act(async () => { view = create(<ConversationCase conversation={conversation} reloadToken={0} onChanged={changed} />); }); };
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
beforeEach(() => { model.version = 1; model.identity.permissions = ["proposals.read"]; model.load.mockReset().mockResolvedValue(context); model.reply.mockReset(); model.resume.mockReset(); model.key.mockReset().mockReturnValue("intent"); changed.mockReset(); });
afterEach(() => { if (view) act(() => view.unmount()); vi.unstubAllGlobals(); });
describe("canonical conversation case", () => {
  it("allows a human with sede grants to start a booking using the canonical lead context", async () => {
    model.identity.permissions = [];
    const dispatch = vi.fn();
    vi.stubGlobal("window", { dispatchEvent: dispatch });
    vi.stubGlobal("CustomEvent", class { constructor(public type: string, public options: { detail: unknown }) {} });
    await mount();
    act(() => { view.root.findAllByType("button").find(button => button.children.join("") === "Crear cita para este lead")!.props.onClick(); });
    expect(dispatch.mock.calls[0]![0]).toMatchObject({ type: "open-new-appointment", options: { detail: { conversationId: 7, contactIdentityId: 30, displayName: "Lead canónico", leadId: 50, patientId: 40 } } });
    expect(view.root.findAllByType("a").map(link => link.props.href).some(href => href.startsWith("/aprobaciones"))).toBe(false);
    expect(content()).toContain("Bandeja requiere acceso global");
    expect(content()).toContain("No puedes confirmarla desde esta vista");
  });
  it("uses a scoped card for an agent proposal even without an org-wide inbox grant", async () => {
    model.identity.permissions = [];
    model.load.mockResolvedValue({ ...context, proposals: [{ ...context.proposals[0], source: "agent_proposal", id: 19 }] });
    model.card.mockResolvedValue({ id: "19", proposal_id: 19, version: 1, payload_hash: "a".repeat(64), agent: "airi", level: "aprobar", state: "pending", title: "Propuesta de esta sede", body: "Registro canónico" });
    await mount();
    await act(async () => { view.root.findAllByType("button").find(button => button.children.join("") === "Ver tarjeta de esta propuesta")!.props.onClick(); });
    expect(model.card).toHaveBeenCalledWith(19);
    expect(content()).toContain("Propuesta de esta sede");
    expect(view.root.findAllByType("a").map(link => link.props.href).some(href => href.startsWith("/aprobaciones"))).toBe(false);
  });
  it("clears canonical lead context and pending reads when the principal changes", async () => {
    const late = deferred<ConversationContext>();
    model.load.mockReturnValueOnce(late.promise);
    await mount(); model.version++;
    model.load.mockResolvedValue({ ...context, lead: null, patient: null, proposals: [], appointments: [], actions: [] });
    await act(async () => { view.update(<ConversationCase conversation={conversation} reloadToken={0} onChanged={changed} />); });
    await act(async () => late.resolve(context));
    expect(content()).not.toContain("Lead canónico");
    expect(content()).not.toContain("Crear cita para este lead");
  });
  it("opens an undone agent proposal as its exact card rather than a pending inbox link", async () => {
    model.load.mockResolvedValue({ ...context, proposals: [{ ...context.proposals[0], source: "agent_proposal", status: "undone", id: 19 }] });
    model.card.mockResolvedValue({ id: "19", proposal_id: 19, version: 2, payload_hash: "a".repeat(64), agent: "airi", level: "aprobar", state: "undone", title: "Propuesta revertida", body: "Registro canónico" });
    await mount();
    expect(content()).toContain("Revertida");
    expect(view.root.findAllByType("a").map(link => link.props.href).some(href => href.startsWith("/aprobaciones"))).toBe(false);
    await act(async () => { view.root.findAllByType("button").find(button => button.children.join("") === "Ver tarjeta de esta propuesta")!.props.onClick(); });
    expect(model.card).toHaveBeenCalledWith(19);
    expect(content()).toContain("Deshecho");
  });
  it("links exact patient, source-qualified proposal and appointment without phone lookup", async () => {
    await mount();
    const links = view.root.findAllByType("a").map(link => link.props.href);
    expect(links).toContain("/pacientes?patient=40&conversation=7");
    expect(links).toContain("/aprobaciones?proposal=appointment_proposal%3A9&status=pending&conversation=7");
    expect(links).toContain("/agenda?appointment=60&conversation=7");
    expect(content()).toContain("Automatización pausada");
  });
  it("preserves the reply intent on retry and does not claim delivery", async () => {
    model.reply.mockRejectedValueOnce(new Error("Sin conexión")).mockResolvedValueOnce({ status: "pending", message_id: 12 });
    await mount();
    act(() => view.root.findByType("textarea").props.onChange({ target: { value: "Respuesta autorizada" } }));
    const send = async () => { await act(async () => { view.root.findByType("form").props.onSubmit({ preventDefault() {} }); }); };
    await send(); expect(content()).toContain("Sin conexión");
    await send();
    expect(model.key).toHaveBeenCalledTimes(1);
    expect(model.reply.mock.calls).toEqual(Array(2).fill([7, { text: "Respuesta autorizada" }, "intent"]));
    expect(content()).toContain("En cola de envío");
    expect(content()).not.toContain("Entregado");
  });
  it("clears old context and ignores its late response on conversation change", async () => {
    const late = deferred<ConversationContext>(); model.load.mockReturnValueOnce(late.promise);
    await mount(); model.load.mockResolvedValue({ ...context, patient: null, lead: null, proposals: [], appointments: [], actions: [] });
    await act(async () => { view.update(<ConversationCase conversation={{ ...conversation, id: 8 }} reloadToken={0} onChanged={changed} />); });
    await act(async () => late.resolve(context));
    expect(content()).not.toContain("Paciente canónico");
    expect(view.root.findAllByType("textarea")).toHaveLength(0);
  });
  it("does not substitute mock business context after an error", async () => {
    model.load.mockRejectedValue(new Error("Sin acceso")); await mount();
    expect(content()).toContain("Sin acceso");
    expect(view.root.findAllByType("a")).toHaveLength(0);
  });
});
