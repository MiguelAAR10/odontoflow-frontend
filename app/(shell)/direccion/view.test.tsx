import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import snapshot from "../../../src/agui/sim/fixtures/state.json";

const config = vi.hoisted(() => ({ mocks: false, state: {} as unknown }));
vi.mock("../../../src/api", () => ({ get useMocks() { return config.mocks; }, toApiError: (e: Error) => ({ message: e.message }) }));
vi.mock("../../../src/agui/useAgent", () => ({ useAgent: () => ({ worldState: config.state, working: false, send: vi.fn() }) }));
vi.mock("../../../src/components/shell/ShellContext", () => ({ useShellContext: () => ({ role: "dueno" }) }));
vi.mock("../../../src/home/PendingDecisions", () => ({ PendingDecisions: () => null }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.PropsWithChildren) => <a {...props}>{children}</a> }));
import { DireccionPage } from "../../../src/views/DireccionPage";

async function render() {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<DireccionPage />); });
  return { tree, text: JSON.stringify(tree.toJSON()) };
}
describe("Dirección: origen de datos", () => {
  it("no muestra fixtures ni ceros inventados en modo real sin snapshot", async () => {
    config.mocks = false; config.state = {};
    const { tree, text } = await render();
    expect(text).toContain("Todavía no hay datos");
    expect(text).not.toContain("S/ 6,240.00");
    expect(text).not.toContain("S/ 0.00");
    tree.unmount();
  });
  it("un corte sin sedes no fabrica importes en cero", async () => {
    config.mocks = false; config.state = { ...snapshot[0], sedes: [] };
    const { tree, text } = await render();
    expect(text).not.toContain("S/ 0.00");
    expect(text).toContain("Todavía no hay datos");
    tree.unmount();
  });
  it("consume el snapshot real y preserva la ausencia de capacidad", async () => {
    config.mocks = false; config.state = snapshot[0];
    const { tree, text } = await render();
    expect(text).toContain("S/ 6,240.00");
    expect(text).toContain("Sin capacidad publicada");
    expect(text).toContain("Sin datos de caja desde 12:40");
    expect(text).not.toContain("Datos de demostración");
    tree.unmount();
  });
  it("un snapshot inválido no recupera datos simulados", async () => {
    config.mocks = true; config.state = { cut_at: "invalid" };
    const { tree, text } = await render();
    expect(text).toContain("El corte recibido no es válido");
    expect(text).not.toContain("S/ 6,240.00");
    tree.unmount();
  });
});
