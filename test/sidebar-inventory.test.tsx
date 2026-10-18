import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppSidebar } from "../src/components/AppSidebar";

const model = vi.hoisted(() => ({ identity: { principalType: "human", displayName: "Asistente", organizationName: "Clínica", roles: [], permissions: ["products.read"] as string[], locationPermissions: [] } }));
vi.mock("../src/components/PersonaContext", () => ({ usePersona: () => model, PersonaPicker: () => null }));
vi.mock("../src/components/shell/ShellContext", () => ({ useShellContext: () => ({ role: "admin" }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/home" }));
vi.mock("../src/api", async () => ({ canOpen: (await import("../src/session")).canOpen, useMocks: false }));

describe("inventory discovery for a sede-scoped reporter", () => {
  const render = () => renderToStaticMarkup(<AppSidebar mobileOpen={false} collapsed={false} onNavigate={() => {}} onToggleCollapse={() => {}} />);
  it("shows Inventory outside the collapsed sections with only the catalogue grant", () => {
    model.identity.permissions = ["products.read"];
    const html = render();
    expect(html).toContain('href="/inventario"');
    expect(html.indexOf('href="/inventario"')).toBeLessThan(html.indexOf("<details"));
    expect(html.match(/href="\/inventario"/g)).toHaveLength(1);
    expect(html).not.toContain('href="/aprobaciones"');
  });
  it("does not infer catalogue access from a movement or proposal grant", () => {
    model.identity.permissions = ["movements.read", "proposals.read"];
    expect(render()).not.toContain('href="/inventario"');
  });
});
