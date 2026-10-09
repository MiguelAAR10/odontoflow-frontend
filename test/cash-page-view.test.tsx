import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer, type ReactTestRendererJSON } from "react-test-renderer";
import { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";

// react-test-renderer has no DOM; focus management is outside these transport tests.
vi.mock("../src/components/useFocusTrap", () => ({ useFocusTrap: () => {} }));

const initialCharge = {
  id: 7, service_execution_id: 42, amount: "250.00", paid: "100.00", outstanding: "150.00",
  created_at: "2026-08-14T14:15:00Z", visit_id: 5, patient_id: 9, patient_name: "Paciente Canónico",
  service_id: 3, service_name: "Evaluación dental", location_id: 2, location_name: "Jesús María",
  practitioner_id: 1, practitioner_name: "Dra. Valeria Ruiz", executed_at: "2026-08-14T14:00:00Z",
};
const payment = {
  id: 1, charge_id: 7, amount: "50.00", method: "efectivo", paid_at: "2026-08-14T14:15:00Z",
  reference: null, receiver: null, reconciliation_note: null, verification_status: "unverified", verified_at: null,
};

function text(node: ReactTestRendererJSON | ReactTestRendererJSON[] | string | null): string {
  if (node === null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(text).join(" ");
  return (node.children ?? []).map(text).join(" ");
}

// The real adapter/client runs; only the HTTP transport is replaced.
describe("Caja: vista en modo real", () => {
  let client: typeof import("../src/contracts/client");
  let CashPage: typeof import("../src/views/CashPage")["CashPage"];
  let originalAdapter: typeof client.http.defaults.adapter;
  let view: ReactTestRenderer | undefined;

  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false");
    client = await import("../src/contracts/client");
    originalAdapter = client.http.defaults.adapter;
    ({ CashPage } = await import("../src/views/CashPage"));
  });
  afterEach(async () => {
    await act(async () => { view?.unmount(); });
    view = undefined;
    client.http.defaults.adapter = originalAdapter;
  });
  afterAll(() => vi.unstubAllEnvs());

  async function renderCash(post: AxiosAdapter) {
    let posted = 0;
    const payments: typeof payment[] = [];
    client.http.defaults.adapter = async (config) => {
      if (config.method === "post") {
        const response = await post(config);
        posted += 1;
        const saved = { ...response.data, id: posted };
        payments.push(saved);
        return { ...response, data: saved };
      }
      let data: unknown = [];
      if (config.url === "/charges") data = [{ ...initialCharge, ...(posted === 1 ? { paid: "150.00", outstanding: "100.00" } : posted === 2 ? { paid: "250.00", outstanding: "0.00" } : {}) }];
      else if (config.url === "/locations") data = [{ id: 2, name: "Jesús María", timezone: "America/Lima", is_active: true }];
      else if (config.url === "/charges/7/payments") data = payments;
      else if (config.url !== "/payments") throw new Error(`Unexpected GET ${config.url}`);
      return { status: 200, statusText: "OK", headers: new AxiosHeaders(), config, data };
    };
    await act(async () => { view = create(createElement(CashPage)); });
    const screen = view!;
    await act(async () => {
      screen.root.findAllByType("button").find((button) => button.children.includes("Cobrar"))!.props.onClick();
    });
    await act(async () => { screen.root.findByProps({ name: "amount" }).props.onChange({ target: { value: "50" } }); });
    return screen;
  }

  const ok = (config: InternalAxiosRequestConfig) => ({ status: 201, statusText: "Created", headers: new AxiosHeaders(), config, data: { ...payment, amount: String(JSON.parse(config.data).amount) } });
  const event = { preventDefault() {} };

  it("envía el cobro con Idempotency-Key, muestra Pago registrado y refresca el saldo del backend", async () => {
    const post = vi.fn(async (config: InternalAxiosRequestConfig) => ok(config));
    const screen = await renderCash(post);
    await act(async () => { await screen.root.findByType("form").props.onSubmit(event); });
    expect(post).toHaveBeenCalledTimes(1);
    const config = post.mock.calls[0]![0];
    expect(config.url).toBe("/charges/7/payments");
    expect(config.headers.get("Idempotency-Key")).toEqual(expect.any(String));
    expect(config.headers.get("Idempotency-Key")).toBeTruthy();
    expect(JSON.parse(config.data)).toEqual({ amount: 50, method: "efectivo" });
    expect(text(screen.toJSON())).toContain("Pago registrado");
    const context = screen.root.findByProps({ className: "charge-context" });
    expect(context.findByProps({ className: "numeric-emphasis" }).children).toEqual(["S/ 100.00"]);
    // Full mode adopts the authoritative remaining amount without a reload.
    expect(screen.root.findByProps({ name: "amount" }).props.value).toBe("100");
    await act(async () => { await screen.root.findByType("form").props.onSubmit(event); });
    expect(post).toHaveBeenCalledTimes(2);
    expect(JSON.parse(post.mock.calls[1]![0].data).amount).toBe(100);
    expect(post.mock.calls[1]![0].headers.get("Idempotency-Key")).not.toBe(config.headers.get("Idempotency-Key"));
    expect(text(screen.toJSON())).toContain("Este cargo está completamente pagado");
    expect(screen.root.findAllByType("form")).toHaveLength(0);
  });

  it("bloquea dos envíos seguidos antes del re-render y hace una sola petición", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const post = vi.fn(async (config: InternalAxiosRequestConfig) => { await gate; return ok(config); });
    const screen = await renderCash(post);
    const submit = screen.root.findByType("form").props.onSubmit;
    await act(async () => {
      const first = submit(event);
      const second = submit(event);
      await Promise.resolve();
      release();
      await Promise.all([first, second]);
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]![0].headers.get("Idempotency-Key")).toBeTruthy();
  });

  it("muestra el 409, permite reintentar con la misma clave y cambia la clave al cambiar monto", async () => {
    const message = "El pago excede el saldo pendiente del cargo.";
    const post = vi.fn(async (config: InternalAxiosRequestConfig) => {
      throw new AxiosError("Conflict", "ERR_BAD_REQUEST", config, undefined, {
        status: 409, statusText: "Conflict", headers: new AxiosHeaders(), config,
        data: { error: { code: "CONFLICT", message, details: {} } },
      });
    });
    const screen = await renderCash(post);
    const submit = async () => { await act(async () => { await screen.root.findByType("form").props.onSubmit(event); }); };
    await submit();
    expect(screen.root.findByProps({ role: "alert" }).children).toEqual([message]);
    expect(screen.root.findByProps({ type: "submit" }).props.disabled).toBe(false);
    await submit();
    await act(async () => { screen.root.findByProps({ name: "amount" }).props.onChange({ target: { value: "75" } }); });
    await submit();
    expect(post).toHaveBeenCalledTimes(3);
    const keys = post.mock.calls.map(([config]) => config.headers.get("Idempotency-Key"));
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
    expect(JSON.parse(post.mock.calls[2]![0].data).amount).toBe(75);
  });
});
