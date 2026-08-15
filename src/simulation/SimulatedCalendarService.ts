import { randomUUID } from "node:crypto";
import type { CalendarService, CreateCalendarEventInput } from "../domain/ports.js";
import type { CalendarEvent } from "../domain/types.js";

export class SimulatedCalendarService implements CalendarService {
  #events = new Map<string, CalendarEvent>();
  #idempotency = new Map<string, string>();

  create(input: CreateCalendarEventInput): CalendarEvent {
    const priorId = this.#idempotency.get(input.idempotencyKey);
    if (priorId) return cloneEvent(this.require(priorId));
    assertRange(input.startsAt, input.endsAt);

    const event: CalendarEvent = {
      id: randomUUID(),
      simulationSessionId: input.simulationSessionId,
      title: input.title,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      status: "ACTIVE",
      version: 1,
    };
    this.#events.set(event.id, event);
    this.#idempotency.set(input.idempotencyKey, event.id);
    return cloneEvent(event);
  }

  update(
    id: string,
    changes: Partial<Pick<CalendarEvent, "title" | "startsAt" | "endsAt">>,
  ): CalendarEvent {
    const event = this.require(id);
    if (event.status === "CANCELLED") throw new Error("A cancelled event cannot be updated");
    const startsAt = changes.startsAt ?? event.startsAt;
    const endsAt = changes.endsAt ?? event.endsAt;
    assertRange(startsAt, endsAt);

    if (changes.title !== undefined) event.title = changes.title;
    if (changes.startsAt !== undefined) event.startsAt = new Date(changes.startsAt);
    if (changes.endsAt !== undefined) event.endsAt = new Date(changes.endsAt);
    event.version += 1;
    return cloneEvent(event);
  }

  cancel(id: string): CalendarEvent {
    const event = this.require(id);
    if (event.status === "ACTIVE") {
      event.status = "CANCELLED";
      event.version += 1;
    }
    return cloneEvent(event);
  }

  get(id: string): CalendarEvent | undefined {
    const event = this.#events.get(id);
    return event ? cloneEvent(event) : undefined;
  }

  listUpcoming(simulationSessionId: string, from: Date, limit = 100): CalendarEvent[] {
    return [...this.#events.values()]
      .filter(
        (event) =>
          event.simulationSessionId === simulationSessionId &&
          event.status === "ACTIVE" &&
          event.startsAt >= from,
      )
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .slice(0, limit)
      .map(cloneEvent);
  }

  listRange(simulationSessionId: string, from: Date, to: Date): CalendarEvent[] {
    if (from > to) throw new Error("Calendar range start must not be after its end");
    return [...this.#events.values()]
      .filter(
        (event) =>
          event.simulationSessionId === simulationSessionId &&
          event.startsAt < to &&
          event.endsAt > from,
      )
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .map(cloneEvent);
  }

  linkAppointment(eventId: string, appointmentId: string): CalendarEvent {
    const event = this.require(eventId);
    if (event.appointmentId && event.appointmentId !== appointmentId) {
      throw new Error("Calendar event is already linked to another appointment");
    }
    event.appointmentId = appointmentId;
    return cloneEvent(event);
  }

  private require(id: string): CalendarEvent {
    const event = this.#events.get(id);
    if (!event) throw new Error(`Calendar event not found: ${id}`);
    return event;
  }
}

function assertRange(startsAt: Date, endsAt: Date): void {
  if (startsAt >= endsAt) throw new Error("Event end must be after its start");
}

function cloneEvent(event: CalendarEvent): CalendarEvent {
  return { ...event, startsAt: new Date(event.startsAt), endsAt: new Date(event.endsAt) };
}
