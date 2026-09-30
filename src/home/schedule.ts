import type { Appointment } from "../types";

/**
 * Pure time boundary for the Home "Turno de hoy" worklist.
 *
 * Home renders only backend-provided appointment values; this module decides
 * where the single `Ahora` anchor sits and which rows collapse behind
 * "Ver N anteriores". It performs no business computation and invents no data:
 * unparseable times stay visible in the upcoming group so real rows are never
 * hidden by a formatting surprise.
 */

/** Parse an "HH:MM" wall time into minutes since midnight, or null. */
export function timeToMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Current wall-clock minutes, injectable in tests. */
export function nowMinutes(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}

export interface WorklistSplit {
  /** Strictly-before-now rows, ascending by time. Collapsed by default. */
  past: Appointment[];
  /** Now-or-later rows (plus unparseable ones), ascending by time. Always visible. */
  upcoming: Appointment[];
  /** Id of the single row carrying the `Ahora` anchor, or null. */
  nowId: string | null;
}

export function splitWorklist(appointments: Appointment[], currentMinutes: number): WorklistSplit {
  const sorted = [...appointments].sort((left, right) => left.time.localeCompare(right.time));
  const past: Appointment[] = [];
  const upcoming: Appointment[] = [];
  for (const appointment of sorted) {
    const minutes = timeToMinutes(appointment.time);
    if (minutes !== null && minutes < currentMinutes) past.push(appointment);
    else upcoming.push(appointment);
  }
  return { past, upcoming, nowId: upcoming.length > 0 ? upcoming[0].id : null };
}
