/**
 * Agenda adapter unit tests — pure view-model mapping (no network).
 */
import { describe, expect, it } from "vitest";
import { agendaDateKey, agendaWeekReadWindow, toApiError, toGridSlot, toUiStatus } from "../src/api";
import { ApiError } from "../src/contracts/client";

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
  it("maps the backend states into the agenda vocabulary", () => {
    expect(toUiStatus("confirmed")).toBe("Confirmada");
    expect(toUiStatus("cancelled")).toBe("Cancelada");
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
