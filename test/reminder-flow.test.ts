import { beforeEach, describe, expect, it } from "vitest";
import type { SimulationAppointment } from "../src/domain/types.js";
import {
  InMemorySimulationRepository,
  ReminderScheduler,
  SimulatedEventProcessor,
  SimulationClock,
} from "../src/index.js";

const sessionId = "session-fictitious";
const appointmentId = "appointment-fictitious";

let clock: SimulationClock;
let repository: InMemorySimulationRepository;
let scheduler: ReminderScheduler;
let events: SimulatedEventProcessor;

beforeEach(() => {
  clock = new SimulationClock(new Date("2026-08-10T08:55:00-05:00"));
  repository = new InMemorySimulationRepository([appointmentFixture()]);
  scheduler = new ReminderScheduler(repository, clock);
  events = new SimulatedEventProcessor(repository, clock);
});

describe("mandatory reminder scenarios", () => {
  it("A: creates the simulated day-before message at 09:00", async () => {
    await scheduler.run(sessionId);
    expect(await repository.listWhatsAppMessages(sessionId)).toHaveLength(0);

    clock.advanceMinutes(5);
    await scheduler.run(sessionId);

    const messages = await repository.listWhatsAppMessages(sessionId);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.attemptType).toBe("DAY_BEFORE_09AM");
    expect(messages[0]?.status).toBe("DELIVERED_SIMULATED");
  });

  it("B: creates a required call at 12:00 when there is no response", async () => {
    clock.setTime(new Date("2026-08-10T12:00:00-05:00"));
    await scheduler.run(sessionId);

    const calls = await repository.listCallAttempts(sessionId);
    expect(calls.map(call => call.attemptType)).toContain("DAY_BEFORE_CALL_12PM");
    expect((await repository.getAppointment(appointmentId))?.followupStatus).toBe("CALL_REQUIRED");
  });

  it("C: creates a second call attempt at 16:00 when still pending", async () => {
    clock.setTime(new Date("2026-08-10T16:00:00-05:00"));
    await scheduler.run(sessionId);

    const calls = await repository.listCallAttempts(sessionId);
    expect(calls).toHaveLength(2);
    expect(calls.map(call => call.attemptType)).toContain("DAY_BEFORE_CALL_04PM");
  });

  it("D: stops later escalation attempts after patient confirmation", async () => {
    clock.setTime(new Date("2026-08-10T09:00:00-05:00"));
    await scheduler.run(sessionId);
    const message = (await repository.listWhatsAppMessages(sessionId))[0];
    if (!message) throw new Error("Expected simulated message");
    await events.processWhatsAppResponse({ eventId: "event-confirm", messageId: message.id, action: "CONFIRM" });

    clock.setTime(new Date("2026-08-11T16:00:00-05:00"));
    await scheduler.run(sessionId);

    expect(await repository.listCallAttempts(sessionId)).toHaveLength(0);
    expect(await repository.listWhatsAppMessages(sessionId)).toHaveLength(3);
    expect((await repository.getAppointment(appointmentId))?.appointmentStatus).toBe("CONFIRMED");
  });

  it("E: sends no later reminders after cancellation", async () => {
    const message = await initialMessage();
    await events.processWhatsAppResponse({ eventId: "event-cancel", messageId: message.id, action: "CANCEL" });
    clock.setTime(new Date("2026-08-11T16:00:00-05:00"));
    await scheduler.run(sessionId);

    expect(await repository.listCallAttempts(sessionId)).toHaveLength(0);
    expect((await repository.getAppointment(appointmentId))?.appointmentStatus).toBe("CANCELLED");
  });

  it("F: updates follow-up when rescheduling is requested", async () => {
    const message = await initialMessage();
    await events.processWhatsAppResponse({
      eventId: "event-reschedule",
      messageId: message.id,
      action: "REQUEST_RESCHEDULE",
    });

    const appointment = await repository.getAppointment(appointmentId);
    expect(appointment?.appointmentStatus).toBe("RESCHEDULE_REQUESTED");
    expect(appointment?.followupStatus).toBe("CLOSED");
    expect(await repository.listReceptionTasks(sessionId)).toHaveLength(1);
  });

  it("G: running the scheduler twice creates no duplicates", async () => {
    clock.setTime(new Date("2026-08-10T16:00:00-05:00"));
    await scheduler.run(sessionId);
    await scheduler.run(sessionId);

    expect(await repository.listWhatsAppMessages(sessionId)).toHaveLength(1);
    expect(await repository.listCallAttempts(sessionId)).toHaveLength(2);
  });

  it("H: processes a duplicated internal event only once", async () => {
    const message = await initialMessage();
    const first = await events.processWhatsAppResponse({
      eventId: "same-simulated-event",
      messageId: message.id,
      action: "CONFIRM",
    });
    const versionAfterFirst = (await repository.getAppointment(appointmentId))?.version;
    const duplicate = await events.processWhatsAppResponse({
      eventId: "same-simulated-event",
      messageId: message.id,
      action: "CANCEL",
    });

    expect(first).toBe(true);
    expect(duplicate).toBe(false);
    expect((await repository.getAppointment(appointmentId))?.version).toBe(versionAfterFirst);
    expect((await repository.getAppointment(appointmentId))?.appointmentStatus).toBe("CONFIRMED");
  });
});

async function initialMessage() {
  clock.setTime(new Date("2026-08-10T09:00:00-05:00"));
  await scheduler.run(sessionId);
  const message = (await repository.listWhatsAppMessages(sessionId))[0];
  if (!message) throw new Error("Expected simulated message");
  return message;
}

function appointmentFixture(): SimulationAppointment {
  return {
    id: appointmentId,
    simulationSessionId: sessionId,
    patientId: "patient-fictitious",
    branchId: "branch-fictitious",
    doctorId: "doctor-fictitious",
    calendarEventId: "calendar-fictitious",
    startsAt: new Date("2026-08-11T17:00:00-05:00"),
    endsAt: new Date("2026-08-11T18:00:00-05:00"),
    appointmentStatus: "SCHEDULED",
    followupStatus: "PENDING",
    version: 1,
    patientName: "Paciente Ficticio",
    patientPhone: "+1-202-555-0199",
    branchName: "Sede Simulada",
  };
}
