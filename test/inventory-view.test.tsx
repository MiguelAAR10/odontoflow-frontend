import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer, type ReactTestRendererJSON } from "react-test-renderer";
import { AxiosError, AxiosHeaders, type AxiosAdapter } from "axios";

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

  it("oculta productos y controles si la lectura del balance devuelve 403", async () => {
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
    expect(content).not.toContain("Unidades en");
    expect(screen.root.findAllByType("table")).toHaveLength(0);
    expect(screen.root.findAllByType("button")).toHaveLength(0);
  });
});
