/**
 * Patients adapter unit tests — pure view-model mapping (no network).
 */
import { describe, expect, it } from "vitest";
import { toUiPatient } from "../src/api";

describe("toUiPatient", () => {
  it("maps the backend patient into the UI view model", () => {
    const view = toUiPatient({
      id: 7,
      full_name: "Ana Torres",
      dni: "12345678",
      sexo: "F",
      phone: "+51999000099",
      birth_date: null,
    });
    expect(view.id).toBe("7");
    expect(view.name).toBe("Ana Torres");
    expect(view.initials).toBe("AT");
    expect(view.dni).toBe("12345678");
    expect(view.phone).toBe("+51999000099");
    expect(view.status).toBe("Activo");
    expect(view.branch).toBe("");
  });

  it("tolerates missing optional fields", () => {
    const view = toUiPatient({
      id: 8,
      full_name: "Juan",
      dni: null,
      sexo: null,
      phone: null,
      birth_date: null,
    });
    expect(view.dni).toBe("");
    expect(view.phone).toBe("");
  });
});
