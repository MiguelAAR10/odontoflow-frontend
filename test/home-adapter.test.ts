import { describe, expect, it } from "vitest";
import { toUiPatientSearch } from "../src/api";

describe("Home PatientSearch adapter", () => {
  it("maps only canonical patient identity fields", () => {
    const view = toUiPatientSearch({
      id: 7,
      full_name: "Ana Torres",
      dni: "74859632",
      phone: "+51 987 654 321",
    });

    expect(view).toEqual({
      id: "7",
      name: "Ana Torres",
      dni: "74859632",
      phone: "+51 987 654 321",
    });
    expect(view).not.toHaveProperty("branch");
    expect(view).not.toHaveProperty("nextAppointment");
    expect(view).not.toHaveProperty("status");
  });

  it("preserves absent canonical contact fields as null", () => {
    expect(toUiPatientSearch({ id: 8, full_name: "Juan", dni: null, phone: null })).toEqual({
      id: "8",
      name: "Juan",
      dni: null,
      phone: null,
    });
  });
});
