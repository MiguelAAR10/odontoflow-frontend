import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from "axios";

vi.mock("../src/components/useFocusTrap", () => ({ useFocusTrap: () => {} }));
const charge = {
  id: 7, service_execution_id: 42, amount: "250.00", paid: "120.00", outstanding: "130.00",
  created_at: "2026-10-13T14:15:00Z", visit_id: 5, patient_id: 9, patient_name: "Paciente real",
  service_id: 3, service_name: "Evaluación", location_id: 2, location_name: "Sede real",
  practitioner_id: 1, practitioner_name: "Doctora real", executed_at: "2026-10-13T14:00:00Z",
};
const payment = {
  id: 1, charge_id: 7, amount: "120.00", method: "yape", paid_at: "2026-10-13T14:15:00Z",
  reference: "OP-123", receiver: "Cuenta real", reconciliation_note: null,
  verification_status: "unverified", verified_at: null, reversed: false,
};

describe("Caja: cotejo por contrato real", () => {
  let client: typeof import("../src/contracts/client");
  let CashPage: typeof import("../src/views/CashPage")["CashPage"];
  let adapter: typeof client.http.defaults.adapter;
  let view: ReactTestRenderer;
  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false");
    client = await import("../src/contracts/client");
    adapter = client.http.defaults.adapter;
    ({ CashPage } = await import("../src/views/CashPage"));
  });
  afterEach(async () => { await act(async () => view?.unmount()); client.http.defaults.adapter = adapter; });
  afterAll(() => vi.unstubAllEnvs());

  async function render(verify: (config: InternalAxiosRequestConfig) => Promise<typeof payment>,
    chargeRow = charge, paymentRows = [payment]) {
    client.http.defaults.adapter = async config => {
      let data: unknown;
      if (config.method === "post") data = await verify(config);
      else if (config.url === "/charges") data = [chargeRow];
      else if (config.url === "/locations") data = [{ id: 2, name: "Sede real", timezone: "America/Lima", is_active: true }];
      else if (config.url === "/charges/7/payments" || config.url === "/payments") data = paymentRows;
      else throw new Error(`Unexpected endpoint ${config.url}`);
      return { status: 200, statusText: "OK", headers: new AxiosHeaders(), config, data };
    };
    await act(async () => { view = create(createElement(CashPage)); });
  }
  const click = async (label: string) => act(async () => {
    view.root.findAllByType("button").find(button => button.children.includes(label))!.props.onClick();
  });
  const kpis = () => view.root.findAllByProps({ className: "kpi-card__copy" }).map(node => node.findByType("strong").children.join(""));

  it("oculta corte y propuestas sin endpoint, y solo mueve el abono tras respuesta verificada", async () => {
    let resolve!: (value: typeof payment) => void;
    const verify = vi.fn((config: InternalAxiosRequestConfig) => new Promise<typeof payment>(done => { resolve = done; }));
    await render(verify);
    expect(view.root.findAllByProps({ className: "cash-cut" })).toHaveLength(0);
    expect(JSON.stringify(view.toJSON())).not.toContain("p-yape");
    expect(JSON.stringify(view.toJSON())).not.toContain("p-caja");
    expect(kpis().slice(0, 2)).toEqual(["S/ 0.00", "S/ 120.00"]);
    await click("Conciliación");
    await click("Verificar");
    expect(verify).not.toHaveBeenCalled();
    let pending!: Promise<void>;
    await act(async () => { pending = view.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify.mock.calls[0]![0].url).toBe("/payments/1/verify");
    expect(verify.mock.calls[0]![0].headers.get("Idempotency-Key")).toBeTruthy();
    await act(async () => { resolve({ ...payment, verification_status: "verified" }); await pending; });
    await click("Cobros");
    expect(kpis().slice(0, 2)).toEqual(["S/ 120.00", "S/ 0.00"]);
    expect(JSON.stringify(view.toJSON())).toContain("S/ 130.00");
  });

  it.each(["verified", "unverified"])("excluye una reversa %s recibida del backend y conserva los importes del cargo", async verification_status => {
    const reversed = { ...payment, verification_status, reversed: true };
    await render(vi.fn(), { ...charge, paid: "0.00", outstanding: "250.00" }, [reversed]);
    const { loadCharges, loadReconciliationPayments } = await import("../src/api");
    const [loaded] = await loadCharges();
    expect(loaded!.payments[0]!.reversed).toBe(true);
    expect((await loadReconciliationPayments())[0]!.reversed).toBe(true);
    expect(loaded).toMatchObject({ paid: 0, outstanding: 250 });
    expect(kpis().slice(0, 2)).toEqual(["S/ 0.00", "S/ 0.00"]);
  });

  it("suma pagos vigentes junto a reversas sin descontarlas dos veces", async () => {
    await render(vi.fn(), { ...charge, paid: "80.00", outstanding: "170.00" }, [
      { ...payment, reversed: true, verification_status: "verified" },
      { ...payment, id: 2, reversed: true },
      { ...payment, id: 3, amount: "50.00", verification_status: "verified" },
      { ...payment, id: 4, amount: "30.00" },
    ]);
    expect(kpis().slice(0, 2)).toEqual(["S/ 50.00", "S/ 30.00"]);
  });

  it("un rechazo no mueve el abono; el reintento conserva Idempotency-Key", async () => {
    const verify = vi.fn(async (config: InternalAxiosRequestConfig): Promise<typeof payment> => {
      throw new AxiosError("Conflict", "ERR_BAD_REQUEST", config, undefined, {
        status: 409, statusText: "Conflict", headers: new AxiosHeaders(), config,
        data: { error: { code: "CONFLICT", message: "El movimiento cambió." } },
      });
    });
    await render(verify);
    await click("Conciliación");
    await click("Verificar");
    for (let i = 0; i < 2; i++) await act(async () => {
      await view.root.findByType("form").props.onSubmit({ preventDefault() {} });
    });
    const keys = verify.mock.calls.map(([config]) => config.headers.get("Idempotency-Key"));
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(JSON.stringify(view.toJSON())).toContain("El movimiento cambió.");
    await act(async () => view.root.findAllByProps({ 'aria-label': "Cerrar modal" })[0]!.props.onClick());
    await click("Cobros");
    expect(kpis().slice(0, 2)).toEqual(["S/ 0.00", "S/ 120.00"]);
  });
});
