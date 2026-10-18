import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppSidebar } from "../src/components/AppSidebar";
import { toStaffIdentity } from "../src/session";
import type { MeRead } from "../src/contracts/client";
import type { StaffIdentity } from "../src/types";

const model = vi.hoisted(() => ({ identity: null as StaffIdentity | null, locationId: "" }));
vi.mock("../src/components/PersonaContext", () => ({ usePersona: () => model, PersonaPicker: () => null }));
vi.mock("../src/components/shell/ShellContext", () => ({ useShellContext: () => ({ role: "admin", locationId: model.locationId }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/home" }));
vi.mock("../src/api", async () => ({ canOpen: (await import("../src/session")).canOpen, useMocks: false }));

const cashier: MeRead = {
  principal: { id: 11, type: "human", display_name: "E1 sintético · caja" },
  organization: { id: 1, name: "Clínica sintética" },
  roles: [{ code: "caja", name: "Caja" }],
  permissions: [],
  location_permissions: [{ location_id: 1, permissions: ["charges.read", "payments.manage", "proposals.read", "proposals.create", "proposals.decide"] }],
};

describe("M1 cashier discovers modules from location grants", () => {
  const render = () => renderToStaticMarkup(<AppSidebar mobileOpen={false} collapsed={false} onNavigate={() => {}} onToggleCollapse={() => {}} />);
  beforeEach(() => { model.identity = toStaffIdentity(cashier); model.locationId = "1"; });

  it("shows Caja and Bandeja for Lince with no global permissions", () => {
    const html = render();
    expect(html).toContain('href="/caja"');
    expect(html).toContain('href="/aprobaciones"');
    expect(html).not.toContain('href="/inventario"');
    expect(model.identity!.permissions).toEqual([]);
  });

  it("hides Caja and Bandeja for Miraflores and restores them on return to Lince", () => {
    model.locationId = "2";
    expect(render()).not.toContain('href="/caja"');
    expect(render()).not.toContain('href="/aprobaciones"');
    model.locationId = "1";
    expect(render()).toContain('href="/caja"');
    expect(render()).toContain('href="/aprobaciones"');
  });

  it("shows modules in Todas when at least one location grants their read", () => {
    model.locationId = "";
    expect(render()).toContain('href="/caja"');
    expect(render()).toContain('href="/aprobaciones"');
  });

  it("does not infer reads from role labels or mutation grants", () => {
    model.identity!.locationPermissions[0]!.permissions = ["payments.manage", "proposals.decide"];
    expect(render()).not.toContain('href="/caja"');
    expect(render()).not.toContain('href="/aprobaciones"');
  });

  it("hides modules after grants are removed or the session is cleared", () => {
    model.identity!.locationPermissions = [];
    expect(render()).not.toContain('href="/caja"');
    expect(render()).not.toContain('href="/aprobaciones"');
    model.identity = null;
    expect(render()).not.toContain('href="/caja"');
    expect(render()).not.toContain('href="/aprobaciones"');
  });

  it("keeps organization-wide reads available at every site", () => {
    model.locationId = "2";
    model.identity!.permissions = ["charges.read", "proposals.read", "products.read", "patients.read"];
    const html = render();
    for (const path of ["/caja", "/aprobaciones", "/inventario", "/pacientes"]) expect(html).toContain(`href="${path}"`);
  });
});
