import { describe, expect, it } from "vitest";
import { canAccessClinicalVisit, canAccessPath, canReadClinicalRecord, capabilitiesForRole } from "../src/roles.js";

describe("role route scope", () => {
  it("keeps clinical record URLs reachable for an explicit access explanation", () => {
    expect(canAccessPath("admin", "/visitas/visit-ana")).toBe(true);
    expect(canAccessPath("collaborator", "/visitas/visit-ana")).toBe(true);
    expect(canAccessPath("owner", "/visitas/visit-ana")).toBe(false);
  });

  it("keeps future user administration outside the demo B routes", () => {
    expect(canAccessPath("owner", "/administracion")).toBe(false);
  });
});

describe("clinical visit demo scope", () => {
  it("limits the Doctor to visits assigned to their practitioner id", () => {
    expect(canAccessClinicalVisit("collaborator", "valeria", "valeria")).toBe(true);
    expect(canAccessClinicalVisit("collaborator", "valeria", "mateo")).toBe(false);
    expect(canAccessClinicalVisit("collaborator", null, "valeria")).toBe(false);
  });

  it("does not apply the Doctor-only restriction to Owner or Administrative", () => {
    expect(canAccessClinicalVisit("owner", null, "mateo")).toBe(true);
    expect(canAccessClinicalVisit("admin", null, "mateo")).toBe(true);
  });
});

describe("clinical record privacy", () => {
  it("shows a note only to its assigned Doctor", () => {
    expect(canReadClinicalRecord("collaborator", "valeria", "valeria")).toBe(true);
    expect(canReadClinicalRecord("collaborator", "valeria", "mateo")).toBe(false);
    expect(canReadClinicalRecord("collaborator", null, "valeria")).toBe(false);
    expect(canReadClinicalRecord("admin", null, "valeria")).toBe(false);
    expect(canReadClinicalRecord("owner", null, "valeria")).toBe(false);
    expect(capabilitiesForRole("owner")).not.toContain("clinical_records.read");
  });
});
