import { describe, expect, it } from "vitest";
import type { SimulationAppointment } from "../src/domain/types.js";
import {
  FollowupEngine,
  InMemorySimulationRepository,
  ReminderScheduler,
  SimulatedEventProcessor,
  SimulationClock,
} from "../src/index.js";

const session = "e2e-session";

function setup(appointments = [fixture()]) {
  const clock = new SimulationClock(new Date("2026-08-10T08:55:00-05:00"));
  const repository = new InMemorySimulationRepository(appointments);
  return {
    clock,
    repository,
    scheduler: new ReminderScheduler(repository, clock),
    events: new SimulatedEventProcessor(repository, clock),
    engine: new FollowupEngine(),
  };
}

describe("required Ana Demo journey", () => {
  it("runs 09:00, 12:00, 16:00, confirms, then sends same-day and one-hour reminders", async () => {
    const { clock, repository, scheduler, events } = setup();
    for (const time of ["09:00", "12:00", "16:00"]) {
      clock.setTime(new Date(`2026-08-10T${time}:00-05:00`));
      await scheduler.run(session);
    }
    const calls = await repository.listCallAttempts(session);
    const finalCall = calls.find(call => call.attemptType === "DAY_BEFORE_CALL_04PM");
    if (!finalCall) throw new Error("Expected 16:00 call");
    await events.updateCallResult(finalCall.id, "ANSWERED_CONFIRMED");

    for (const time of ["2026-08-11T09:00:00-05:00", "2026-08-11T16:00:00-05:00"]) {
      clock.setTime(new Date(time));
      await scheduler.run(session);
      await scheduler.run(session);
    }

    expect((await repository.listWhatsAppMessages(session)).map(x => x.attemptType).sort()).toEqual(
      ["DAY_BEFORE_09AM", "ONE_HOUR_BEFORE", "SAME_DAY_09AM"].sort(),
    );
    expect(await repository.listCallAttempts(session)).toHaveLength(2);
    const appointment = await repository.getAppointment("ana-appointment");
    expect(appointment?.appointmentStatus).toBe("CONFIRMED");
    expect(appointment?.followupStatus).toBe("CONFIRMED");
    expect(appointment?.confirmedAt?.toISOString()).toBe("2026-08-10T21:00:00.000Z");
  });
});

describe("ten additional scenarios", () => {
  it("1. confirms through simulated WhatsApp the day before", async () => {
    const { clock, repository, scheduler, events } = setup();
    clock.setTime(new Date("2026-08-10T09:00:00-05:00"));
    await scheduler.run(session);
    const message = (await repository.listWhatsAppMessages(session))[0]!;
    await events.processWhatsAppResponse({ eventId: "confirm-once", messageId: message.id, action: "CONFIRM" });
    expect((await repository.getAppointment("ana-appointment"))?.confirmedAt).toBeDefined();
  });

  it("2. cancels and records simulation timestamp", async () => {
    const { clock, repository, scheduler, events } = setup();
    clock.setTime(new Date("2026-08-10T09:00:00-05:00")); await scheduler.run(session);
    const message = (await repository.listWhatsAppMessages(session))[0]!;
    await events.processWhatsAppResponse({ eventId: "cancel-once", messageId: message.id, action: "CANCEL" });
    expect((await repository.getAppointment("ana-appointment"))?.cancelledAt?.toISOString()).toBe(clock.now().toISOString());
  });

  it("3. requests rescheduling and creates one reception task", async () => {
    const { clock, repository, scheduler, events } = setup();
    clock.setTime(new Date("2026-08-10T09:00:00-05:00")); await scheduler.run(session);
    const message = (await repository.listWhatsAppMessages(session))[0]!;
    await events.processWhatsAppResponse({ eventId: "reschedule-once", messageId: message.id, action: "REQUEST_RESCHEDULE" });
    expect(await repository.listReceptionTasks(session)).toHaveLength(1);
    expect((await repository.getAppointment("ana-appointment"))?.followupStatus).toBe("CLOSED");
  });

  it("4. never responds and remains scheduled", async () => {
    const { clock, repository, scheduler, events } = setup();
    clock.setTime(new Date("2026-08-10T09:00:00-05:00")); await scheduler.run(session);
    const message = (await repository.listWhatsAppMessages(session))[0]!;
    await events.processWhatsAppResponse({ eventId: "no-response", messageId: message.id, action: "NO_RESPONSE" });
    clock.setTime(new Date("2026-08-10T16:00:00-05:00")); await scheduler.run(session);
    expect((await repository.getAppointment("ana-appointment"))?.appointmentStatus).toBe("SCHEDULED");
    expect(await repository.listCallAttempts(session)).toHaveLength(2);
  });

  it("5. manual cancellation blocks the next attempt", async () => {
    const { clock, repository, scheduler } = setup();
    clock.setTime(new Date("2026-08-10T09:00:00-05:00")); await scheduler.run(session);
    await repository.cancelAppointment("ana-appointment", "Manual simulated cancel", clock.now());
    clock.setTime(new Date("2026-08-10T12:00:00-05:00")); await scheduler.run(session);
    expect(await repository.listCallAttempts(session)).toHaveLength(0);
  });

  it("6. running scheduler twice remains idempotent", async () => {
    const { clock, repository, scheduler } = setup();
    clock.setTime(new Date("2026-08-10T16:00:00-05:00")); await scheduler.run(session); await scheduler.run(session);
    expect((await repository.listWhatsAppMessages(session)).length + (await repository.listCallAttempts(session)).length).toBe(3);
  });

  it("7. duplicated response changes state only once", async () => {
    const { clock, repository, scheduler, events } = setup();
    clock.setTime(new Date("2026-08-10T09:00:00-05:00")); await scheduler.run(session);
    const message = (await repository.listWhatsAppMessages(session))[0]!;
    expect(await events.processWhatsAppResponse({ eventId: "duplicate", messageId: message.id, action: "CONFIRM" })).toBe(true);
    expect(await events.processWhatsAppResponse({ eventId: "duplicate", messageId: message.id, action: "CANCEL" })).toBe(false);
  });

  it("8. handles two appointments for the same patient independently", async () => {
    const { clock, repository, scheduler } = setup([fixture(), fixture({ id: "ana-second", startsAt: "2026-08-11T18:30:00-05:00" })]);
    clock.setTime(new Date("2026-08-10T09:00:00-05:00")); await scheduler.run(session);
    expect(await repository.listWhatsAppMessages(session)).toHaveLength(2);
  });

  it("9. summarizes appointments across several branches", async () => {
    const { clock, repository, engine } = setup([fixture(), fixture({ id: "other-branch", branchId: "branch-two", branchName: "Sede Dos" })]);
    const summary = await engine.closingSummary(repository, session, clock.now());
    expect(new Set(summary.pending.map(x => x.branchId)).size).toBe(2);
  });

  it("10. calculates one-hour reminders from different timestamps", async () => {
    const appointments = [fixture(), fixture({ id: "early", startsAt: "2026-08-11T11:30:00-05:00" })];
    const { clock, repository, scheduler } = setup(appointments);
    clock.setTime(new Date("2026-08-11T10:30:00-05:00")); await scheduler.run(session);
    const oneHour = (await repository.listWhatsAppMessages(session)).filter(x => x.attemptType === "ONE_HOUR_BEFORE");
    expect(oneHour.map(x => x.appointmentId)).toContain("early");
    expect(oneHour.map(x => x.appointmentId)).not.toContain("ana-appointment");
  });
});

function fixture(
  overrides: Omit<Partial<SimulationAppointment>, "startsAt" | "endsAt"> & { startsAt?: string } = {},
): SimulationAppointment {
  const { startsAt: startsAtOverride, ...rest } = overrides;
  const startsAt = new Date(startsAtOverride ?? "2026-08-11T17:00:00-05:00");
  return {
    id: "ana-appointment", simulationSessionId: session, patientId: "ana-patient",
    branchId: "branch-one", doctorId: "doctor-one", calendarEventId: "calendar-one",
    startsAt, endsAt: new Date(startsAt.getTime() + 3_600_000), appointmentStatus: "SCHEDULED",
    followupStatus: "PENDING", version: 1, patientName: "Ana Demo",
    patientPhone: "+1-202-555-0110", branchName: "Sede Uno", ...rest,
  };
}
