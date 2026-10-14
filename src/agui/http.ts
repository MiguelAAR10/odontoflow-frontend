import { HttpAgent, type HttpAgentConfig } from "@ag-ui/client";
import { EventSchemas } from "@ag-ui/core/schemas";
import { ApiError, newIdempotencyKey, toApiError } from "../contracts/client.js";
import { EventType, type Event, type RunAgentInput } from "./events.js";
import type { AgentSource } from "./source.js";

export type HttpSourceOptions = Pick<HttpAgentConfig, "fetch">;
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
  finish: (event: Event) => void;
}

const RUNS_URL = "/api/backend/agent/runs";

/** HttpAgent owns SSE decoding; AIRI's reducer owns projection. The raw run
 * stream preserves AIRI extensions and sends the caller's exact AG-UI input,
 * rather than letting the SDK build a second message/state projection.
 */
export class HttpSource implements AgentSource {
  private active: ActiveRun | null = null;
  // Retry history is retained only while a run has no terminal response.
  private readonly intents = new Map<string, RunIntent>();
  private readonly fetch: NonNullable<HttpAgentConfig["fetch"]>;

  constructor(options: HttpSourceOptions = {}) {
    this.fetch = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
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
    const agent = new HttpAgent({ url: RUNS_URL, headers: { "Idempotency-Key": currentIntent.key }, fetch: (url, init) => this.request(url, init) });
    let token!: ActiveRun;
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
          const event = raw as Event;
          if (("runId" in event && event.runId !== token.input.runId)
            || ("threadId" in event && event.threadId !== token.input.threadId)) {
            token.finish(this.errorEvent(new ApiError(0, "AGUI_RUN_MISMATCH", "La respuesta del agente pertenece a otra tarea.")));
            return;
          }
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
          token.finish(this.errorEvent(caught instanceof ApiError ? caught : new ApiError(0, "NETWORK", "Error de conexión con el servidor.")));
        },
        complete: () => token.finish(this.errorEvent(new ApiError(0, "AGUI_INCOMPLETE", "La conexión terminó antes de completar la tarea del agente."))),
      });
      if (this.active !== token) subscription.unsubscribe();
    });
    await token.remoteStop;
  }

  /** Local cancellation is immediate. run() also awaits the stop acknowledgement
   * and rejects with ApiError if the backend cannot confirm it.
   */
  stop(): void {
    const token = this.active;
    if (!token) return;
    token.intent.terminal = true;
    token.intent.events = [];
    token.remoteStop = this.request(`${RUNS_URL}/${encodeURIComponent(token.input.runId)}/stop`, {
      method: "POST", headers: { "Idempotency-Key": newIdempotencyKey() },
    }).then(() => {});
    token.finish({ type: EventType.RUN_FINISHED, threadId: token.input.threadId, runId: token.input.runId, outcome: { type: "cancelled" } });
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
