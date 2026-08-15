import { randomUUID } from "node:crypto";
import type {
  AppointmentStatus,
  FollowupStatus,
  SimulatedCallAttempt,
  SimulatedCallResult,
  SimulatedResponseAction,
  SimulatedWhatsAppMessage,
  SimulationAppointment,
  ReceptionTask,
  SimulationCatalogs,
  AppointmentStatusChange,
} from "../domain/types.js";
import type {
  NewCallAttempt,
  NewWhatsAppMessage,
  SimulationRepository,
} from "./SimulationRepository.js";

export class InMemorySimulationRepository implements SimulationRepository {
  #appointments = new Map<string, SimulationAppointment>();
  #messages = new Map<string, SimulatedWhatsAppMessage>();
  #calls = new Map<string, SimulatedCallAttempt>();
  #events = new Set<string>();
  #sessionTimes = new Map<string, Date>();
  #tasks = new Map<string, ReceptionTask>();
  #history: AppointmentStatusChange[] = [];

  constructor(appointments: SimulationAppointment[] = []) {
    for (const appointment of appointments) {
      this.#appointments.set(appointment.id, cloneAppointment(appointment));
    }
  }

  async getSimulationTime(simulationSessionId: string): Promise<Date> {
    return new Date(this.#sessionTimes.get(simulationSessionId) ?? "2026-08-11T08:55:00-05:00");
  }

  async setSimulationTime(simulationSessionId: string, instant: Date): Promise<void> {
    this.#sessionTimes.set(simulationSessionId, new Date(instant));
  }

  async resetSession(simulationSessionId: string, instant: Date): Promise<void> {
    this.#sessionTimes.set(simulationSessionId, new Date(instant));
    for (const appointment of this.#appointments.values()) {
      if (appointment.simulationSessionId !== simulationSessionId) continue;
      appointment.appointmentStatus = "SCHEDULED";
      appointment.followupStatus = "PENDING";
      delete appointment.cancellationReason;
      delete appointment.confirmedAt;
      delete appointment.cancelledAt;
      delete appointment.rescheduleRequestedAt;
    }
    for (const [id, message] of this.#messages) if (message.simulationSessionId === simulationSessionId) this.#messages.delete(id);
    for (const [id, call] of this.#calls) if (call.simulationSessionId === simulationSessionId) this.#calls.delete(id);
    for (const [id, task] of this.#tasks) if (task.simulationSessionId === simulationSessionId) this.#tasks.delete(id);
    this.#events.clear();
    this.#history = [];
  }

  async listAppointments(simulationSessionId: string): Promise<SimulationAppointment[]> {
    return [...this.#appointments.values()]
      .filter((item) => item.simulationSessionId === simulationSessionId)
      .map(cloneAppointment);
  }

  async getAppointment(id: string): Promise<SimulationAppointment | undefined> {
    const appointment = this.#appointments.get(id);
    return appointment ? cloneAppointment(appointment) : undefined;
  }

  async updateAppointmentState(
    id: string,
    appointmentStatus: AppointmentStatus,
    followupStatus: FollowupStatus,
    cancellationReason?: string,
    changedAt = new Date(),
  ): Promise<SimulationAppointment> {
    const appointment = this.requireAppointment(id);
    const fromAppointmentStatus = appointment.appointmentStatus;
    const fromFollowupStatus = appointment.followupStatus;
    appointment.appointmentStatus = appointmentStatus;
    appointment.followupStatus = followupStatus;
    appointment.version += 1;
    if (cancellationReason === undefined) delete appointment.cancellationReason;
    else appointment.cancellationReason = cancellationReason;
    delete appointment.confirmedAt;
    delete appointment.cancelledAt;
    delete appointment.rescheduleRequestedAt;
    if (appointmentStatus === "CONFIRMED") appointment.confirmedAt = new Date(changedAt);
    if (appointmentStatus === "CANCELLED") appointment.cancelledAt = new Date(changedAt);
    if (appointmentStatus === "RESCHEDULE_REQUESTED") appointment.rescheduleRequestedAt = new Date(changedAt);
    this.#history.push({
      appointmentId: id,
      fromAppointmentStatus,
      toAppointmentStatus: appointmentStatus,
      fromFollowupStatus,
      toFollowupStatus: followupStatus,
      reason: "STATE_UPDATED",
      changedAt: new Date(changedAt),
    });
    return cloneAppointment(appointment);
  }

  async createAppointment(input: {
    simulationSessionId: string; patientId: string; branchId: string; doctorId: string;
    title: string; startsAt: Date; endsAt: Date;
  }): Promise<SimulationAppointment> {
    if (input.endsAt <= input.startsAt) throw new Error("Appointment end must be after start");
    const appointment: SimulationAppointment = {
      id: randomUUID(), simulationSessionId: input.simulationSessionId,
      patientId: input.patientId, branchId: input.branchId, doctorId: input.doctorId,
      calendarEventId: randomUUID(), startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt),
      appointmentStatus: "SCHEDULED", followupStatus: "PENDING", version: 1,
      patientName: "Paciente Ficticio", patientPhone: "+1-202-555-0198", branchName: "Sede Simulada",
    };
    this.#appointments.set(appointment.id, appointment);
    return cloneAppointment(appointment);
  }

  async editAppointment(
    id: string,
    input: { startsAt: Date; endsAt: Date; title?: string },
  ): Promise<SimulationAppointment> {
    if (input.endsAt <= input.startsAt) throw new Error("Appointment end must be after start");
    const appointment = this.requireAppointment(id);
    if (appointment.appointmentStatus === "CANCELLED") throw new Error("Cancelled appointment cannot be edited");
    appointment.startsAt = new Date(input.startsAt);
    appointment.endsAt = new Date(input.endsAt);
    appointment.version += 1;
    return cloneAppointment(appointment);
  }

  async cancelAppointment(id: string, reason: string, cancelledAt: Date): Promise<SimulationAppointment> {
    return this.updateAppointmentState(id, "CANCELLED", "CLOSED", reason, cancelledAt);
  }

  async getCatalogs(): Promise<SimulationCatalogs> {
    const appointments = [...this.#appointments.values()];
    return {
      patients: uniqueBy(appointments.map(a => ({ id: a.patientId, name: a.patientName, phone: a.patientPhone })), "id"),
      branches: uniqueBy(appointments.map(a => ({ id: a.branchId, name: a.branchName })), "id"),
      doctors: uniqueBy(appointments.map(a => ({ id: a.doctorId, branchId: a.branchId, name: "Doctor Ficticio" })), "id"),
    };
  }

  async listStatusHistory(appointmentId: string): Promise<AppointmentStatusChange[]> {
    return this.#history.filter(item => item.appointmentId === appointmentId).map(item => ({
      ...item, changedAt: new Date(item.changedAt),
    }));
  }

  async createReceptionTask(input: {
    simulationSessionId: string; appointmentId: string; description: string; createdAt: Date;
  }): Promise<ReceptionTask> {
    const existing = [...this.#tasks.values()].find(task => task.appointmentId === input.appointmentId);
    if (existing) return cloneTask(existing);
    const task: ReceptionTask = {
      id: randomUUID(), simulationSessionId: input.simulationSessionId,
      appointmentId: input.appointmentId, taskType: "RESCHEDULE_REQUEST", status: "OPEN",
      description: input.description, createdAt: new Date(input.createdAt),
    };
    this.#tasks.set(task.id, task);
    return cloneTask(task);
  }

  async listReceptionTasks(simulationSessionId: string): Promise<ReceptionTask[]> {
    return [...this.#tasks.values()].filter(task => task.simulationSessionId === simulationSessionId).map(cloneTask);
  }

  async createWhatsAppMessage(input: NewWhatsAppMessage): Promise<SimulatedWhatsAppMessage> {
    const existing = [...this.#messages.values()].find(
      (item) =>
        item.simulationSessionId === input.simulationSessionId &&
        item.appointmentId === input.appointmentId &&
        item.attemptType === input.attemptType,
    );
    if (existing) return cloneMessage(existing);
    const id = randomUUID();
    const message: SimulatedWhatsAppMessage = {
      id,
      simulatedMessageId: `sim-wa-${id}`,
      ...input,
      sentAt: new Date(input.sentAt),
      status: "DELIVERED_SIMULATED",
    };
    this.#messages.set(message.id, message);
    return cloneMessage(message);
  }

  async listWhatsAppMessages(simulationSessionId: string): Promise<SimulatedWhatsAppMessage[]> {
    return [...this.#messages.values()]
      .filter((item) => item.simulationSessionId === simulationSessionId)
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
      .map(cloneMessage);
  }

  async getWhatsAppMessage(id: string): Promise<SimulatedWhatsAppMessage | undefined> {
    const message = this.#messages.get(id);
    return message ? cloneMessage(message) : undefined;
  }

  async setWhatsAppResponse(
    id: string,
    response: SimulatedResponseAction,
    respondedAt: Date,
  ): Promise<SimulatedWhatsAppMessage> {
    const message = this.#messages.get(id);
    if (!message) throw new Error(`Simulated message not found: ${id}`);
    message.response = response;
    message.respondedAt = new Date(respondedAt);
    return cloneMessage(message);
  }

  async createCallAttempt(input: NewCallAttempt): Promise<SimulatedCallAttempt> {
    const existing = [...this.#calls.values()].find(
      (item) =>
        item.simulationSessionId === input.simulationSessionId &&
        item.appointmentId === input.appointmentId &&
        item.attemptType === input.attemptType,
    );
    if (existing) return cloneCall(existing);
    const call: SimulatedCallAttempt = {
      id: randomUUID(),
      ...input,
      attemptedAt: new Date(input.attemptedAt),
      result: "PENDING",
    };
    this.#calls.set(call.id, call);
    return cloneCall(call);
  }

  async listCallAttempts(simulationSessionId: string): Promise<SimulatedCallAttempt[]> {
    return [...this.#calls.values()]
      .filter((item) => item.simulationSessionId === simulationSessionId)
      .sort((a, b) => b.attemptedAt.getTime() - a.attemptedAt.getTime())
      .map(cloneCall);
  }

  async getCallAttempt(id: string): Promise<SimulatedCallAttempt | undefined> {
    const call = this.#calls.get(id);
    return call ? cloneCall(call) : undefined;
  }

  async updateCallResult(id: string, result: SimulatedCallResult): Promise<SimulatedCallAttempt> {
    const call = this.#calls.get(id);
    if (!call) throw new Error(`Simulated call not found: ${id}`);
    call.result = result;
    return cloneCall(call);
  }

  async recordInboundEvent(input: {
    simulationSessionId: string;
    eventId: string;
  }): Promise<boolean> {
    const key = `${input.simulationSessionId}:${input.eventId}`;
    if (this.#events.has(key)) return false;
    this.#events.add(key);
    return true;
  }

  private requireAppointment(id: string): SimulationAppointment {
    const appointment = this.#appointments.get(id);
    if (!appointment) throw new Error(`Appointment not found: ${id}`);
    return appointment;
  }
}

function cloneAppointment(value: SimulationAppointment): SimulationAppointment {
  return {
    ...value, startsAt: new Date(value.startsAt), endsAt: new Date(value.endsAt),
    ...(value.confirmedAt ? { confirmedAt: new Date(value.confirmedAt) } : {}),
    ...(value.cancelledAt ? { cancelledAt: new Date(value.cancelledAt) } : {}),
    ...(value.rescheduleRequestedAt ? { rescheduleRequestedAt: new Date(value.rescheduleRequestedAt) } : {}),
  };
}

function cloneMessage(value: SimulatedWhatsAppMessage): SimulatedWhatsAppMessage {
  return {
    ...value,
    sentAt: new Date(value.sentAt),
    ...(value.respondedAt ? { respondedAt: new Date(value.respondedAt) } : {}),
  };
}

function cloneCall(value: SimulatedCallAttempt): SimulatedCallAttempt {
  return { ...value, attemptedAt: new Date(value.attemptedAt) };
}

function cloneTask(value: ReceptionTask): ReceptionTask {
  return {
    ...value, createdAt: new Date(value.createdAt),
    ...(value.resolvedAt ? { resolvedAt: new Date(value.resolvedAt) } : {}),
  };
}

function uniqueBy<T extends Record<K, string>, K extends keyof T>(items: T[], key: K): T[] {
  return [...new Map(items.map(item => [item[key], item])).values()];
}
