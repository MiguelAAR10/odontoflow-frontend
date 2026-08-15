import type {
  ContactAttemptType,
  FollowupTrackingRow,
  SimulationAppointment,
  SimulationMetrics,
} from "../domain/types.js";
import type { SimulationRepository } from "./SimulationRepository.js";

export interface FollowupRule {
  attemptType: ContactAttemptType;
  channel: "WHATSAPP" | "CALL";
  dueAt(appointment: SimulationAppointment): Date;
}

export interface DayClosingSummary {
  date: string;
  confirmed: SimulationAppointment[];
  pending: SimulationAppointment[];
  cancelled: SimulationAppointment[];
  rescheduleRequested: SimulationAppointment[];
  noResponse: SimulationAppointment[];
}

export const FOLLOWUP_RULES: FollowupRule[] = [
  { attemptType: "DAY_BEFORE_09AM", channel: "WHATSAPP", dueAt: a => limaTime(a, -1, 9) },
  { attemptType: "DAY_BEFORE_CALL_12PM", channel: "CALL", dueAt: a => limaTime(a, -1, 12) },
  { attemptType: "DAY_BEFORE_CALL_04PM", channel: "CALL", dueAt: a => limaTime(a, -1, 16) },
  { attemptType: "SAME_DAY_09AM", channel: "WHATSAPP", dueAt: a => limaTime(a, 0, 9) },
  { attemptType: "ONE_HOUR_BEFORE", channel: "WHATSAPP", dueAt: a => new Date(a.startsAt.getTime() - 3_600_000) },
];

export class FollowupEngine {
  isEligible(appointment: SimulationAppointment, attemptType: ContactAttemptType): boolean {
    if (["CANCELLED", "RESCHEDULE_REQUESTED", "COMPLETED", "NO_SHOW"].includes(appointment.appointmentStatus)) {
      return false;
    }
    if (attemptType === "SAME_DAY_09AM" || attemptType === "ONE_HOUR_BEFORE") {
      return appointment.appointmentStatus === "SCHEDULED" || appointment.appointmentStatus === "CONFIRMED";
    }
    if (attemptType === "DAY_BEFORE_09AM") return appointment.appointmentStatus === "SCHEDULED";
    return (
      appointment.appointmentStatus === "SCHEDULED" &&
      !["CONFIRMED", "CLOSED", "CONTACTED"].includes(appointment.followupStatus)
    );
  }

  async tracking(repository: SimulationRepository, sessionId: string, now: Date): Promise<FollowupTrackingRow[]> {
    const [appointments, messages, calls] = await Promise.all([
      repository.listAppointments(sessionId),
      repository.listWhatsAppMessages(sessionId),
      repository.listCallAttempts(sessionId),
    ]);
    return appointments.map(appointment => {
      const contacts = [
        ...messages.filter(item => item.appointmentId === appointment.id).map(item => ({
          attemptType: item.attemptType, channel: "WHATSAPP" as const, at: item.sentAt,
        })),
        ...calls.filter(item => item.appointmentId === appointment.id).map(item => ({
          attemptType: item.attemptType, channel: "CALL" as const, at: item.attemptedAt,
        })),
      ].sort((a, b) => a.at.getTime() - b.at.getTime());
      const attempted = new Set(contacts.map(item => item.attemptType));
      const nextRule = FOLLOWUP_RULES.find(
        rule => !attempted.has(rule.attemptType) && this.isEligible(appointment, rule.attemptType),
      );
      const lastContact = contacts.at(-1);
      return {
        appointment,
        ...(lastContact ? { lastContact } : {}),
        ...(nextRule
          ? { nextContact: { attemptType: nextRule.attemptType, at: maxDate(nextRule.dueAt(appointment), now) } }
          : {}),
        attemptCount: contacts.length,
      };
    });
  }

  async closingSummary(
    repository: SimulationRepository,
    sessionId: string,
    now: Date,
  ): Promise<DayClosingSummary> {
    const tomorrow = limaDateKey(new Date(now.getTime() + 86_400_000));
    const appointments = (await repository.listAppointments(sessionId)).filter(
      appointment => limaDateKey(appointment.startsAt) === tomorrow,
    );
    return {
      date: tomorrow,
      confirmed: appointments.filter(item => item.appointmentStatus === "CONFIRMED"),
      cancelled: appointments.filter(item => item.appointmentStatus === "CANCELLED"),
      rescheduleRequested: appointments.filter(item => item.appointmentStatus === "RESCHEDULE_REQUESTED"),
      noResponse: appointments.filter(
        item => item.appointmentStatus === "SCHEDULED" && item.followupStatus === "NO_RESPONSE",
      ),
      pending: appointments.filter(
        item => item.appointmentStatus === "SCHEDULED" && item.followupStatus !== "NO_RESPONSE",
      ),
    };
  }

  async metrics(repository: SimulationRepository, sessionId: string): Promise<SimulationMetrics> {
    const [appointments, messages, calls] = await Promise.all([
      repository.listAppointments(sessionId),
      repository.listWhatsAppMessages(sessionId),
      repository.listCallAttempts(sessionId),
    ]);
    return {
      scheduled: appointments.filter(item => item.appointmentStatus === "SCHEDULED").length,
      confirmed: appointments.filter(item => item.appointmentStatus === "CONFIRMED").length,
      pending: appointments.filter(
        item => item.appointmentStatus === "SCHEDULED" && item.followupStatus !== "NO_RESPONSE",
      ).length,
      cancelled: appointments.filter(item => item.appointmentStatus === "CANCELLED").length,
      rescheduleRequested: appointments.filter(item => item.appointmentStatus === "RESCHEDULE_REQUESTED").length,
      noResponse: appointments.filter(item => item.followupStatus === "NO_RESPONSE").length,
      simulatedWhatsApps: messages.length,
      simulatedCalls: calls.length,
    };
  }
}

export function limaTime(appointment: SimulationAppointment, dayOffset: number, hour: number): Date {
  const wallClock = new Date(appointment.startsAt.getTime() - 5 * 3_600_000);
  return new Date(
    Date.UTC(
      wallClock.getUTCFullYear(), wallClock.getUTCMonth(), wallClock.getUTCDate() + dayOffset, hour + 5,
    ),
  );
}

function limaDateKey(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(instant);
}

function maxDate(a: Date, b: Date): Date {
  return new Date(Math.max(a.getTime(), b.getTime()));
}
