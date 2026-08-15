import type {
  CalendarEvent,
  ContactAttemptType,
  SimulatedContactResult,
} from "./types.js";

export interface Clock {
  now(): Date;
}

export interface MutableSimulationClock extends Clock {
  set(instant: Date): void;
  advanceBy(milliseconds: number): Date;
  setTime(instant: Date): void;
  advanceMinutes(minutes: number): Date;
  advanceHours(hours: number): Date;
  advanceDays(days: number): Date;
  getCurrentTime(): Date;
}

export interface CreateCalendarEventInput {
  idempotencyKey: string;
  simulationSessionId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
}

export interface CalendarService {
  create(input: CreateCalendarEventInput): CalendarEvent;
  update(
    id: string,
    changes: Partial<Pick<CalendarEvent, "title" | "startsAt" | "endsAt">>,
  ): CalendarEvent;
  cancel(id: string): CalendarEvent;
  get(id: string): CalendarEvent | undefined;
  listUpcoming(simulationSessionId: string, from: Date, limit?: number): CalendarEvent[];
  listRange(simulationSessionId: string, from: Date, to: Date): CalendarEvent[];
  linkAppointment(eventId: string, appointmentId: string): CalendarEvent;
}

export interface SendWhatsAppInput {
  idempotencyKey: string;
  appointmentId: string;
  attemptType: ContactAttemptType;
  template: string;
}

export interface WhatsAppService {
  send(input: SendWhatsAppInput): SimulatedContactResult;
  simulateReply(
    outboundId: string,
    reply: "CONFIRMED" | "RESCHEDULE_REQUESTED" | "NO_RESPONSE",
  ): SimulatedContactResult;
}

export interface PlaceCallInput {
  idempotencyKey: string;
  appointmentId: string;
  attemptType: ContactAttemptType;
  outcome?: "ANSWERED" | "NO_ANSWER";
}

export interface CallService {
  place(input: PlaceCallInput): SimulatedContactResult;
}
