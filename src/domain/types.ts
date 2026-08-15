export const APPOINTMENT_STATUSES = [
  "SCHEDULED",
  "CONFIRMED",
  "RESCHEDULE_REQUESTED",
  "CANCELLED",
  "COMPLETED",
  "NO_SHOW",
] as const;

export const FOLLOWUP_STATUSES = [
  "PENDING",
  "WHATSAPP_SENT",
  "CALL_REQUIRED",
  "CONTACTED",
  "CONFIRMED",
  "NO_RESPONSE",
  "CLOSED",
] as const;

export const CONTACT_ATTEMPT_TYPES = [
  "DAY_BEFORE_09AM",
  "DAY_BEFORE_CALL_12PM",
  "DAY_BEFORE_CALL_04PM",
  "SAME_DAY_09AM",
  "ONE_HOUR_BEFORE",
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
export type FollowupStatus = (typeof FOLLOWUP_STATUSES)[number];
export type ContactAttemptType = (typeof CONTACT_ATTEMPT_TYPES)[number];
export type ContactChannel = "WHATSAPP" | "CALL";
export type SimulatedResponseAction =
  | "CONFIRM"
  | "REQUEST_RESCHEDULE"
  | "CANCEL"
  | "NO_RESPONSE";
export type SimulatedCallResult =
  | "ANSWERED_CONFIRMED"
  | "ANSWERED_CANCELLED"
  | "ANSWERED_RESCHEDULE"
  | "NO_ANSWER"
  | "WRONG_NUMBER"
  | "PENDING";

export interface CalendarEvent {
  id: string;
  simulationSessionId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  status: "ACTIVE" | "CANCELLED";
  version: number;
  appointmentId?: string;
}

export interface SimulationAppointment extends Appointment {
  patientName: string;
  patientPhone: string;
  branchName: string;
}

export interface SimulatedWhatsAppMessage {
  id: string;
  simulatedMessageId: string;
  simulationSessionId: string;
  appointmentId: string;
  patientName: string;
  recipientPhone: string;
  branchName: string;
  attemptType: ContactAttemptType;
  text: string;
  status: "DELIVERED_SIMULATED";
  sentAt: Date;
  response?: SimulatedResponseAction;
  respondedAt?: Date;
}

export interface SimulatedCallAttempt {
  id: string;
  simulationSessionId: string;
  appointmentId: string;
  patientName: string;
  phone: string;
  attemptType: ContactAttemptType;
  attemptedAt: Date;
  result: SimulatedCallResult;
}

export interface ReceptionTask {
  id: string;
  simulationSessionId: string;
  appointmentId: string;
  taskType: "RESCHEDULE_REQUEST";
  status: "OPEN" | "RESOLVED";
  description: string;
  createdAt: Date;
  resolvedAt?: Date;
}

export interface SimulationCatalogs {
  patients: Array<{ id: string; name: string; phone: string }>;
  branches: Array<{ id: string; name: string }>;
  doctors: Array<{ id: string; branchId: string; name: string }>;
}

export interface Appointment {
  id: string;
  simulationSessionId: string;
  patientId: string;
  branchId: string;
  doctorId: string;
  calendarEventId: string;
  startsAt: Date;
  endsAt: Date;
  appointmentStatus: AppointmentStatus;
  followupStatus: FollowupStatus;
  cancellationReason?: string;
  confirmedAt?: Date;
  cancelledAt?: Date;
  rescheduleRequestedAt?: Date;
  version: number;
}

export interface FollowupTrackingRow {
  appointment: SimulationAppointment;
  lastContact?: { attemptType: ContactAttemptType; channel: ContactChannel; at: Date };
  nextContact?: { attemptType: ContactAttemptType; at: Date };
  attemptCount: number;
}

export interface SimulationMetrics {
  scheduled: number;
  confirmed: number;
  pending: number;
  cancelled: number;
  rescheduleRequested: number;
  noResponse: number;
  simulatedWhatsApps: number;
  simulatedCalls: number;
}

export interface AppointmentStatusChange {
  appointmentId: string;
  fromAppointmentStatus?: AppointmentStatus;
  toAppointmentStatus: AppointmentStatus;
  fromFollowupStatus?: FollowupStatus;
  toFollowupStatus: FollowupStatus;
  reason: string;
  changedAt: Date;
}

export interface SimulatedContactResult {
  id: string;
  idempotencyKey: string;
  appointmentId: string;
  channel: ContactChannel;
  attemptType: ContactAttemptType;
  attemptedAt: Date;
  status: "SENT" | "ANSWERED";
  detail: string;
}
