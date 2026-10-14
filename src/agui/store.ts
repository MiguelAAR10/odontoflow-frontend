"use client";

import { useMemo, useSyncExternalStore } from "react";
import { CardSchema, canApproveCard, type Card } from "./card.js";
import { EventType, type Event, type Message, type RunAgentInput } from "./events.js";
import { createInitialState, reducer, type AgentAction, type RunState } from "./reducer.js";
import type { AgentSource } from "./source.js";

export interface ApiErrorEnvelope { code: string; message: string; httpStatus: number }
export type ApprovalHandler = (card: Card, idempotencyKey: string) => Promise<Card>;
export interface AgentStoreDependencies {
  source: AgentSource;
  approveCard?: ApprovalHandler;
  /** Inject src/api.ts's toApiError at composition time, alongside the mode's
   * source. Keeping transport imports out of the core avoids importing mocks. */
  toApiError: (error: unknown) => ApiErrorEnvelope;
  newIdempotencyKey?: () => string;
}
export interface AgentStore {
  getSnapshot(): RunState;
  getServerSnapshot(): RunState;
  subscribe(listener: () => void): () => void;
  configure(dependencies: AgentStoreDependencies): void;
  send(input: string | RunAgentInput): Promise<void>;
  stop(): void;
  approve(cardId: string): Promise<void>;
  setDocked(value: boolean): void;
  setPanelOpen(value: boolean): void;
  clear(): void;
}

function localError(code: string, message: string): Error & ApiErrorEnvelope {
  return Object.assign(new Error(message), { code, httpStatus: 0 });
}

function threadMessages(state: RunState): Message[] {
  return state.thread.flatMap((turn) => {
    const content = turn.parts.flatMap((part) => part.type === "text" ? [part.text] : []).join("");
    return content ? [{ id: turn.id, role: turn.role, content }] : [];
  });
}

const wireTypes = new Set<string>(Object.values(EventType));

/** One store per client/session. No source or approval is selected implicitly;
 * composition (B2/E2) chooses the mode and injects the adapter's error mapper.
 */
export function createAgentStore(initialDependencies?: AgentStoreDependencies): AgentStore {
  const serverSnapshot = createInitialState();
  let state = serverSnapshot;
  let dependencies = initialDependencies;
  let epoch = 0;
  let active: { source: AgentSource; cancel: () => void } | null = null;
  const listeners = new Set<() => void>();
  const intents = new Map<string, { fingerprint: string; key: string; promise?: Promise<void> }>();
  const publish = (next: RunState) => {
    if (next === state) return;
    state = next;
    for (const listener of [...listeners]) listener();
  };
  const dispatch = (event: Event | AgentAction) => publish(reducer(state, event));
  const key = () => dependencies?.newIdempotencyKey?.() ?? crypto.randomUUID();
  const cancelActive = (): ApiErrorEnvelope | null => {
    const token = active;
    if (!token) return null;
    active = null; token.cancel();
    try { token.source.stop(); return null; }
    catch (caught) { return dependencies!.toApiError(caught); }
  };

  const store: AgentStore = {
    getSnapshot: () => state,
    // A fixed empty snapshot avoids sharing another user's thread through SSR.
    getServerSnapshot: () => serverSnapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    configure(next) { store.clear(); dependencies = next; },
    async send(value) {
      if (!dependencies) throw localError("AGENT_SOURCE_UNAVAILABLE", "La fuente del agente no está configurada.");
      if (active) throw localError("RUN_ACTIVE", "AIRI está trabajando. Detén la tarea actual o espera.");
      if (typeof value === "string" && !value.trim()) return;
      const services = dependencies;
      const input: RunAgentInput = typeof value === "string" ? {
        threadId: state.threadId ?? key(), runId: key(), messages: [], tools: [], context: [],
      } : { ...value };
      if (state.threadId && state.threadId !== input.threadId) store.clear();
      const text = typeof value === "string" ? value.trim() : input.messages.filter((message) => message.role === "user").at(-1)?.content;
      let prepared = state;
      if (typeof text === "string") {
        const messageId = typeof value === "string" ? key() : input.messages.filter((message) => message.role === "user").at(-1)!.id;
        prepared = reducer(state, { type: "USER_MESSAGE", threadId: input.threadId, messageId, text });
      }
      if (typeof value === "string") { input.messages = threadMessages(prepared); input.state = prepared.worldState; }
      let cancel = () => {};
      const completed = new Promise<void>((resolve) => { cancel = resolve; });
      const token = { source: services.source, cancel };
      const runEpoch = epoch;
      let accepting = true;
      active = token;
      publish(reducer(prepared, { type: "RUN_REQUESTED", threadId: input.threadId, runId: input.runId }));
      const onEvent = (event: Event) => {
        if (!accepting || active !== token || epoch !== runEpoch || !wireTypes.has(event.type)) return;
        if ("runId" in event && event.runId !== input.runId) return;
        if ("threadId" in event && event.threadId !== input.threadId) return;
        if (event.type === EventType.RUN_FINISHED || event.type === EventType.RUN_ERROR) {
          accepting = false; active = null; cancel();
        }
        dispatch(event);
      };
      try {
        if (active !== token || epoch !== runEpoch) return;
        await Promise.race([services.source.run(input, onEvent), completed]);
        if (accepting && active === token && epoch === runEpoch) {
          const error = services.toApiError(localError("INCOMPLETE_RUN", "La fuente cerró sin finalizar la tarea."));
          onEvent({ type: EventType.RUN_ERROR, code: error.code, message: error.message });
        }
      } catch (caught) {
        if (accepting && active === token && epoch === runEpoch) {
          const error = services.toApiError(caught);
          onEvent({ type: EventType.RUN_ERROR, code: error.code, message: error.message });
        }
      } finally {
        accepting = false;
        if (active === token) active = null;
      }
    },
    stop() {
      if (!active) return;
      let stopped = reducer(state, { type: "RUN_STOPPED" });
      const error = cancelActive();
      if (error) {
        // The local fence still stopped projection, even if cancellation I/O failed.
        stopped = { ...stopped, trace: [...stopped.trace, { type: "STOP_ERROR", runId: stopped.run.id,
          agent: stopped.run.agent, timestamp: null, message: error.message }] };
      }
      publish(stopped);
    },
    approve(cardId) {
      const services = dependencies;
      const entry = state.cards[cardId];
      const previous = intents.get(cardId);
      if (previous?.promise) return previous.promise;
      if (!entry || !canApproveCard(entry)) {
        return Promise.reject(localError("CARD_NOT_PENDING", "La tarjeta no está pendiente de aprobación."));
      }
      if (!services?.approveCard) return Promise.reject(localError("APPROVAL_UNAVAILABLE", "La aprobación no está configurada."));
      const submitted = CardSchema.parse(entry.card);
      const fingerprint = JSON.stringify(submitted);
      const intent: { fingerprint: string; key: string; promise?: Promise<void> } =
        previous?.fingerprint === fingerprint ? previous : { fingerprint, key: key() };
      const approvalEpoch = epoch;
      const isCurrent = () => epoch === approvalEpoch && JSON.stringify(state.cards[cardId]?.card) === fingerprint;
      dispatch({ type: "CARD_APPROVAL_STARTED", cardId });
      const promise = Promise.resolve().then(() => services.approveCard!(submitted, intent.key)).then((response) => {
        const confirmed = CardSchema.parse(response);
        if (confirmed.id !== cardId || confirmed.state !== "approved") {
          throw localError("APPROVAL_NOT_CONFIRMED", "El servidor no confirmó la aprobación de esta tarjeta.");
        }
        if (isCurrent()) dispatch({ type: "CARD_APPROVED", card: confirmed });
      }).catch((caught: unknown) => {
        const error = services.toApiError(caught);
        if (isCurrent()) dispatch({ type: "CARD_APPROVAL_FAILED", cardId, message: error.message });
        throw error;
      }).finally(() => { if (intents.get(cardId) === intent) delete intent.promise; });
      intent.promise = promise;
      intents.set(cardId, intent);
      return promise;
    },
    setDocked(value) { dispatch({ type: "SET_DOCKED", value }); },
    setPanelOpen(value) { dispatch({ type: "SET_PANEL_OPEN", value }); },
    clear() { epoch += 1; cancelActive(); intents.clear(); publish(createInitialState()); },
  };
  return store;
}

export const agentStore = createAgentStore();

/** Cache selector results for each immutable snapshot, even when a selector
 * creates an object. Primitive selectors skip renders on unrelated updates. */
export function useAgentStore<T>(selector: (state: RunState) => T, store: AgentStore = agentStore): T {
  const getters = useMemo(() => {
    let previous: RunState | undefined;
    let selected: T;
    const select = (snapshot: RunState) => {
      if (snapshot !== previous) { previous = snapshot; selected = selector(snapshot); }
      return selected;
    };
    return { client: () => select(store.getSnapshot()), server: () => select(store.getServerSnapshot()) };
  }, [selector, store]);
  return useSyncExternalStore(store.subscribe, getters.client, getters.server);
}
