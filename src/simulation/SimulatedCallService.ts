import { randomUUID } from "node:crypto";
import type { CallService, Clock, PlaceCallInput } from "../domain/ports.js";
import type { SimulatedContactResult } from "../domain/types.js";
import type { SimulatedCallAttempt } from "../domain/types.js";
import type { NewCallAttempt, SimulationRepository } from "./SimulationRepository.js";

export class SimulatedCallService implements CallService {
  #byIdempotency = new Map<string, SimulatedContactResult>();

  constructor(
    private readonly clock: Clock,
    private readonly repository?: SimulationRepository,
  ) {}

  async recordAttempt(input: NewCallAttempt): Promise<SimulatedCallAttempt> {
    if (!this.repository) {
      throw new Error("A SimulationRepository is required for persisted simulated calls");
    }
    return this.repository.createCallAttempt(input);
  }

  async attempts(simulationSessionId: string): Promise<SimulatedCallAttempt[]> {
    if (!this.repository) {
      throw new Error("A SimulationRepository is required for persisted simulated calls");
    }
    return this.repository.listCallAttempts(simulationSessionId);
  }

  place(input: PlaceCallInput): SimulatedContactResult {
    const prior = this.#byIdempotency.get(input.idempotencyKey);
    if (prior) return cloneResult(prior);
    const outcome = input.outcome ?? "NO_ANSWER";
    const result: SimulatedContactResult = {
      id: randomUUID(),
      idempotencyKey: input.idempotencyKey,
      appointmentId: input.appointmentId,
      channel: "CALL",
      attemptType: input.attemptType,
      attemptedAt: this.clock.now(),
      status: outcome === "ANSWERED" ? "ANSWERED" : "SENT",
      detail: `SIMULATED_CALL:${outcome}`,
    };
    this.#byIdempotency.set(input.idempotencyKey, result);
    return cloneResult(result);
  }
}

function cloneResult(result: SimulatedContactResult): SimulatedContactResult {
  return { ...result, attemptedAt: new Date(result.attemptedAt) };
}
