/**
 * Patients E2E proof: the real frontend adapter against a live FastAPI +
 * PostgreSQL backend with VITE_USE_MOCKS=false — no mockData in this path.
 *
 * Requires: backend up at VITE_BACKEND_URL with the migrated schema.
 */
import { beforeAll, describe, expect, it } from "vitest";

const BACKEND_URL = process.env.VITE_BACKEND_URL ?? "http://127.0.0.1:8010";

let api: typeof import("../src/api");
let client: typeof import("../src/contracts/client");

beforeAll(async () => {
  process.env.VITE_USE_MOCKS = "false";
  process.env.VITE_BACKEND_URL = BACKEND_URL;
  api = await import("../src/api");
  client = await import("../src/contracts/client");
  if (api.useMocks) throw new Error("E2E must run with VITE_USE_MOCKS=false");
});

describe("Patients ↔ FastAPI ↔ PostgreSQL (no mocks)", () => {
  it("lists real patients through the UI adapter", async () => {
    const view = await api.loadPatients();
    expect(Array.isArray(view)).toBe(true);
    // Every row comes from the backend view model mapping.
    for (const patient of view) {
      expect(patient.id).toMatch(/^\d+$/);
      expect(patient.name.length).toBeGreaterThan(0);
    }
  });

  it("creates a patient with Idempotency-Key and replays exactly once", async () => {
    const dni = String(10000000 + Math.floor(Math.random() * 89999999));
    const key = client.newIdempotencyKey();

    const first = await api.createPatient({
      name: "Paciente E2E",
      dni,
      phone: "+51999000001",
      branch: "Lince",
      status: "Activo",
      nextAppointment: "Sin cita",
      treatment: "Por definir",
      origin: "Registro manual",
      interest: "Por validar",
      idempotencyKey: key,
    });
    expect(first.name).toBe("Paciente E2E");
    expect(first.id).toMatch(/^\d+$/);

    const replay = await api.createPatient({
      name: "Paciente E2E",
      dni,
      phone: "+51999000001",
      branch: "Lince",
      status: "Activo",
      nextAppointment: "Sin cita",
      treatment: "Por definir",
      origin: "Registro manual",
      interest: "Por validar",
      idempotencyKey: key,
    });
    expect(replay.id).toBe(first.id); // exactly-once

    const listed = await api.loadPatients();
    const matches = listed.filter((patient) => patient.dni === dni);
    expect(matches.length).toBe(1); // no duplicate patient
  });

  it("maps the backend error envelope for an invalid patient", async () => {
    const error = await api
      .createPatient({
        name: "Invalido",
        dni: "123", // not 8 digits
        phone: "",
        branch: "",
        status: "Activo",
        nextAppointment: "",
        treatment: "",
        origin: "",
        interest: "",
        idempotencyKey: client.newIdempotencyKey(),
      })
      .then(() => null)
      .catch((caught) => api.toApiError(caught));
    expect(error).not.toBeNull();
    expect(error!.code).toBe("INVALID_INPUT");
    expect(error!.httpStatus).toBe(422);
  });
});
