import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApprovalItem, Appointment } from "../src/types";

const stubs = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_USE_MOCKS = "false";
  return { prepare: vi.fn(), coverage: vi.fn(), link: vi.fn(), stop: vi.fn() };
});
vi.mock("next/link", () => ({ default: "a" }));
vi.mock("../src/api", async importOriginal => ({ ...await importOriginal<typeof import("../src/api")>(),
  prepareReminders: stubs.prepare, loadReminderCoverage: stubs.coverage, linkTelegramReminders: stubs.link, optOutReminders: stubs.stop,
}));
import { ReminderBatchCard } from "../src/views/ReminderBatchCard";
import { AgendaReminders, ReminderAppointmentStatus, ReminderContactActions } from "../src/views/AgendaPage";
import { toUiReminderBatch, toUiReminderCoverage, reminderReason } from "../src/reminders";
import { ApiError } from "../src/contracts/client";

const now = Date.parse("2026-10-19T12:00:00Z");
const notice = { item_id: 1, appointment_id: 9, appointment_version: 2, patient_name: "Paciente sintético", type: "d1", due_at: "2026-10-19T14:00:00Z", window_end: "2026-10-19T14:05:00Z", text: "Clínica · Lince · 20/10 09:00 · Gestionar cita", buttons: ["Confirmo", "Quiero cambiar"] };
const batch = toUiReminderBatch({ location_id: 1, items: [{ ...notice, item_id: 2, type: "h1", due_at: "2026-10-20T13:00:00Z" }, notice], omissions: [{ appointment_id: 9, type: "h09", reason: "merged_into_h1" }] });
const item: ApprovalItem = { key: "agent_proposal:7", id: 7, source: "agent_proposal", kind: "reminder_batch", category: "cita", categoryLabel: "Cita", agentLabel: "Confirmaciones", status: "pending", headline: "Autorizar 2 recordatorios · Lince", detail: "Nada sale ahora.", facts: [], message: null, locationName: "Lince", expiresAt: "2026-10-19T13:59:00Z", createdAt: "2026-10-19T12:00:00Z", actions: ["approve", "decline"], payloadHash: "a".repeat(64), conversationId: null, confirmationToken: null, decidedBy: null, outcome: null, errorCode: null, reminderBatch: batch };
const rawCoverage = { totals: { d1: { eligible_due: 3, accepted_in_window: 1, missed: 1, late: 0, uncertain: 1, failed: 0 } }, omissions: { no_consent: 2 }, appointments: [{ appointment_id: 9, version: 2, patient_confirmed_at: "2026-10-19T15:00:00Z", contact: { id: 3, status: "linked", consent_status: "opted_in" }, items: [{ item_id: 1, type: "d1", due_at: notice.due_at, status: "accepted", reason: null }], open_change_requests: [{ id: 4 }] }] };
const coverage = toUiReminderCoverage(rawCoverage);
const appointment: Appointment = { id: "9", patientId: 5, version: 2, day: 1, time: "09:00", patient: "Paciente sintético", treatment: "Evaluación", doctor: "Profesional", branch: "Lince", status: "Confirmada", patientConfirmedAt: null };
const renderers: ReactTestRenderer[] = [];
async function render(element: ReturnType<typeof createElement>) {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(element); });
  renderers.push(renderer); return renderer;
}
const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());
const button = (renderer: ReactTestRenderer, label: string) => renderer.root.findAllByType("button").find(node => node.children.includes(label))!;
afterEach(async () => { await act(async () => { renderers.splice(0).forEach(renderer => renderer.unmount()); }); vi.clearAllMocks(); });

describe("E2 presentation and policy boundaries", () => {
  it("orders exact future notices first and gives every omission a reason", async () => {
    const renderer = await render(createElement(ReminderBatchCard, { item, now, onDecide: vi.fn() }));
    const output = text(renderer);
    expect(batch.items.map(row => row.item_id)).toEqual([1, 2]);
    expect(batch.firstDueAt).toBe(notice.due_at);
    expect(output.indexOf("Avisos a decidir")).toBeLessThan(output.indexOf("Omisiones y fusiones"));
    expect(output).toContain("Incluido en el aviso de una hora antes");
    expect(output).toContain(notice.text);
    expect(output).toContain("Confirmo · Quiero cambiar");
    expect(output).toContain("Versión ");
    expect(output).not.toContain("merged_into_h1");
  });
  it("uses only patient names projected by the backend", () => {
    const view = toUiReminderBatch({ location_id: 1, items: [{ ...notice, patient_name: undefined }], omissions: [] }, new Map([[9, "Nombre canónico"]]));
    expect(view.items[0]?.patient_name).toBe("Nombre canónico");
  });
  it("rejects incomplete notice data instead of approving invisible effects", () => {
    expect(() => toUiReminderBatch({ location_id: 1, items: [{ ...notice, buttons: [] }], omissions: [] })).toThrow("incompletos");
  });
  it("locks a double click synchronously through completion", async () => {
    let resolve!: () => void;
    const decide = vi.fn(() => new Promise<void>(done => { resolve = done; }));
    const renderer = await render(createElement(ReminderBatchCard, { item, now, onDecide: decide }));
    const click = button(renderer, "Autorizar envíos futuros").props.onClick;
    await act(async () => { click(); click(); });
    expect(decide).toHaveBeenCalledTimes(1);
    expect(decide).toHaveBeenCalledWith(item, "approve");
    await act(async () => resolve());
  });
  it("does not claim delivery after approval", async () => {
    const renderer = await render(createElement(ReminderBatchCard, { item: { ...item, status: "executed", actions: [] }, now, onDecide: vi.fn() }));
    expect(text(renderer)).toContain("Envíos futuros autorizados");
    expect(text(renderer)).not.toMatch(/enviado|enviados/i);
    expect(button(renderer, "Autorizar envíos futuros")).toBeUndefined();
  });
  it.each(["superseded", "expired"] as const)("explains %s and prevents approval", async status => {
    const renderer = await render(createElement(ReminderBatchCard, { item: { ...item, status, actions: [] }, now, onDecide: vi.fn() }));
    expect(button(renderer, "Autorizar envíos futuros")).toBeUndefined();
    if (status === "superseded") expect(text(renderer)).toContain("Reemplazada");
  });
  it("stops authorization at one minute before the first due time", async () => {
    const renderer = await render(createElement(ReminderBatchCard, { item, now: Date.parse(notice.due_at) - 60_000, onDecide: vi.fn() }));
    expect(button(renderer, "Autorizar envíos futuros").props.disabled).toBe(true);
  });
  it("keeps missed and uncertain notices in the denominator", () => {
    expect(coverage.totals[0]?.percentage).toBeCloseTo(100 / 3);
    expect(coverage.totals[0]?.eligible_due).toBe(3);
    const empty = structuredClone(rawCoverage); empty.totals.d1.eligible_due = 0; empty.totals.d1.accepted_in_window = 0;
    expect(toUiReminderCoverage(empty).totals[0]?.percentage).toBeNull();
    expect(reminderReason("unrecognized_private_code")).toBe("Requiere revisión en recepción");
  });
  it("distinguishes patient confirmation from a confirmed reservation and reloads persistent coverage", async () => {
    const renderer = await render(createElement(ReminderAppointmentStatus, { appointment, coverage: null }));
    expect(text(renderer)).not.toContain("Paciente confirmó");
    await act(async () => renderer.update(createElement(ReminderAppointmentStatus, { appointment, coverage })));
    expect(text(renderer)).toContain("Paciente confirmó");
    expect(text(renderer)).toContain("Solicitud de cambio abierta");
    expect(text(renderer)).toContain("Aceptado por Telegram");
    await act(async () => renderer.update(createElement(ReminderAppointmentStatus, { appointment: { ...appointment, version: 3 }, coverage })));
    expect(text(renderer)).not.toContain("Paciente confirmó");
    expect(text(renderer)).not.toContain("Aceptado por Telegram");
  });
});

describe("E2 Agenda operations", () => {
  it("loads coverage again on refresh and retries one preparation intent with the same key", async () => {
    stubs.coverage.mockResolvedValue(coverage);
    stubs.prepare.mockRejectedValueOnce(new ApiError(0, "NETWORK", "Conexión interrumpida")).mockResolvedValueOnce({ proposalId: 7, firstDueAt: notice.due_at });
    const renderer = await render(createElement(AgendaReminders, { locationId: 1, from: "2026-10-19T05:00:00Z", to: "2026-10-26T05:00:00Z", onCoverage: vi.fn() }));
    await act(async () => { const click = button(renderer, "Preparar recordatorios").props.onClick; click(); click(); });
    expect(stubs.prepare).toHaveBeenCalledTimes(1);
    await act(async () => button(renderer, "Preparar recordatorios").props.onClick());
    expect(stubs.prepare).toHaveBeenCalledTimes(2);
    expect(stubs.prepare.mock.calls[0]?.[1]).toBe(stubs.prepare.mock.calls[1]?.[1]);
    expect(stubs.coverage).toHaveBeenCalledTimes(2);
    expect(text(renderer)).toContain("Revisar lote en Bandeja");
    await act(async () => button(renderer, "Actualizar cobertura").props.onClick());
    expect(stubs.coverage).toHaveBeenCalledTimes(3);
  });
  it("requires a selected site to prepare", async () => {
    stubs.coverage.mockResolvedValue(coverage);
    const renderer = await render(createElement(AgendaReminders, { locationId: undefined, from: notice.due_at, to: notice.window_end, onCoverage: vi.fn() }));
    expect(button(renderer, "Preparar recordatorios").props.disabled).toBe(true);
  });
  it("shows a patient link only from the backend result and records an organization-wide opt-out", async () => {
    stubs.link.mockResolvedValue({ deepLink: "https://t.me/synthetic_bot?start=fake", expiresAt: notice.due_at });
    stubs.stop.mockResolvedValue({});
    const renderer = await render(createElement(ReminderContactActions, { appointment, coverage }));
    await act(async () => { const click = button(renderer, "Crear enlace de vínculo Telegram").props.onClick; click(); click(); });
    expect(stubs.link).toHaveBeenCalledTimes(1);
    expect(stubs.link.mock.calls[0]?.[0]).toBe(5);
    expect(renderer.root.findByType("a").props.href).toBe("https://t.me/synthetic_bot?start=fake");
    await act(async () => button(renderer, "Registrar baja de recordatorios en toda la clínica").props.onClick());
    expect(stubs.stop.mock.calls[0]?.[0]).toBe(3);
    expect(text(renderer)).toContain("Baja registrada en toda la clínica");
  });
});


describe("E2 adapter availability", () => {
  it("projects a prospective E2 inbox payload and approves through the existing typed proposal route", async () => {
    const { toUiInboxItem, decideInboxItem, beginDecision } = await import("../src/approvals");
    const client = await import("../src/contracts/client");
    // JSON fixture represents the approved O1 plan; api.ts remains generated.
    const raw = JSON.parse(JSON.stringify({ source: "agent_proposal", id: 7, kind: "reminder_batch", status: "pending",
      agent_key: "confirmaciones", location_id: 1, summary: "Lote de recordatorios", reason: "Revisión humana", facts: {}, evidence: {},
      payload: { location_id: 1, items: [notice], omissions: [] }, payload_hash: "a".repeat(64),
      expires_at: item.expiresAt, created_at: item.createdAt, actions: ["approve", "decline"],
      conversation_id: null, confirmation_token: null, decided_by: null, result_ref: null, error_code: null }));
    const view = toUiInboxItem(raw, { locations: new Map([[1, { name: "Lince", timezone: "America/Lima" }]]), appointmentPatients: new Map([[9, "Paciente canónico"]]) });
    expect(view.headline).toBe("Autorizar 1 recordatorio · Lince");
    expect(view.category).toBe("cita");
    expect(view.reminderBatch?.items[0]?.patient_name).toBe("Paciente canónico");
    const post = vi.spyOn(client.http, "post").mockResolvedValue({ data: { ...raw, status: "executed", actions: [] }, headers: {} });
    try {
      const intent = beginDecision(view, "approve");
      const first = await decideInboxItem(view, intent);
      await decideInboxItem(view, intent);
      expect(post).toHaveBeenCalledTimes(2);
      for (const call of post.mock.calls) expect(call).toEqual(["/agent/proposals/7/approve", { payload_hash: raw.payload_hash }, { headers: { "Idempotency-Key": intent.idempotencyKey } }]);
      expect(first.item.outcome).toContain("Envíos futuros autorizados");
      expect(first.item.outcome).not.toMatch(/enviados/i);
    } finally { post.mockRestore(); }
  });
  it("never calls paths missing from the generated O1 contract", async () => {
    const client = await import("../src/contracts/client");
    const get = vi.spyOn(client.http, "get");
    const post = vi.spyOn(client.http, "post");
    const adapter = await import("../src/reminders");
    await expect(adapter.loadReminderCoverage({ from: notice.due_at, to: notice.window_end })).rejects.toMatchObject({ code: "REMINDERS_CONTRACT_PENDING" });
    await expect(adapter.prepareReminders(1, "fake-key")).rejects.toMatchObject({ code: "REMINDERS_CONTRACT_PENDING" });
    await expect(adapter.linkTelegramReminders(5, "fake-key")).rejects.toMatchObject({ code: "REMINDERS_CONTRACT_PENDING" });
    await expect(adapter.optOutReminders(3, "fake-key")).rejects.toMatchObject({ code: "REMINDERS_CONTRACT_PENDING" });
    expect(get).not.toHaveBeenCalled(); expect(post).not.toHaveBeenCalled();
    get.mockRestore(); post.mockRestore();
  });
  it("validates links and maps persistent coverage through the adapter", async () => {
    const client = await import("../src/contracts/client");
    const adapter = await import("../src/reminders");
    const get = vi.spyOn(client, "getReminderCoverage").mockResolvedValue(rawCoverage);
    expect(await adapter.loadReminderCoverage({ locationId: 1, from: notice.due_at, to: notice.window_end })).toEqual(coverage);
    expect(get).toHaveBeenCalledWith({ locationId: 1, from: notice.due_at, to: notice.window_end });
    get.mockRestore();
    const link = vi.spyOn(client, "createTelegramReminderLink").mockResolvedValue({ deep_link: "https://example.invalid/fake", expires_at: notice.due_at });
    await expect(adapter.linkTelegramReminders(5, "one-intent")).rejects.toMatchObject({ code: "INVALID_TELEGRAM_LINK" });
    expect(link).toHaveBeenCalledWith(5, "one-intent"); link.mockRestore();
  });
  it("rejects every reminder operation in mock mode instead of fabricating business data", async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "true"); vi.resetModules();
    try {
      const adapter = await import("../src/reminders");
      await expect(adapter.prepareReminders(1, "fake-key")).rejects.toMatchObject({ code: "DEMO_UNAVAILABLE" });
      await expect(adapter.loadReminderCoverage({ from: notice.due_at, to: notice.window_end })).rejects.toMatchObject({ code: "DEMO_UNAVAILABLE" });
      await expect(adapter.linkTelegramReminders(5, "fake-key")).rejects.toMatchObject({ code: "DEMO_UNAVAILABLE" });
      await expect(adapter.optOutReminders(3, "fake-key")).rejects.toMatchObject({ code: "DEMO_UNAVAILABLE" });
    } finally { vi.unstubAllEnvs(); vi.resetModules(); }
  });
});
