import type { Clock } from "../domain/ports.js";
import { messageTemplates } from "./MessageTemplates.js";
import { FOLLOWUP_RULES, FollowupEngine } from "./FollowupEngine.js";
import type { SimulationRepository } from "./SimulationRepository.js";

export class ReminderScheduler {
  constructor(
    private readonly repository: SimulationRepository,
    private readonly clock: Clock,
    private readonly engine = new FollowupEngine(),
  ) {}

  async run(simulationSessionId: string): Promise<void> {
    const appointments = await this.repository.listAppointments(simulationSessionId);
    for (const appointment of appointments) {
      for (const rule of FOLLOWUP_RULES) {
        if (!this.engine.isEligible(appointment, rule.attemptType)) continue;
        if (rule.dueAt(appointment) > this.clock.now()) continue;
        const current = await this.repository.getAppointment(appointment.id);
        if (!current || !this.engine.isEligible(current, rule.attemptType)) continue;
        if (rule.channel === "WHATSAPP") {
          const attemptType = rule.attemptType as keyof typeof messageTemplates;
          await this.repository.createWhatsAppMessage({
            simulationSessionId,
            appointmentId: current.id,
            patientName: current.patientName,
            recipientPhone: current.patientPhone,
            branchName: current.branchName,
            attemptType: rule.attemptType,
            text: messageTemplates[attemptType](current),
            sentAt: this.clock.now(),
          });
          if (current.appointmentStatus === "SCHEDULED") {
            await this.repository.updateAppointmentState(
              current.id, current.appointmentStatus, "WHATSAPP_SENT", undefined, this.clock.now(),
            );
          }
        } else {
          await this.repository.createCallAttempt({
            simulationSessionId,
            appointmentId: current.id,
            patientName: current.patientName,
            phone: current.patientPhone,
            attemptType: rule.attemptType,
            attemptedAt: this.clock.now(),
          });
          await this.repository.updateAppointmentState(
            current.id,
            current.appointmentStatus,
            "CALL_REQUIRED",
            undefined,
            this.clock.now(),
          );
        }
      }
    }
  }
}
