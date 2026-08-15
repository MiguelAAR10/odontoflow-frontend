import { randomUUID } from "node:crypto";
import type { Clock, SendWhatsAppInput, WhatsAppService } from "../domain/ports.js";
import type { SimulatedContactResult } from "../domain/types.js";
import type { SimulatedWhatsAppMessage } from "../domain/types.js";
import type { NewWhatsAppMessage, SimulationRepository } from "./SimulationRepository.js";

export class SimulatedWhatsAppService implements WhatsAppService {
  #events = new Map<string, SimulatedContactResult>();
  #byIdempotency = new Map<string, string>();

  constructor(
    private readonly clock: Clock,
    private readonly repository?: SimulationRepository,
  ) {}

  async sendMessage(input: NewWhatsAppMessage): Promise<SimulatedWhatsAppMessage> {
    if (!this.repository) {
      throw new Error("A SimulationRepository is required for persisted simulated messages");
    }
    return this.repository.createWhatsAppMessage(input);
  }

  async inbox(simulationSessionId: string): Promise<SimulatedWhatsAppMessage[]> {
    if (!this.repository) {
      throw new Error("A SimulationRepository is required for the simulated inbox");
    }
    return this.repository.listWhatsAppMessages(simulationSessionId);
  }

  send(input: SendWhatsAppInput): SimulatedContactResult {
    const priorId = this.#byIdempotency.get(input.idempotencyKey);
    if (priorId) return cloneResult(this.require(priorId));
    const result: SimulatedContactResult = {
      id: randomUUID(),
      idempotencyKey: input.idempotencyKey,
      appointmentId: input.appointmentId,
      channel: "WHATSAPP",
      attemptType: input.attemptType,
      attemptedAt: this.clock.now(),
      status: "SENT",
      detail: `SIMULATED_TEMPLATE:${input.template}`,
    };
    this.#events.set(result.id, result);
    this.#byIdempotency.set(input.idempotencyKey, result.id);
    return cloneResult(result);
  }

  simulateReply(
    outboundId: string,
    reply: "CONFIRMED" | "RESCHEDULE_REQUESTED" | "NO_RESPONSE",
  ): SimulatedContactResult {
    const outbound = this.require(outboundId);
    const key = `reply:${outboundId}:${reply}`;
    const priorId = this.#byIdempotency.get(key);
    if (priorId) return cloneResult(this.require(priorId));
    const result: SimulatedContactResult = {
      ...outbound,
      id: randomUUID(),
      idempotencyKey: key,
      attemptedAt: this.clock.now(),
      status: reply === "NO_RESPONSE" ? "SENT" : "ANSWERED",
      detail: `SIMULATED_REPLY:${reply}`,
    };
    this.#events.set(result.id, result);
    this.#byIdempotency.set(key, result.id);
    return cloneResult(result);
  }

  private require(id: string): SimulatedContactResult {
    const result = this.#events.get(id);
    if (!result) throw new Error(`Simulated WhatsApp event not found: ${id}`);
    return result;
  }
}

function cloneResult(result: SimulatedContactResult): SimulatedContactResult {
  return { ...result, attemptedAt: new Date(result.attemptedAt) };
}
