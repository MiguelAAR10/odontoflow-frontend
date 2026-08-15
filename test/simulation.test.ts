import { describe, expect, it } from "vitest";
import {
  AppointmentAgenda,
  SimulatedCalendarService,
  SimulatedCallService,
  SimulatedWhatsAppService,
  SimulationClock,
} from "../src/index.js";

const sessionId = "50000000-0000-4000-8000-000000000001";

function fixture() {
  const clock = new SimulationClock(new Date("2026-08-11T08:55:00-05:00"));
  const calendar = new SimulatedCalendarService();
  const agenda = new AppointmentAgenda(calendar, clock);
  return { clock, calendar, agenda };
}

describe("simulation clock", () => {
  it("advances virtual time without reading the server clock", () => {
    const clock = new SimulationClock(new Date("2026-08-11T08:55:00-05:00"));
    expect(clock.advanceBy(5 * 60_000).toISOString()).toBe("2026-08-11T14:00:00.000Z");
    expect(() => clock.advanceBy(-1)).toThrow(/non-negative/);
  });
});

describe("simulated appointment agenda", () => {
  it("creates one calendar event and one appointment idempotently", () => {
    const { agenda, calendar } = fixture();
    const input = {
      idempotencyKey: "demo-create-1",
      simulationSessionId: sessionId,
      patientId: "patient-fake",
      branchId: "branch-fake",
      doctorId: "doctor-fake",
      title: "Cita ficticia",
      startsAt: new Date("2026-08-12T10:00:00-05:00"),
      endsAt: new Date("2026-08-12T11:00:00-05:00"),
    };

    const first = agenda.create(input);
    const repeated = agenda.create(input);

    expect(repeated.id).toBe(first.id);
    expect(repeated.calendarEventId).toBe(first.calendarEventId);
    expect(calendar.listUpcoming(sessionId, new Date("2026-08-11T00:00:00-05:00"))).toHaveLength(1);
    expect(agenda.history(first.id)).toHaveLength(1);
  });

  it("modifies and cancels the appointment and its simulated event together", () => {
    const { agenda, calendar } = fixture();
    const appointment = agenda.create({
      idempotencyKey: "demo-create-2",
      simulationSessionId: sessionId,
      patientId: "patient-fake",
      branchId: "branch-fake",
      doctorId: "doctor-fake",
      title: "Cita ficticia",
      startsAt: new Date("2026-08-12T10:00:00-05:00"),
      endsAt: new Date("2026-08-12T11:00:00-05:00"),
    });

    const moved = agenda.modify(appointment.id, {
      startsAt: new Date("2026-08-12T12:00:00-05:00"),
      endsAt: new Date("2026-08-12T13:00:00-05:00"),
    });
    expect(moved.startsAt.toISOString()).toBe("2026-08-12T17:00:00.000Z");

    const cancelled = agenda.cancel(appointment.id, "Cancelación ficticia");
    expect(cancelled.appointmentStatus).toBe("CANCELLED");
    expect(cancelled.followupStatus).toBe("CLOSED");
    expect(calendar.get(appointment.calendarEventId)?.status).toBe("CANCELLED");
    expect(agenda.upcoming(sessionId)).toHaveLength(0);
    expect(agenda.history(appointment.id)).toHaveLength(2);
  });
});

describe("simulated contact adapters", () => {
  it("deduplicates WhatsApp sends and call attempts", () => {
    const clock = new SimulationClock(new Date("2026-08-11T09:00:00-05:00"));
    const whatsapp = new SimulatedWhatsAppService(clock);
    const calls = new SimulatedCallService(clock);
    const whatsappInput = {
      idempotencyKey: "appointment-1:DAY_BEFORE_09AM",
      appointmentId: "appointment-1",
      attemptType: "DAY_BEFORE_09AM" as const,
      template: "confirmation_request",
    };
    const callInput = {
      idempotencyKey: "appointment-1:DAY_BEFORE_CALL_12PM",
      appointmentId: "appointment-1",
      attemptType: "DAY_BEFORE_CALL_12PM" as const,
    };

    expect(whatsapp.send(whatsappInput).id).toBe(whatsapp.send(whatsappInput).id);
    expect(calls.place(callInput).id).toBe(calls.place(callInput).id);
  });
});
