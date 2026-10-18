import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from "axios";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentRead, PaymentVerificationReviewReceipt } from "../src/contracts/client";
import { cardFixture } from "./proposal-card.fixture";

vi.mock("../src/components/useFocusTrap", () => ({ useFocusTrap: () => {} }));
vi.mock("next/link", () => ({ default: "a" }));
vi.mock("../src/components/PersonaContext", () => ({ usePersona: () => ({
  identity: { principalType: "human", permissions: [] }, loading: false, version: 1,
}) }));

const payment: PaymentRead = {
  id: 7, charge_id: 21, amount: "120.00", method: "yape", reference: "OP-123", receiver: "Cuenta Lince",
  paid_at: "2026-10-18T14:00:00Z", reconciliation_note: null, verification_status: "unverified", verified_at: null,
};
const charge = {
  id: 21, service_execution_id: 42, amount: "250.00", paid: "120.00", outstanding: "130.00",
  created_at: payment.paid_at, visit_id: 5, patient_id: 9, patient_name: "Paciente real",
  service_id: 3, service_name: "Evaluación dental", location_id: 2, location_name: "Lince",
  practitioner_id: 1, practitioner_name: "Doctora real", executed_at: payment.paid_at,
};
const receipt: PaymentVerificationReviewReceipt = {
  created: true,
  payment: { id: payment.id, amount: payment.amount, method: payment.method, reference: "OP-123",
    receiver: payment.receiver, paid_at: payment.paid_at, location: { id: 2, name: "Lince" } },
  proposal: {
    id: 71, source: "agent_proposal", kind: "payment_verify", agent_key: "airi", status: "pending", location_id: 2,
    summary: "Verificar pago Yape S/ 120", reason: "Cotejar el pago registrado", facts: null,
    evidence: { srcs: ["pago registrado"], reference: "OP-123", method: "yape", receiver: "Cuenta Lince", amount: "120.00" },
    payload: { payment_ids: [7] }, payload_hash: "a".repeat(64), subject: { type: "payment", id: "7" },
    conversation_id: null, confirmation_token: null, created_at: payment.paid_at, expires_at: "2099-01-01T00:00:00Z",
    decided_by: null, result_ref: null, error_code: null, actions: ["approve", "decline"],
  },
};
const verificationCard = {
  ...cardFixture(71), title: receipt.proposal.summary,
  body: "Coteja la referencia OP-123 en Cuenta Lince. Al aprobar pasa a cobrado verificado; el total recibido no cambia.",
  scope: [{ label: "Monto", value: "S/ 120" }, { label: "Referencia", value: "OP-123" },
    { label: "Método", value: "Yape" }, { label: "Receptor", value: "Cuenta Lince" }, { label: "Sede", value: "Lince" }],
  reversible: "authorized_reversal", edit: false,
};

describe("Preparar revisión: Caja con adaptador y cliente reales", () => {
  let client: typeof import("../src/contracts/client");
  let CashPage: typeof import("../src/views/CashPage")["CashPage"];
  let originalAdapter: typeof client.http.defaults.adapter;
  let view: ReactTestRenderer | undefined;
  const navigate = vi.fn();
  const content = () => JSON.stringify(view!.toJSON());
  const buttons = (label: string) => view!.root.findAllByType("button").filter(button => button.children.includes(label));
  const click = async (label: string, index = 0) => act(async () => { await buttons(label)[index]!.props.onClick(); });

  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false");
    client = await import("../src/contracts/client");
    originalAdapter = client.http.defaults.adapter;
    ({ CashPage } = await import("../src/views/CashPage"));
  });
  beforeEach(() => {
    navigate.mockReset();
    vi.stubGlobal("window", { location: { assign: navigate } });
  });
  afterEach(async () => {
    await act(async () => view?.unmount());
    view = undefined;
    client.http.defaults.adapter = originalAdapter;
    vi.unstubAllGlobals();
  });
  afterAll(() => vi.unstubAllEnvs());

  async function renderCash(post: (config: InternalAxiosRequestConfig) => Promise<unknown>, payments = [payment], postStatus = 201) {
    client.http.defaults.adapter = async config => {
      let data: unknown;
      if (config.method === "post") data = await post(config);
      else if (config.url === "/charges") data = [charge];
      else if (config.url === "/locations") data = [{ id: 2, name: "Lince", timezone: "America/Lima", is_active: true }];
      else if (config.url === "/charges/21/payments" || config.url === "/payments") data = payments;
      else throw new Error(`Unexpected endpoint ${config.url}`);
      return { status: config.method === "post" ? postStatus : 200, statusText: "OK", headers: new AxiosHeaders(), config, data };
    };
    await act(async () => { view = create(createElement(CashPage)); });
    await click("Conciliación");
  }

  it("doble clic envía una petición sin body, deshabilita en vuelo y abre la tarjeta del recibo", async () => {
    let release!: (value: PaymentVerificationReviewReceipt) => void;
    const post = vi.fn((_config: InternalAxiosRequestConfig) => new Promise<PaymentVerificationReviewReceipt>(resolve => { release = resolve; }));
    await renderCash(post);
    const submit = buttons("Preparar revisión")[0]!.props.onClick;
    let first!: Promise<void>;
    await act(async () => { first = submit(); await submit(); });
    expect(post).toHaveBeenCalledTimes(1);
    const config = post.mock.calls[0]![0];
    expect(config.url).toBe("/payments/7/verification-review");
    expect(config.data).toBeUndefined();
    expect(config.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(buttons("Preparando…")[0]!.props.disabled).toBe(true);
    expect(buttons("Verificar")[0]!.props.disabled).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    await act(async () => { release(receipt); await first; });
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/aprobaciones?proposal=agent_proposal:71");
  });

  it("created=false navega a la misma propuesta abierta", async () => {
    await renderCash(vi.fn().mockResolvedValue({ ...receipt, created: false }), [payment], 200);
    await click("Preparar revisión");
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/aprobaciones?proposal=agent_proposal:71");
  });

  it("conserva una clave por pago tras una respuesta perdida y alternar entre pagos", async () => {
    const post = vi.fn(async (_config: InternalAxiosRequestConfig) => { throw new Error("Respuesta perdida"); });
    await renderCash(post, [payment, { ...payment, id: 8, reference: "OP-124" }]);
    await click("Preparar revisión", 0);
    await click("Preparar revisión", 1);
    await click("Preparar revisión", 0);
    expect(post.mock.calls.map(([config]) => config.url)).toEqual([
      "/payments/7/verification-review", "/payments/8/verification-review", "/payments/7/verification-review",
    ]);
    const keys = post.mock.calls.map(([config]) => config.headers.get("Idempotency-Key"));
    expect(keys[0]).toBe(keys[2]);
    expect(keys[1]).not.toBe(keys[0]);
    expect(content()).toContain("Respuesta perdida");
    expect(buttons("Preparar revisión")[0]!.props.disabled).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each([
    [422, "INVALID_INPUT", "Falta la referencia del pago."],
    [403, "PERMISSION_DENIED", "No tienes permiso en esta sede."],
  ])("muestra message del backend ante %s sin navegar ni verificar", async (status, code, message) => {
    const post = vi.fn(async (config: InternalAxiosRequestConfig) => {
      throw new AxiosError("Rejected", "ERR_BAD_REQUEST", config, undefined, {
        status, statusText: "Rejected", headers: new AxiosHeaders(), config, data: { error: { code, message, details: {} } },
      });
    });
    await renderCash(post);
    await click("Preparar revisión");
    expect(view!.root.findByProps({ role: "alert" }).children).toContain(message);
    expect(buttons("Preparar revisión")[0]!.props.disabled).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("un pago sin referencia no ofrece preparación ni verificación manual", async () => {
    const post = vi.fn();
    await renderCash(post, [{ ...payment, reference: null }]);
    expect(buttons("Preparar revisión")).toHaveLength(0);
    expect(buttons("Verificar")).toHaveLength(0);
    expect(content()).toContain("Histórico · no verificable");
    expect(post).not.toHaveBeenCalled();
  });

  it("mantiene la verificación manual con su endpoint y clave propios", async () => {
    const post = vi.fn().mockResolvedValue({ ...payment, verification_status: "verified" });
    await renderCash(post);
    await click("Verificar");
    expect(post).not.toHaveBeenCalled();
    await act(async () => { await view!.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]![0].url).toBe("/payments/7/verify");
    expect(post.mock.calls[0]![0].headers.get("Idempotency-Key")).toBeTruthy();
    expect(content()).toContain("Pago marcado como verificado.");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("Bandeja abre directamente la propuesta vinculada y pinta la tarjeta canónica", async () => {
    vi.unstubAllGlobals();
    const get = vi.fn(async (config: InternalAxiosRequestConfig) => {
      if (config.url === "/agent/proposals/71") return receipt.proposal;
      if (config.url === "/agent/cards/71") return verificationCard;
      if (config.url === "/locations") return [{ id: 2, name: "Lince", timezone: "America/Lima", is_active: true }];
      if (config.url === "/agent/inbox") return { items: [], next_cursor: null };
      throw new Error(`Unexpected endpoint ${config.url}`);
    });
    client.http.defaults.adapter = async config => ({ status: 200, statusText: "OK", headers: new AxiosHeaders(), config, data: await get(config) });
    const { ApprovalsPage } = await import("../src/views/ApprovalsPage");
    await act(async () => { view = create(createElement(ApprovalsPage, { focusedKey: "agent_proposal:71" })); });
    for (const value of ["Referencia", "OP-123", "Método", "Yape", "Receptor", "Cuenta Lince", "Sede", "Lince", "total recibido no cambia"]) {
      expect(content()).toContain(value);
    }
    expect(get.mock.calls.map(([config]) => config.url)).toContain("/agent/cards/71");
    expect(buttons("Aprobar")).toHaveLength(1);
  });

  it("rechaza una tarjeta canónica cuyo hash no coincide con la propuesta", async () => {
    client.http.defaults.adapter = async config => {
      const data = config.url === "/agent/proposals/71" ? receipt.proposal : config.url === "/locations" ? [] : { ...verificationCard, payload_hash: "b".repeat(64) };
      return { status: 200, statusText: "OK", headers: new AxiosHeaders(), config, data };
    };
    const { loadInboxRecord } = await import("../src/approvals");
    await expect(loadInboxRecord(71)).rejects.toMatchObject({ code: "PROPOSAL_CHANGED" });
  });
});

describe("Preparar revisión: guard de demo", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
  it("USE_MOCKS rechaza con DEMO_UNAVAILABLE sin enviar ninguna petición", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "true");
    const client = await import("../src/contracts/client");
    const originalAdapter = client.http.defaults.adapter;
    const transport = vi.fn();
    client.http.defaults.adapter = transport;
    try {
      const { preparePaymentVerificationReview } = await import("../src/paymentVerification");
      await expect(preparePaymentVerificationReview(7, "unused-key")).rejects.toMatchObject({ httpStatus: 422, code: "DEMO_UNAVAILABLE" });
      expect(transport).not.toHaveBeenCalled();
    } finally {
      client.http.defaults.adapter = originalAdapter;
    }
  });
});
