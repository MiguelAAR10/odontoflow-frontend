import { z } from "zod";
import { AgentIdSchema, CardSchema, canApproveCard, type AgentId, type Card, type CardEntry, type CardStatus } from "./card.js";
import { EventType, type Event, type JsonPatch } from "./events.js";

export type AgentStatus = "idle" | "thinking" | "working" | "handoff" | "done" | "needs-you";
export type RunStatus = "idle" | "working" | "waiting" | "stopped" | "done" | "error";
export interface PlanStep { label: string; status: "pending" | "working" | "done" }
export type ThreadPart =
  | { type: "text"; text: string; streaming: boolean }
  | { type: "card"; cardId: string }
  | { type: "tool"; toolCallId: string; name: string; args: string; result: string | null; status: "working" | "done" | "stopped" | "error" }
  | { type: "notice"; text: string }
  | { type: "part"; key: string; props?: unknown };
export interface ThreadTurn {
  id: string;
  role: "user" | "assistant";
  agent: AgentId | null;
  parts: ThreadPart[];
}
export interface TraceEntry {
  type: string; runId: string | null; agent: AgentId; timestamp: number | null; message: string | null;
  cardId?: string;
}
export interface RunState {
  threadId: string | null;
  thread: ThreadTurn[];
  run: { id: string | null; status: RunStatus; agent: AgentId; what: string; plan: PlanStep[]; step: number };
  cards: Record<string, CardEntry>;
  agents: Record<AgentId, AgentStatus>;
  trace: TraceEntry[];
  worldState: unknown;
  docked: boolean;
  panelOpen: boolean;
}

/** Only the human-facing store dispatches these. Sources cannot dispatch them. */
export type AgentAction = (
  | { type: "USER_MESSAGE"; threadId: string; messageId: string; text: string }
  | { type: "RUN_REQUESTED"; threadId: string; runId: string; agent?: AgentId; plan?: string[]; what?: string }
  | { type: "RUN_STOPPED" }
  | { type: "CARD_APPROVAL_STARTED"; cardId: string }
  | { type: "CARD_APPROVED"; card: Card }
  | { type: "CARD_APPROVAL_FAILED"; cardId: string; message: string }
  | { type: "SET_DOCKED"; value: boolean }
  | { type: "SET_PANEL_OPEN"; value: boolean }
) & { timestamp?: number };

export function createInitialState(): RunState {
  return {
    threadId: null, thread: [],
    run: { id: null, status: "idle", agent: "airi", what: "", plan: [], step: -1 },
    cards: {},
    agents: { airi: "idle", cepillo: "idle", pasta: "idle", hilo: "idle", enjuague: "idle", espejo: "idle", escudo: "idle" },
    trace: [], worldState: {}, docked: false, panelOpen: false,
  };
}

function appendTrace(state: RunState, event: { type: string; timestamp?: number; agent?: AgentId }, message: string | null = null, cardId?: string): RunState {
  return { ...state, trace: [...state.trace, {
    type: event.type, runId: state.run.id, agent: event.agent ?? state.run.agent, timestamp: event.timestamp ?? null, message,
    ...(cardId ? { cardId } : {}),
  }] };
}

function updateTurn(state: RunState, id: string, agent: AgentId, update: (parts: ThreadPart[]) => ThreadPart[]): RunState {
  const exists = state.thread.some((turn) => turn.id === id);
  const thread = exists ? state.thread : [...state.thread, { id, role: "assistant" as const, agent, parts: [] }];
  return { ...state, thread: thread.map((turn) => turn.id === id ? { ...turn, parts: update(turn.parts) } : turn) };
}

function updateTool(state: RunState, toolCallId: string, update: (part: Extract<ThreadPart, { type: "tool" }>) => ThreadPart): RunState {
  return { ...state, thread: state.thread.map((turn) => ({ ...turn,
    parts: turn.parts.map((part) => part.type === "tool" && part.toolCallId === toolCallId ? update(part) : part),
  })) };
}

function needsHuman(state: RunState, agent: AgentId): boolean {
  return Object.values(state.cards).some((entry) => entry.card.agent === agent && (entry.status === "pending" || entry.status === "error"
    || (entry.status === "loading" && entry.loadingReason === "approval")));
}

function restingAgents(state: RunState): RunState["agents"] {
  return Object.fromEntries(AgentIdSchema.options.map((agent) => [agent,
    state.agents[agent] === "needs-you" || needsHuman(state, agent) ? "needs-you" : "idle",
  ])) as RunState["agents"];
}

function placeCard(state: RunState, value: unknown, status: CardStatus): RunState {
  const parsed = CardSchema.safeParse(value);
  if (!parsed.success) return state;
  const card = parsed.data;
  const previous = state.cards[card.id];
  // An agent can prepare a card, but cannot approve or overwrite a confirmed one.
  if (previous?.status === "approved") return state;
  // Repeated stream/interrupt metadata must not reset the same human intent.
  if (previous?.loadingReason === "approval" && JSON.stringify(previous.card) === JSON.stringify(card)) return state;
  const next = { ...state, cards: { ...state.cards, [card.id]: { card, status, runId: state.run.id, error: null,
    ...(status === "loading" ? { loadingReason: "tool" as const } : {}),
  } } };
  if (state.thread.some((turn) => turn.parts.some((part) => part.type === "card" && part.cardId === card.id))) return next;
  return updateTurn(next, `card:${state.run.id}:${card.id}`, card.agent, (parts) => [...parts, { type: "card", cardId: card.id }]);
}

function resultCard(state: RunState, value: unknown): RunState {
  const parsed = CardSchema.safeParse(value);
  if (!parsed.success) return state;
  const card = parsed.data;
  // Agent events cannot confirm a human approval or reopen terminal proposals.
  const status = card.state === "declined" ? "rejected"
    : card.level !== "auto" && (card.state === "ready" || card.state === "pending") ? "pending" : "done";
  return placeCard(state, card, status);
}

const partSchema = z.strictObject({ key: z.string().min(1), props: z.unknown().optional() });
const noticeSchema = z.strictObject({ text: z.string().min(1) });

function closeWork(state: RunState, status: "stopped" | "error" | "done"): RunState {
  return { ...state,
    cards: Object.fromEntries(Object.entries(state.cards).map(([id, entry]) => [id,
      entry.runId === state.run.id && entry.status === "loading" && entry.loadingReason !== "approval" ? { ...entry, status } : entry,
    ])),
    thread: state.thread.map((turn) => ({ ...turn, parts: turn.parts.map((part) =>
      part.type === "text" ? { ...part, streaming: false }
        : part.type === "tool" && part.status === "working" ? { ...part, status } : part,
    ) })),
  };
}

function pointer(path: string): string[] {
  if (path === "") return [];
  if (!path.startsWith("/") || /~(?![01])/.test(path)) throw new Error("Invalid pointer");
  const keys = path.slice(1).split("/").map((key) => key.replace(/~1/g, "/").replace(/~0/g, "~"));
  if (keys.some((key) => ["__proto__", "constructor", "prototype"].includes(key))) throw new Error("Unsafe pointer");
  return keys;
}

function member(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object" || !Object.hasOwn(value, key)) throw new Error("Missing path");
  if (Array.isArray(value) && !/^(0|[1-9]\d*)$/.test(key)) throw new Error("Invalid index");
  return (value as Record<string, unknown>)[key];
}

function readPath(value: unknown, keys: string[]): unknown {
  return keys.reduce((current, key) => member(current, key), value);
}

function writePath(root: unknown, keys: string[], op: "add" | "remove" | "replace", value?: unknown): unknown {
  if (!keys.length) return op === "remove" ? undefined : structuredClone(value);
  const parent = readPath(root, keys.slice(0, -1));
  const key = keys[keys.length - 1]!;
  if (parent === null || typeof parent !== "object") throw new Error("Missing parent");
  if (Array.isArray(parent)) {
    const index = key === "-" && op === "add" ? parent.length : /^(0|[1-9]\d*)$/.test(key) ? Number(key) : -1;
    if (index < 0 || index > parent.length || (op !== "add" && index === parent.length)) throw new Error("Invalid index");
    if (op === "add") parent.splice(index, 0, structuredClone(value));
    else if (op === "remove") parent.splice(index, 1);
    else parent[index] = structuredClone(value);
  } else {
    const object = parent as Record<string, unknown>;
    if (op !== "add" && !Object.hasOwn(object, key)) throw new Error("Missing path");
    if (op === "remove") delete object[key];
    else object[key] = structuredClone(value);
  }
  return root;
}

function equalJson(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object" || Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key)
    && equalJson((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}

/** Clone once so failure rolls back the entire patch, including earlier ops. */
function applyPatch(snapshot: unknown, patch: JsonPatch): unknown {
  let value = structuredClone(snapshot);
  for (const operation of patch) {
    const keys = pointer(operation.path);
    switch (operation.op) {
      case "add": case "replace": value = writePath(value, keys, operation.op, operation.value); break;
      case "remove": value = writePath(value, keys, "remove"); break;
      case "test":
        if (!equalJson(readPath(value, keys), operation.value)) throw new Error("Test failed");
        break;
      case "copy": case "move": {
        const from = pointer(operation.from);
        if (operation.op === "move" && keys.length > from.length && from.every((key, i) => keys[i] === key)) throw new Error("Moving into descendant");
        const item = structuredClone(readPath(value, from));
        if (operation.op === "move") value = writePath(value, from, "remove");
        value = writePath(value, keys, "add", item);
        break;
      }
      default: throw new Error("Unknown operation");
    }
  }
  return value;
}

/** Pure projection: timestamps and identifiers come from events, never a clock. */
export function reducer(state: RunState, event: Event | AgentAction): RunState;
export function reducer(state: RunState, event: { type: string; [key: string]: unknown }): RunState;
export function reducer(state: RunState, incoming: { type: string }): RunState {
  const event = incoming as Event | AgentAction;
  const agent = "agent" in event ? event.agent ?? state.run.agent : state.run.agent;
  let next = state;
  switch (event.type) {
    case "USER_MESSAGE":
      return { ...state, threadId: event.threadId, thread: [...state.thread, {
        id: event.messageId, role: "user", agent: null, parts: [{ type: "text", text: event.text, streaming: false }],
      }] };
    case "SET_DOCKED":
      return state.docked === event.value ? state : { ...state, docked: event.value };
    case "SET_PANEL_OPEN":
      return state.panelOpen === event.value ? state : { ...state, panelOpen: event.value };
    case "RUN_STOPPED":
      if (state.run.status !== "working") return state;
      next = closeWork({ ...state, run: { ...state.run, status: "stopped", what: "Detenido · lo hecho queda en el rastro" }, agents: restingAgents(state) }, "stopped");
      return appendTrace(next, event, "Tarea detenida por ti");
    case "CARD_APPROVAL_STARTED": {
      const entry = state.cards[event.cardId];
      if (!entry || !canApproveCard(entry)) return state;
      return { ...state, cards: { ...state.cards, [event.cardId]: { ...entry, status: "loading", loadingReason: "approval", error: null } } };
    }
    case "CARD_APPROVED": {
      const entry = state.cards[event.card.id];
      if (!entry || event.card.state !== "approved") return state;
      next = { ...state, cards: { ...state.cards, [event.card.id]: { ...entry, card: event.card, status: "approved", loadingReason: null, error: null } } };
      const needsRun = Object.values(next.cards).some((item) => item.runId === state.run.id && (item.status === "pending" || item.status === "error" || item.status === "loading"));
      const agents = { ...next.agents };
      for (const id of AgentIdSchema.options) {
        if (agents[id] !== "needs-you" && id !== event.card.agent) continue;
        agents[id] = needsHuman(next, id) || (id === state.run.agent && state.run.status === "waiting" && needsRun) ? "needs-you" : "done";
      }
      next = { ...next, agents,
        run: state.run.status === "waiting" && !needsRun ? { ...state.run, status: "done", what: "Aprobado" } : state.run,
      };
      return appendTrace(next, { ...event, agent: event.card.agent }, event.card.result ?? "Aprobado por ti", event.card.id);
    }
    case "CARD_APPROVAL_FAILED": {
      const entry = state.cards[event.cardId];
      if (!entry) return state;
      next = { ...state, cards: { ...state.cards, [event.cardId]: { ...entry, status: "error", error: event.message } },
        agents: { ...state.agents, [entry.card.agent]: "needs-you" },
      };
      return appendTrace(next, event, event.message);
    }
    case "RUN_REQUESTED":
    case EventType.RUN_STARTED:
      next = { ...state, threadId: event.threadId,
        run: { id: event.runId, status: "working", agent, what: event.what ?? "",
          plan: (event.plan ?? []).map((label) => ({ label, status: "pending" })), step: -1 },
        agents: { ...restingAgents(state), [agent]: "thinking" },
      };
      break;
    case EventType.STEP_STARTED: {
      let step = event.index ?? state.run.plan.findIndex((part) => part.label === event.stepName);
      const plan = [...state.run.plan];
      if (step < 0 || step >= plan.length) { step = plan.length; plan.push({ label: event.stepName, status: "pending" }); }
      next = { ...state, run: { ...state.run, step, agent, what: event.stepName,
        plan: plan.map((part, i) => ({ ...part, status: i < step ? "done" : i === step ? "working" : "pending" })),
      }, agents: { ...state.agents, [agent]: "working" } };
      break;
    }
    case EventType.STEP_FINISHED:
      next = { ...state, run: { ...state.run,
        plan: state.run.plan.map((part) => part.label === event.stepName ? { ...part, status: "done" } : part),
      } };
      break;
    case EventType.SUBAGENT_STARTED: {
      const parsed = AgentIdSchema.safeParse(event.agent ?? event.name);
      if (!parsed.success) return state;
      next = { ...state, run: { ...state.run, agent: parsed.data },
        agents: { ...restingAgents(state), [state.run.agent]: "handoff", [parsed.data]: "working" },
      };
      break;
    }
    case EventType.TEXT_MESSAGE_START:
      if (event.role && event.role !== "assistant" && event.role !== "user") return state;
      next = updateTurn(state, event.messageId, agent, (parts) => parts.length ? parts : [{ type: "text", text: "", streaming: true }]);
      if (event.role === "user") next = { ...next, thread: next.thread.map((turn) => turn.id === event.messageId ? { ...turn, role: "user", agent: null } : turn) };
      break;
    case EventType.TEXT_MESSAGE_CONTENT:
      next = updateTurn(state, event.messageId, agent, (parts) => {
        const last = parts.at(-1);
        return last?.type === "text" ? [...parts.slice(0, -1), { ...last, text: last.text + event.delta }]
          : [...parts, { type: "text", text: event.delta, streaming: true }];
      });
      break;
    case EventType.TEXT_MESSAGE_END:
      next = { ...state, thread: state.thread.map((turn) => turn.id === event.messageId ? { ...turn,
        parts: turn.parts.map((part) => part.type === "text" ? { ...part, streaming: false } : part),
      } : turn) };
      break;
    case EventType.TOOL_CALL_START:
      next = updateTurn(state, event.parentMessageId ?? event.toolCallId, agent, (parts) => [...parts, {
        type: "tool", toolCallId: event.toolCallId, name: event.toolCallName, args: "", result: null, status: "working",
      }]);
      next = { ...next, agents: { ...next.agents, [agent]: "working" } };
      if (event.metadata?.card) next = placeCard(next, event.metadata.card, "loading");
      break;
    case EventType.TOOL_CALL_ARGS:
      next = updateTool(state, event.toolCallId, (part) => ({ ...part, args: part.args + event.delta }));
      break;
    case EventType.TOOL_CALL_END:
      // Arguments are complete; the tool is still running until its result.
      break;
    case EventType.TOOL_CALL_RESULT:
      next = updateTool(state, event.toolCallId, (part) => ({ ...part,
        result: typeof event.content === "string" ? event.content : JSON.stringify(event.content), status: "done",
      }));
      if (event.metadata?.card) next = resultCard(next, event.metadata.card);
      else if (typeof event.content === "string") {
        try {
          const content: unknown = JSON.parse(event.content);
          next = resultCard(next, content && typeof content === "object" && "card" in content ? content.card : content);
        } catch { /* A plain-text tool result is normal, not a card. */ }
      }
      break;
    case EventType.RUN_FINISHED:
      if (event.runId !== state.run.id) return state;
      if (event.outcome?.type === "cancelled") return reducer(state, { type: "RUN_STOPPED", ...(event.timestamp === undefined ? {} : { timestamp: event.timestamp }) });
      if (event.outcome?.type === "interrupt") {
        next = closeWork({ ...state, run: { ...state.run, status: "waiting", what: "Revisa la propuesta" },
          agents: { ...restingAgents(state), [state.run.agent]: "needs-you" },
        }, "done");
        for (const interrupt of event.outcome.interrupts) {
          next = resultCard(next, interrupt.metadata?.card);
        }
        for (const entry of Object.values(next.cards)) {
          if (entry.status === "pending") next = { ...next, agents: { ...next.agents, [entry.card.agent]: "needs-you" } };
        }
        break;
      }
      next = { ...state, run: { ...state.run, status: "done", what: "Listo",
        plan: state.run.plan.map((part) => ({ ...part, status: "done" })),
      }, agents: { ...restingAgents(state), [state.run.agent]: needsHuman(state, state.run.agent) ? "needs-you" : "done" } };
      next = closeWork(next, "done");
      break;
    case EventType.RUN_ERROR:
      next = closeWork({ ...state, run: { ...state.run, status: "error", what: event.message }, agents: restingAgents(state) }, "error");
      next = updateTurn(next, `error:${state.run.id}`, agent, (parts) => [...parts, { type: "notice", text: event.message }]);
      return appendTrace(next, event, event.message);
    case EventType.STATE_SNAPSHOT:
      next = { ...state, worldState: structuredClone(event.snapshot) };
      break;
    case EventType.STATE_DELTA:
      try { next = { ...state, worldState: applyPatch(state.worldState, event.delta) }; }
      catch { return appendTrace(state, event, "No se pudo aplicar la actualización de estado"); }
      break;
    case EventType.CUSTOM:
      if (event.name === "airi.card") next = resultCard(state, event.value);
      else if (event.name === "airi.part") {
        const parsed = partSchema.safeParse(event.value);
        if (!parsed.success) return state;
        next = updateTurn(state, `parts:${state.run.id}:${agent}`, agent, (parts) => [...parts, { type: "part", ...structuredClone(parsed.data) }]);
      } else if (event.name === "airi.notice") {
        const parsed = noticeSchema.safeParse(event.value);
        if (!parsed.success) return state;
        next = updateTurn(state, `parts:${state.run.id}:${agent}`, agent, (parts) => [...parts, { type: "notice", text: parsed.data.text }]);
      } else return state;
      break;
    default:
      return state;
  }
  return appendTrace(next, event);
}
