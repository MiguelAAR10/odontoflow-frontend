/**
 * Agenda adapter unit tests — pure view-model mapping (no network).
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { agendaDateKey, agendaWeekReadWindow, toApiError, toGridSlot, toUiAppointment, toUiStatus } from "../src/api";
import { ApiError, type AppointmentListItem } from "../src/contracts/client";
import { Badge, statusTone } from "../src/components/Badge";

describe("toGridSlot", () => {
  it("uses the selected clinic's day for Hoy across UTC midnight", () => {
    expect(agendaDateKey("2026-10-05T00:30:00Z", "America/Lima")).toBe("2026-10-04");
    expect(agendaDateKey("2026-10-05T00:30:00Z", "Asia/Tokyo")).toBe("2026-10-05");
  });

  it("queries a week bounded by local midnight instead of a fixed UTC offset", () => {
    expect(agendaWeekReadWindow("2026-10-04", "America/Lima")).toEqual({ from: "2026-09-28T05:00:00.000Z", to: "2026-10-05T05:00:00.000Z" });
    expect(agendaWeekReadWindow("2026-11-01", "America/New_York")).toEqual({ from: "2026-10-26T04:00:00.000Z", to: "2026-11-02T05:00:00.000Z" });
  });
  it("maps a UTC instant to the Lima weekday slot (Mon=0)", () => {
    // 2026-08-10 14:00 UTC == Monday 09:00 Lima
    const slot = toGridSlot("2026-08-10T14:00:00Z", "America/Lima");
    expect(slot).toEqual({ day: 0, time: "09:00" });
  });

  it("maps Saturday and keeps the grid bounds", () => {
    // 2026-08-15 14:00 UTC == Saturday 09:00 Lima
    const slot = toGridSlot("2026-08-15T14:00:00Z", "America/Lima");
    expect(slot).toEqual({ day: 5, time: "09:00" });
  });

  it("handles the 30-minute slot", () => {
    const slot = toGridSlot("2026-08-10T14:30:00Z", "America/Lima");
    expect(slot).toEqual({ day: 0, time: "09:30" });
  });
});

describe("toUiStatus", () => {
  // AppointmentRead/ListItem expose state as string in OpenAPI. These four
  // states are enforced by the backend's ck_appointments_state constraint.
  const states = [
    ["confirmed", "Confirmada", "green"],
    ["cancelled", "Cancelada", "red"],
    ["completed", "Atendida", "green"],
    ["no_show", "Ausente", "red"],
  ] as const;

  it.each(states)("labels backend state %s as %s", (state, label) => {
    expect(toUiStatus(state)).toBe(label);
  });

  it.each(states)("preserves backend state %s in the agenda view model", (state, label) => {
    const row: AppointmentListItem = {
      id: 1, lead_id: 2, service_id: 3, practitioner_id: 4, location_id: 5,
      start_utc: "2026-10-05T14:00:00Z", end_utc: "2026-10-05T14:30:00Z",
      state, version: 1, lead_name: "Paciente prueba", service_name: "Evaluación",
      practitioner_name: "Dra. Prueba", location_name: "Sede prueba",
    };
    expect(toUiAppointment(row, new Map([[5, "America/Lima"]])).status).toBe(label);
  });

  it.each(states)("renders the %s agenda badge with %s and semantic tone %s", (state, label, tone) => {
    const status = toUiStatus(state);
    expect(statusTone(status)).toBe(tone);
    expect(renderToStaticMarkup(createElement(Badge, { tone: statusTone(status), children: status })))
      .toBe(`<span class="badge badge--${tone}">${label}</span>`);
  });

  it("preserves the existing fallback for an unrecognized state", () => {
    expect(toUiStatus("unknown")).toBe("Por confirmar");
    expect(statusTone(toUiStatus("unknown"))).toBe("amber");
  });
});

describe("toApiError", () => {
  it("passes ApiError through unchanged", () => {
    const error = new ApiError(409, "SLOT_BLOCKED", "El horario no está disponible.");
    expect(toApiError(error)).toBe(error);
  });

  it("parses the backend envelope from an Axios-like error", () => {
    const axiosLike = {
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          error: { code: "APPOINTMENT_CONFLICT", message: "El horario ya no está disponible.", details: {} },
        },
      },
    };
    const mapped = toApiError(axiosLike);
    expect(mapped).toBeInstanceOf(ApiError);
    expect(mapped.code).toBe("APPOINTMENT_CONFLICT");
    expect(mapped.httpStatus).toBe(409);
  });

  it("falls back to a connection error for network failures", () => {
    const mapped = toApiError({ isAxiosError: true, response: undefined });
    expect(mapped.code).toBe("NETWORK");
  });
});

it("preserves patient confirmation separately from reservation state and never invents an appointment version", () => {
  const row = { id: 9, lead_id: 2, service_id: 3, practitioner_id: 4, location_id: 5,
    start_utc: "2026-10-20T14:00:00Z", end_utc: "2026-10-20T14:30:00Z", state: "confirmed",
    lead_name: "Paciente sintético", service_name: "Evaluación", practitioner_name: "Profesional", location_name: "Lince",
    patient_confirmed_at: "2026-10-19T15:00:00Z", version: 2 };
  const mapped = toUiAppointment(row, new Map());
  expect(mapped.status).toBe("Confirmada");
  expect(mapped.patientConfirmedAt).toBe(row.patient_confirmed_at);
  expect(mapped.version).toBe(2);
  const rescheduled = { ...row, patient_confirmed_at: null, version: 3 };
  expect(toUiAppointment(rescheduled, new Map()).patientConfirmedAt).toBeNull();
});
