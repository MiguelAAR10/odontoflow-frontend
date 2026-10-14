import { AxiosError, AxiosHeaders } from "axios";
import type { Card } from "../card.js";
import { EventType, type Event, type RunAgentInput } from "../events.js";
import type { AgentSource } from "../source.js";
import { matchScenario, type SimRole } from "./match.js";
import { envelopeFor, ScenarioSchema, type ApprovalEnvelope, type Scenario } from "./schema.js";
import duenoCompara from "./fixtures/dueno-compara.json" with { type: "json" };
import adminConfirma from "./fixtures/admin-confirma.json" with { type: "json" };
import adminHueco from "./fixtures/admin-hueco.json" with { type: "json" };
import doctorBrief from "./fixtures/doctor-brief.json" with { type: "json" };
import doctorEvo from "./fixtures/doctor-evo.json" with { type: "json" };
import cvHuecos from "./fixtures/cv-huecos.json" with { type: "json" };
import cvCobranza from "./fixtures/cv-cobranza.json" with { type: "json" };
import cvSedes from "./fixtures/cv-sedes.json" with { type: "json" };

const fixtures: Record<string, unknown> = {
  "dueno-compara": duenoCompara, "admin-confirma": adminConfirma, "admin-hueco": adminHueco,
  "doctor-brief": doctorBrief, "doctor-evo": doctorEvo, "cv-huecos": cvHuecos,
  "cv-cobranza": cvCobranza, "cv-sedes": cvSedes,
};
export interface SimulatedSourceOptions { scenarioId?: string; role?: SimRole; view?: string }
interface ActiveRun {
  input: RunAgentInput;
  emit: (event: Event) => void;
  cancelWait?: (() => void) | undefined;
}

/** Fixture identifiers must not leak into the store's current run fence or
 * collide with previous text/tool turns. Business/card identifiers stay intact.
 */
function rebind(event: Event, input: RunAgentInput): Event {
  const copy = structuredClone(event);
  const fields = copy as unknown as Record<string, unknown>;
  for (const key of ["messageId", "parentMessageId", "toolCallId", "subagentRunId", "parentRunId", "parentToolCallId"]) {
    if (typeof fields[key] === "string") fields[key] = `${input.runId}:${fields[key]}`;
  }
  if ("runId" in copy) copy.runId = input.runId;
  if ("threadId" in copy) copy.threadId = input.threadId;
  return copy;
}

/** Axios-shaped transport failures pass through the shared toApiError mapper. */
function conflict(message: string) {
  return Object.assign(new AxiosError(message, "PROPOSAL_CONFLICT", undefined, undefined, {
    status: 409, statusText: "Conflict", headers: {}, config: { headers: new AxiosHeaders() },
    data: { error: { code: "PROPOSAL_CONFLICT", message } },
  }), { httpStatus: 409 });
}

export class SimulatedSource implements AgentSource {
  private readonly proposals = new Map<string, { card: Card; envelope: ApprovalEnvelope; approved: boolean }>();
  private readonly approvals = new Map<string, { fingerprint: string; card: Card }>();
  private active: ActiveRun | null = null;
  constructor(private readonly options: SimulatedSourceOptions = {}) {}

  async run(input: RunAgentInput, onEvent: (event: Event) => void): Promise<void> {
    if (this.active) throw new Error("AIRI está trabajando. Detén la tarea actual o espera.");
    const text = input.messages.filter((message) => message.role === "user").at(-1)?.content;
    const match = matchScenario(typeof text === "string" ? text : "", this.options.role ?? "admin", this.options.view ?? "home");
    const id = this.options.scenarioId ?? match.scenarioId;
    let steps: Scenario;
    if (id) {
      if (!Object.hasOwn(fixtures, id)) throw new Error(`Escenario desconocido: ${id}`);
      steps = ScenarioSchema.parse(fixtures[id]);
    } else {
      steps = [
        { delayMs: 0, event: { type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId, agent: "airi" } },
        { delayMs: 0, event: { type: EventType.CUSTOM, name: "airi.notice", value: { text: match.message } } },
        { delayMs: 0, event: { type: EventType.RUN_FINISHED, threadId: input.threadId, runId: input.runId, outcome: { type: "success" } } },
      ];
    }
    const token: ActiveRun = { input, emit: onEvent };
    this.active = token;
    try {
      for (const step of steps) {
        if (this.active !== token) return;
        if (step.delayMs > 0) {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, step.delayMs);
            token.cancelWait = () => { clearTimeout(timer); resolve(); };
          });
          token.cancelWait = undefined;
        }
        if (this.active !== token) return;
        const event = rebind(step.event, input);
        if (event.type === "RUN_FINISHED") {
          if (event.outcome?.type === "interrupt") {
            for (const interrupt of event.outcome.interrupts) {
              const card = interrupt.metadata?.card;
              if (!card) continue;
              const envelope = envelopeFor(card);
              this.proposals.set(card.id, { card: structuredClone(card), envelope, approved: false });
              interrupt.metadata = { ...interrupt.metadata, approval: { ...envelope } };
            }
          }
          this.active = null;
        }
        onEvent(event);
      }
    } finally {
      token.cancelWait?.();
      if (this.active === token) this.active = null;
    }
  }

  /** Human-only call. Text events never invoke this method. A3's envelope stays
   * outside Card until backend Card.json gains version/payload_hash.
   */
  async approve(request: ApprovalEnvelope, idempotencyKey: string): Promise<Card> {
    if (!idempotencyKey.trim()) throw conflict("Falta la clave de idempotencia del intento.");
    const fingerprint = JSON.stringify([request.cardId, request.version, request.payload_hash]);
    const replay = this.approvals.get(idempotencyKey);
    if (replay) {
      if (replay.fingerprint !== fingerprint) throw conflict("La clave de idempotencia pertenece a otro intento.");
      return structuredClone(replay.card);
    }
    const proposal = this.proposals.get(request.cardId);
    if (!proposal || proposal.approved || proposal.card.level === "auto"
      || proposal.envelope.version !== request.version || proposal.envelope.payload_hash !== request.payload_hash) {
      throw conflict("La propuesta cambió. Revisa la tarjeta actual antes de aprobar.");
    }
    const card: Card = { ...proposal.card, state: "approved" };
    proposal.approved = true;
    this.approvals.set(idempotencyKey, { fingerprint, card: structuredClone(card) });
    return structuredClone(card);
  }

  /** Adapter for createAgentStore's ApprovalHandler; hashes the submitted copy,
   * so editing any scope/body field invalidates an old proposal.
   */
  readonly approveCard = (card: Card, idempotencyKey: string): Promise<Card> =>
    this.approve(envelopeFor(card), idempotencyKey);

  stop(): void {
    const token = this.active;
    if (!token) return;
    this.active = null;
    token.cancelWait?.();
    token.emit({ type: EventType.RUN_FINISHED, threadId: token.input.threadId, runId: token.input.runId, outcome: { type: "cancelled" } });
  }
}
