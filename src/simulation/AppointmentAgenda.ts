import { randomUUID } from "node:crypto";
import type { CalendarService, Clock } from "../domain/ports.js";
import type {
  Appointment,
  AppointmentStatus,
  AppointmentStatusChange,
  FollowupStatus,
} from "../domain/types.js";

export interface CreateAppointmentInput {
  idempotencyKey: string;
  simulationSessionId: string;
  patientId: string;
  branchId: string;
  doctorId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
}

export class AppointmentAgenda {
  #appointments = new Map<string, Appointment>();
  #idempotency = new Map<string, string>();
  #history: AppointmentStatusChange[] = [];

  constructor(
    private readonly calendar: CalendarService,
    private readonly clock: Clock,
  ) {}

  create(input: CreateAppointmentInput): Appointment {
    const priorId = this.#idempotency.get(input.idempotencyKey);
    if (priorId) return cloneAppointment(this.require(priorId));

    const event = this.calendar.create({
      idempotencyKey: `calendar:${input.idempotencyKey}`,
      simulationSessionId: input.simulationSessionId,
      title: input.title,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    });
    const appointment: Appointment = {
      id: randomUUID(),
      simulationSessionId: input.simulationSessionId,
      patientId: input.patientId,
      branchId: input.branchId,
      doctorId: input.doctorId,
      calendarEventId: event.id,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      appointmentStatus: "SCHEDULED",
      followupStatus: "PENDING",
      version: 1,
    };
    this.#appointments.set(appointment.id, appointment);
    this.calendar.linkAppointment(event.id, appointment.id);
    this.#idempotency.set(input.idempotencyKey, appointment.id);
    this.record(appointment, undefined, undefined, "APPOINTMENT_CREATED");
    return cloneAppointment(appointment);
  }

  modify(
    id: string,
    changes: { title?: string; startsAt?: Date; endsAt?: Date },
  ): Appointment {
    const appointment = this.require(id);
    if (appointment.appointmentStatus === "CANCELLED") {
      throw new Error("A cancelled appointment cannot be modified");
    }
    const event = this.calendar.update(appointment.calendarEventId, changes);
    appointment.startsAt = event.startsAt;
    appointment.endsAt = event.endsAt;
    appointment.version += 1;
    return cloneAppointment(appointment);
  }

  cancel(id: string, reason: string): Appointment {
    if (!reason.trim()) throw new Error("Cancellation reason is required");
    const appointment = this.require(id);
    if (appointment.appointmentStatus === "CANCELLED") return cloneAppointment(appointment);
    const fromAppointment = appointment.appointmentStatus;
    const fromFollowup = appointment.followupStatus;
    this.calendar.cancel(appointment.calendarEventId);
    appointment.appointmentStatus = "CANCELLED";
    appointment.followupStatus = "CLOSED";
    appointment.cancellationReason = reason;
    appointment.version += 1;
    this.record(appointment, fromAppointment, fromFollowup, reason);
    return cloneAppointment(appointment);
  }

  changeStatus(
    id: string,
    appointmentStatus: AppointmentStatus,
    followupStatus: FollowupStatus,
    reason: string,
  ): Appointment {
    const appointment = this.require(id);
    if (appointmentStatus === "CANCELLED") {
      throw new Error("Use cancel() so the calendar event and reason stay consistent");
    }
    if (appointment.appointmentStatus === "CANCELLED") {
      throw new Error("A cancelled appointment cannot change status");
    }
    const fromAppointment = appointment.appointmentStatus;
    const fromFollowup = appointment.followupStatus;
    appointment.appointmentStatus = appointmentStatus;
    appointment.followupStatus = followupStatus;
    appointment.version += 1;
    this.record(appointment, fromAppointment, fromFollowup, reason);
    return cloneAppointment(appointment);
  }

  upcoming(simulationSessionId: string, from = this.clock.now()): Appointment[] {
    return [...this.#appointments.values()]
      .filter(
        (appointment) =>
          appointment.simulationSessionId === simulationSessionId &&
          appointment.appointmentStatus !== "CANCELLED" &&
          appointment.startsAt >= from,
      )
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .map(cloneAppointment);
  }

  history(appointmentId: string): AppointmentStatusChange[] {
    return this.#history
      .filter((change) => change.appointmentId === appointmentId)
      .map((change) => ({ ...change, changedAt: new Date(change.changedAt) }));
  }

  private require(id: string): Appointment {
    const appointment = this.#appointments.get(id);
    if (!appointment) throw new Error(`Appointment not found: ${id}`);
    return appointment;
  }

  private record(
    appointment: Appointment,
    fromAppointmentStatus: AppointmentStatus | undefined,
    fromFollowupStatus: FollowupStatus | undefined,
    reason: string,
  ): void {
    this.#history.push({
      appointmentId: appointment.id,
      ...(fromAppointmentStatus === undefined ? {} : { fromAppointmentStatus }),
      toAppointmentStatus: appointment.appointmentStatus,
      ...(fromFollowupStatus === undefined ? {} : { fromFollowupStatus }),
      toFollowupStatus: appointment.followupStatus,
      reason,
      changedAt: this.clock.now(),
    });
  }
}

function cloneAppointment(appointment: Appointment): Appointment {
  return {
    ...appointment,
    startsAt: new Date(appointment.startsAt),
    endsAt: new Date(appointment.endsAt),
  };
}
