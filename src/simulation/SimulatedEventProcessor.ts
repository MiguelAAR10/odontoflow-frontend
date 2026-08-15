import type { Clock } from "../domain/ports.js";
import type { SimulatedCallResult, SimulatedResponseAction } from "../domain/types.js";
import type { SimulationRepository } from "./SimulationRepository.js";

export class SimulatedEventProcessor {
  constructor(
    private readonly repository: SimulationRepository,
    private readonly clock: Clock,
  ) {}

  async processWhatsAppResponse(input: {
    eventId: string;
    messageId: string;
    action: SimulatedResponseAction;
  }): Promise<boolean> {
    const message = await this.repository.getWhatsAppMessage(input.messageId);
    if (!message) throw new Error(`Simulated message not found: ${input.messageId}`);
    const isNew = await this.repository.recordInboundEvent({
      simulationSessionId: message.simulationSessionId,
      eventId: input.eventId,
      messageId: message.id,
      appointmentId: message.appointmentId,
      action: input.action,
      occurredAt: this.clock.now(),
    });
    if (!isNew) return false;

    await this.repository.setWhatsAppResponse(message.id, input.action, this.clock.now());
    await this.applyResponse(message.appointmentId, input.action);
    return true;
  }

  async updateCallResult(callId: string, result: SimulatedCallResult): Promise<void> {
    const call = await this.repository.updateCallResult(callId, result);
    const actionByResult: Partial<Record<SimulatedCallResult, SimulatedResponseAction>> = {
      ANSWERED_CONFIRMED: "CONFIRM",
      ANSWERED_CANCELLED: "CANCEL",
      ANSWERED_RESCHEDULE: "REQUEST_RESCHEDULE",
    };
    const action = actionByResult[result];
    if (action) await this.applyResponse(call.appointmentId, action);
    else if (result === "NO_ANSWER" || result === "WRONG_NUMBER") {
      const appointment = await this.requireAppointment(call.appointmentId);
      await this.repository.updateAppointmentState(
        appointment.id,
        appointment.appointmentStatus,
        "NO_RESPONSE",
        undefined,
        this.clock.now(),
      );
    }
  }

  private async applyResponse(appointmentId: string, action: SimulatedResponseAction): Promise<void> {
    const appointment = await this.requireAppointment(appointmentId);
    if (action === "CONFIRM") {
      await this.repository.updateAppointmentState(
        appointment.id, "CONFIRMED", "CONFIRMED", undefined, this.clock.now(),
      );
    } else if (action === "CANCEL") {
      await this.repository.updateAppointmentState(
        appointment.id,
        "CANCELLED",
        "CLOSED",
        "SIMULATED_PATIENT_CANCELLATION",
        this.clock.now(),
      );
    } else if (action === "REQUEST_RESCHEDULE") {
      await this.repository.updateAppointmentState(
        appointment.id,
        "RESCHEDULE_REQUESTED",
        "CLOSED",
        undefined,
        this.clock.now(),
      );
      await this.repository.createReceptionTask({
        simulationSessionId: appointment.simulationSessionId,
        appointmentId: appointment.id,
        description: `Solicitud ficticia de reprogramacion para ${appointment.patientName}`,
        createdAt: this.clock.now(),
      });
    } else {
      await this.repository.updateAppointmentState(
        appointment.id,
        appointment.appointmentStatus,
        "NO_RESPONSE",
        undefined,
        this.clock.now(),
      );
    }
  }

  private async requireAppointment(id: string) {
    const appointment = await this.repository.getAppointment(id);
    if (!appointment) throw new Error(`Appointment not found: ${id}`);
    return appointment;
  }
}
