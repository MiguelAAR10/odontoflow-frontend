import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer, type ReactTestRendererJSON } from "react-test-renderer";
import { AxiosError, AxiosHeaders, type AxiosAdapter } from "axios";

vi.mock("../src/components/PersonaContext", () => ({ usePersona: () => ({ version: 1, identity: { principalType: "human", permissions: ["products.read"] } }) }));

describe("Inventario en modo real", () => {
  let client: typeof import("../src/contracts/client");
  let InventoryPage: typeof import("../src/views/InventoryPage")["InventoryPage"];
  let originalAdapter: typeof client.http.defaults.adapter;
  let view: ReactTestRenderer | undefined;

  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false");
    client = await import("../src/contracts/client");
    originalAdapter = client.http.defaults.adapter;
    ({ InventoryPage } = await import("../src/views/InventoryPage"));
  });
  afterEach(async () => {
    await act(async () => { view?.unmount(); });
    view = undefined;
    client.http.defaults.adapter = originalAdapter;
    vi.unstubAllGlobals();
  });
  afterAll(() => { vi.unstubAllEnvs(); });

  async function renderInventory(adapter: AxiosAdapter) {
    client.http.defaults.adapter = adapter;
    await act(async () => { view = create(createElement(InventoryPage)); });
    return view!;
  }

  function text(node: ReactTestRendererJSON | ReactTestRendererJSON[] | string | null): string {
    if (node === null) return "";
    if (typeof node === "string") return node;
    if (Array.isArray(node)) return node.map(text).join(" ");
    return (node.children ?? []).map(text).join(" ");
  }

  it("muestra Sin acceso al entrar directamente con un 403, sin ceros ni controles de mutación", async () => {
    const screen = await renderInventory(async (config) => {
      if (config.url === "/products") {
        throw new AxiosError("Forbidden", "ERR_BAD_REQUEST", config, undefined, {
          status: 403, statusText: "Forbidden", headers: new AxiosHeaders(), config,
          data: { error: { code: "PERMISSION_DENIED", message: "The principal is not authorized to perform this action.", details: {} } },
        });
      }
      return { status: 200, statusText: "OK", headers: new AxiosHeaders(), config, data: [] };
    });

    const content = text(screen.toJSON());
    expect(content).toContain("Sin acceso");
    expect(content).toContain("Tu rol no permite acceder al inventario.");
    expect(content).not.toContain("No hay productos registrados");
    expect(content).not.toContain("Nuevo producto");
    expect(content).not.toContain("Unidades en stock");
    expect(content).not.toContain("0 productos");
    expect(content).not.toContain("The principal");
    expect(screen.root.findAllByType("table")).toHaveLength(0);
    expect(screen.root.findAllByType("button")).toHaveLength(0);
    expect(screen.root.findAllByType("select")).toHaveLength(0);
    expect(screen.root.findAllByProps({ role: "alert" })).toHaveLength(1);
  });

  it("conserva la lista vacía legítima y Nuevo producto cuando el backend responde 200", async () => {
    const screen = await renderInventory(async (config) => ({
      status: 200, statusText: "OK", headers: new AxiosHeaders(), config, data: [],
    }));

    const content = text(screen.toJSON());
    expect(content).toContain("No hay productos registrados");
    expect(content).toContain("Nuevo producto");
    expect(content).not.toContain("Sin acceso");
    expect(screen.root.findAllByType("table")).toHaveLength(1);
    expect(screen.root.findAllByProps({ role: "alert" })).toHaveLength(0);
  });

  it("oculta saldos denegados pero conserva el selector de sede y el reintento", async () => {
    const screen = await renderInventory(async (config) => {
      if (config.url?.endsWith("/balance")) {
        throw new AxiosError("Forbidden", "ERR_BAD_REQUEST", config, undefined, {
          status: 403, statusText: "Forbidden", headers: new AxiosHeaders(), config,
          data: { error: { code: "PERMISSION_DENIED", message: "Forbidden", details: {} } },
        });
      }
      const data = config.url === "/products"
        ? [{ id: 1, name: "Resina", unit: "unidades", kind: "consumible", is_active: true }]
        : [{ id: 1, name: "Lince", timezone: "America/Lima", is_active: true }];
      return { status: 200, statusText: "OK", headers: new AxiosHeaders(), config, data };
    });

    const content = text(screen.toJSON());
    expect(content).toContain("Sin acceso");
    expect(content).not.toContain("Resina");
    expect(content).toContain("Elige otra sede o reintenta");
    expect(screen.root.findAllByType("table")).toHaveLength(0);
    expect(screen.root.findByProps({ "aria-label": "Sede" }).props.disabled).toBe(false);
    expect(screen.root.findAllByType("button").some(button => button.children.includes("Reintentar"))).toBe(true);
    expect(content).not.toMatch(/0\s+unidades/);
  });

  it("recupera el flujo completo: catálogo legible, Jesús María 403, elegir Lince y abrir conteo", async () => {
    const balanceSedes: number[] = [];
    const countReads: unknown[] = [];
    const screen = await renderInventory(async config => {
      let data: unknown;
      if (config.url === "/products") data = [{ id: 1, name: "Resina", unit: "unidades", kind: "consumible", is_active: true }];
      else if (config.url === "/locations") data = [
        { id: 1, name: "Jesús María", timezone: "America/Lima", is_active: true },
        { id: 2, name: "Lince", timezone: "America/Lima", is_active: true },
      ];
      else if (config.url === "/products/1/balance") {
        balanceSedes.push(config.params.location_id);
        if (config.params.location_id === 1) throw new AxiosError("Forbidden", "ERR_BAD_REQUEST", config, undefined, {
          status: 403, statusText: "Forbidden", headers: new AxiosHeaders(), config,
          data: { error: { code: "PERMISSION_DENIED", message: "Forbidden", details: {} } },
        });
        data = { product_id: 1, location_id: 2, available: "12.00" };
      } else if (config.url === "/inventory/count-context") {
        countReads.push(config.params);
        data = { product: { id: 1, name: "Resina", unit: "unidades" }, location: { id: 2, name: "Lince" }, balance: "12.00", ledger_version: "ledger-lince", open_count_proposal_id: null };
      } else throw new Error(`Unexpected endpoint: ${config.url}`);
      return { status: 200, statusText: "OK", headers: new AxiosHeaders(), config, data };
    });
    expect(balanceSedes).toEqual([1]); // No guessing or probing the person's allowed sedes.
    expect(text(screen.toJSON())).toContain("Sin acceso a esta sede");
    const selector = screen.root.findByProps({ "aria-label": "Sede" });
    expect(selector.props.disabled).toBe(false);
    await act(async () => { selector.props.onChange({ target: { value: "2" } }); });
    expect(balanceSedes).toEqual([1, 2]);
    expect(text(screen.toJSON())).toContain("Stock en Lince");
    expect(text(screen.toJSON())).toMatch(/12\s+unidades/);
    expect(screen.root.findAllByProps({ role: "alert" })).toHaveLength(0);

    // Render the real modal and draft; only the browser focus APIs are supplied.
    vi.stubGlobal("document", { activeElement: null, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal("HTMLElement", class {});
    await act(async () => { screen.root.findAllByType("button").find(button => button.children.includes("Revisar conteo con AIRI"))!.props.onClick(); });
    expect(countReads).toEqual([{ product_id: 1, location_id: 2 }]);
    expect(text(screen.toJSON())).toContain("12.00");
    const dialog = screen.root.findByProps({ role: "dialog" });
    act(() => {
      dialog.findByType("input").props.onChange({ target: { value: "10" } });
      dialog.findByType("textarea").props.onChange({ target: { value: "Conteo de cierre en Lince" } });
    });
    expect(dialog.findAllByType("button").find(button => button.children.includes("Preparar propuesta de conteo"))!.props.disabled).toBe(false);
  });
});
