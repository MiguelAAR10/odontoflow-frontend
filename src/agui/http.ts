import { HttpAgent, type HttpAgentConfig } from "@ag-ui/client";
import { EventSchemas } from "@ag-ui/core/schemas";
import { ApiError, approveProposal, getAiriCard, newIdempotencyKey, toApiError } from "../contracts/client.js";
import type { components } from "../contracts/api";
import { CardSchema, type Card } from "./card.js";
import { EventType, type Event, type RunAgentInput } from "./events.js";
import type { AgentSource } from "./source.js";

export type HttpSourceOptions = Pick<HttpAgentConfig, "fetch"> & { role?: components["schemas"]["RunCreate"]["role"] };
interface RunIntent {
  fingerprint: string;
  key: string;
  events: string[];
  terminal: boolean;
}
interface ActiveRun {
  agent: HttpAgent;
  input: RunAgentInput;
  intent: RunIntent;
  remoteStop?: Promise<void>;
  remoteRunId?: string;
  finish: (event: Event) => void;
}

const RUNS_URL = "/api/backend/agent/runs";

class AiriHttpAgent extends HttpAgent {
  constructor(config: HttpAgentConfig, private readonly role: components["schemas"]["RunCreate"]["role"]) { super(config); }
  protected override requestInit(input: RunAgentInput): RequestInit {
    const ask = input.messages.filter(message => message.role === "user").at(-1)?.content;
    if (typeof ask !== "string" || !ask.trim()) throw new ApiError(422, "INVALID_INPUT", "Escribe una pregunta para AIRI.");
    const body: components["schemas"]["RunCreate"] = { ask, role: this.role, thread_id: input.threadId };
    return { ...super.requestInit(input), body: JSON.stringify(body) };
  }
}

/** HttpAgent decodes SSE; the reducer projects it. Only ask/role/thread_id
 * reach the REST endpoint. Backend run identity is used for remote control;
 * local identity continues to fence the store's callbacks.
 */
export class HttpSource implements AgentSource {
  private active: ActiveRun | null = null;
  // Retry history is retained only while a run has no terminal response.
  private readonly intents = new Map<string, RunIntent>();
  private readonly fetch: NonNullable<HttpAgentConfig["fetch"]>;
  private readonly role: components["schemas"]["RunCreate"]["role"];

  constructor(options: HttpSourceOptions = {}) {
    this.fetch = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
    this.role = options.role ?? "admin";
  }

  async run(input: RunAgentInput, onEvent: (event: Event) => void): Promise<void> {
    if (this.active) throw toApiError(new ApiError(0, "RUN_ACTIVE", "AIRI está trabajando. Detén la tarea actual o espera."));
    const identity = JSON.stringify([input.threadId, input.runId]);
    const fingerprint = JSON.stringify(input);
    let intent = this.intents.get(identity);
    if (intent && intent.fingerprint !== fingerprint) {
      throw toApiError(new ApiError(409, "RUN_INPUT_CHANGED", "La tarea cambió. Inicia un nuevo intento antes de continuar."));
    }
    if (intent?.terminal) {
      throw toApiError(new ApiError(409, "RUN_TERMINAL", "Esta tarea ya terminó. Inicia un nuevo intento."));
    }
    if (!intent) {
      intent = { fingerprint, key: newIdempotencyKey(), events: [], terminal: false };
      this.intents.set(identity, intent);
    }
    const currentIntent = intent;
    let replayed = 0;
    const replayLength = currentIntent.events.length;
    let token!: ActiveRun;
    const agent = new AiriHttpAgent({ url: RUNS_URL, headers: { "Idempotency-Key": currentIntent.key }, fetch: async (url, init) => {
      const response = await this.request(url, init);
      const remoteRunId = response.headers.get("x-run-id");
      if (remoteRunId) token.remoteRunId = remoteRunId;
      return response;
    } }, this.role);
    await new Promise<void>((resolve) => {
      let subscription: ReturnType<ReturnType<HttpAgent["run"]>["subscribe"]> | undefined;
      token = { agent, input: structuredClone(input), intent: currentIntent, finish: (event) => {
        if (this.active !== token) return;
        this.active = null;
        agent.abortRun();
        subscription?.unsubscribe();
        try { onEvent(event); } finally { resolve(); }
      } };
      this.active = token;
      subscription = agent.run(token.input).subscribe({
        next: (raw) => {
          if (this.active !== token) return;
          if (!EventSchemas.safeParse(raw).success) {
            token.finish(this.errorEvent(new ApiError(0, "AGUI_PROTOCOL", "El servidor envió un evento del agente no válido.")));
            return;
          }
          let event = raw as Event;
          if (("runId" in event && event.runId !== (token.remoteRunId ?? token.input.runId))
            || ("threadId" in event && event.threadId !== token.input.threadId)) {
            token.finish(this.errorEvent(new ApiError(0, "AGUI_RUN_MISMATCH", "La respuesta del agente pertenece a otra tarea.")));
            return;
          }
          if ("runId" in event) event = { ...event, runId: token.input.runId };
          const serialized = JSON.stringify(event);
          if (replayed < replayLength) {
            if (currentIntent.events[replayed++] !== serialized) {
              token.finish(this.errorEvent(new ApiError(409, "AGUI_REPLAY_CHANGED", "La respuesta cambió al reconectar. Inicia un nuevo intento.")));
            }
            return;
          }
          currentIntent.events.push(serialized);
          if (event.type === EventType.RUN_FINISHED || event.type === EventType.RUN_ERROR) {
            currentIntent.terminal = true;
            currentIntent.events = [];
            token.finish(event.type === EventType.RUN_ERROR
              ? this.errorEvent(new ApiError(0, event.code ?? "AGENT_ERROR", event.message)) : event);
          } else onEvent(event);
        },
        error: (caught: unknown) => {
          if (token.remoteRunId) currentIntent.terminal = true;
          token.finish(this.errorEvent(caught instanceof ApiError ? caught : new ApiError(0, "NETWORK", "Error de conexión con el servidor.")));
        },
        complete: () => {
          if (token.remoteRunId) currentIntent.terminal = true;
          token.finish(this.errorEvent(new ApiError(0, "AGUI_INCOMPLETE", "La conexión terminó antes de completar la tarea del agente. Revisa las propuestas en la bandeja antes de repetir.")));
        },
      });
      if (this.active !== token) subscription.unsubscribe();
    });
    await token.remoteStop;
  }

  /** Local cancellation is immediate. Return the remote acknowledgement so
   * consumers can report failure after closing run callbacks. run() also awaits
   * it for callers that consume the source directly.
   */
  stop(): void | Promise<void> {
    const token = this.active;
    if (!token) return;
    token.intent.terminal = true;
    token.intent.events = [];
    token.remoteStop = this.request(`${RUNS_URL}/${encodeURIComponent(token.remoteRunId ?? token.input.runId)}/stop`, {
      method: "POST", headers: { "Idempotency-Key": newIdempotencyKey() },
    }).then(() => {});
    token.finish({ type: EventType.RUN_FINISHED, threadId: token.input.threadId, runId: token.input.runId, outcome: { type: "cancelled" } });
    return token.remoteStop;
  }

  async approveCard(card: Card, idempotencyKey: string): Promise<Card> {
    const parsed = CardSchema.parse(card);
    if (parsed.level === "auto" || !parsed.payload_hash || !parsed.proposal_id || parsed.proposal_id < 1) {
      throw new ApiError(422, "INVALID_INPUT", "Esta tarjeta no contiene una propuesta aprobable.");
    }
    await approveProposal(parsed.proposal_id, parsed.payload_hash, idempotencyKey);
    return CardSchema.parse(await getAiriCard(parsed.proposal_id));
  }

  private errorEvent(caught: unknown): Event {
    const error = toApiError(caught);
    return { type: EventType.RUN_ERROR, code: error.code, message: error.message };
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try { response = await this.fetch(url, init); }
    catch { throw toApiError(new ApiError(0, "NETWORK", "Error de conexión con el servidor.")); }
    if (response.ok) return response;
    let data: unknown;
    try { data = await response.json(); } catch { /* Non-envelope bodies never reach the UI. */ }
    const envelope = typeof data === "object" && data !== null && "error" in data ? data.error : undefined;
    if (typeof envelope === "object" && envelope !== null && "code" in envelope && "message" in envelope
      && typeof envelope.code === "string" && typeof envelope.message === "string") {
      throw toApiError(new ApiError(response.status, envelope.code, envelope.message));
    }
    throw toApiError(new ApiError(response.status, "NETWORK", "Error de conexión con el servidor."));
  }
}
