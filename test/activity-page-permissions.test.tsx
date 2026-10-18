import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffIdentity } from "../src/types";

const model = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_USE_MOCKS = "false";
  return {
    identity: null as StaffIdentity | null,
    locationId: "",
    locations: vi.fn(),
    activity: vi.fn(),
    runs: vi.fn(),
  };
});
vi.mock("../src/components/PersonaContext", () => ({ usePersona: () => ({ identity: model.identity, loading: false }) }));
vi.mock("../src/components/shell/ShellContext", () => ({ useShellContext: () => ({ locationId: model.locationId }) }));
vi.mock("../src/api", async importOriginal => ({
  ...await importOriginal<typeof import("../src/api")>(),
  loadClinicLocations: model.locations,
  loadActivity: model.activity,
  loadAgentRuns: model.runs,
}));
import { ActivityPage } from "../src/views/ActivityPage";

const renderers: ReactTestRenderer[] = [];
async function render() {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(createElement(ActivityPage)); });
  renderers.push(renderer);
  return renderer;
}
const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());

describe("Rastro permissions by selected location", () => {
  beforeEach(() => {
    model.identity = {
      principalType: "human", displayName: "Recepción sintética", organizationName: "Clínica sintética",
      roles: [], permissions: [], locationPermissions: [{ locationId: 1, permissions: ["proposals.read"] }],
    };
    model.locationId = "1";
    model.locations.mockResolvedValue(new Map([[1, { id: 1, name: "Lince", timeZone: "America/Lima" }]]));
    model.activity.mockResolvedValue({ entries: [], nextCursor: null });
    model.runs.mockResolvedValue({ entries: [], hasMore: false });
  });
  afterEach(async () => {
    await act(async () => { renderers.splice(0).forEach(renderer => renderer.unmount()); });
    vi.clearAllMocks();
  });

  it.each(["1", ""])("admits a site reader in selection %j without requesting organization-wide runs", async locationId => {
    model.locationId = locationId;
    const output = text(await render());
    expect(output).toContain("Lo que pasó");
    expect(output).not.toContain("Tu rol no permite");
    expect(model.activity).toHaveBeenCalled();
    expect(model.runs).not.toHaveBeenCalled();
  });

  it("denies another site and restores access when returning to an authorized site", async () => {
    model.locationId = "2";
    const renderer = await render();
    expect(text(renderer)).toContain("Tu rol no permite");
    expect(model.activity).not.toHaveBeenCalled();
    model.locationId = "1";
    await act(async () => renderer.update(createElement(ActivityPage)));
    expect(text(renderer)).toContain("Lo que pasó");
    expect(model.activity).toHaveBeenCalled();
  });

  it.each(["1", "2", ""])("preserves organization-wide read and run history in selection %j", async locationId => {
    model.identity!.permissions = ["proposals.read"];
    model.identity!.locationPermissions = [];
    model.locationId = locationId;
    expect(text(await render())).toContain("Lo que pasó");
    expect(model.activity).toHaveBeenCalled();
    expect(model.runs).toHaveBeenCalled();
  });

  it("does not infer read permission from a role or mutation grant in Todas", async () => {
    model.locationId = "";
    model.identity!.roles = ["reception"];
    model.identity!.locationPermissions[0]!.permissions = ["proposals.decide"];
    expect(text(await render())).toContain("Tu rol no permite");
    expect(model.activity).not.toHaveBeenCalled();
    expect(model.runs).not.toHaveBeenCalled();
  });
});
