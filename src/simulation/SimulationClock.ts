import type { MutableSimulationClock } from "../domain/ports.js";

export class SimulationClock implements MutableSimulationClock {
  readonly timeZone = "America/Lima";
  #currentTime: Date;

  constructor(initialTime: Date) {
    this.#currentTime = validDate(initialTime);
  }

  now(): Date {
    return new Date(this.#currentTime);
  }

  set(instant: Date): void {
    this.#currentTime = validDate(instant);
  }

  setTime(instant: Date): void {
    this.set(instant);
  }

  getCurrentTime(): Date {
    return this.now();
  }

  advanceMinutes(minutes: number): Date {
    return this.advanceBy(minutes * 60_000);
  }

  advanceHours(hours: number): Date {
    return this.advanceBy(hours * 3_600_000);
  }

  advanceDays(days: number): Date {
    return this.advanceBy(days * 86_400_000);
  }

  advanceBy(milliseconds: number): Date {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new Error("Simulation time can only advance by a non-negative duration");
    }
    this.#currentTime = new Date(this.#currentTime.getTime() + milliseconds);
    return this.now();
  }
}

function validDate(value: Date): Date {
  const copy = new Date(value);
  if (Number.isNaN(copy.getTime())) throw new Error("Invalid simulation time");
  return copy;
}
