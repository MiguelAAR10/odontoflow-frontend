import type {
  Event as CoreEvent, Interrupt, RunFinishedEvent, RunStartedEvent,
  StepStartedEvent, SubagentStartedEvent,
} from "@ag-ui/core";
import type { AgentId, Card } from "./card.js";

export * from "@ag-ui/core";
export type { AgentId } from "./card.js";
export type AGUIEvent = CoreEvent;

export type AiriInterrupt = Omit<Interrupt, "metadata"> & {
  metadata?: Record<string, unknown> & { card?: Card };
};
export type AiriRunStartedEvent = RunStartedEvent & {
  agent?: AgentId;
  plan?: string[];
  what?: string;
};
export type AiriRunFinishedEvent = Omit<RunFinishedEvent, "outcome"> & {
  agent?: AgentId;
  outcome?: Exclude<RunFinishedEvent["outcome"], { type: "interrupt" }> | {
    type: "interrupt"; interrupts: AiriInterrupt[];
  };
};
export type AiriSubagentStartedEvent = SubagentStartedEvent & { agent?: AgentId };
export type AiriStepStartedEvent = StepStartedEvent & { agent?: AgentId; index?: number };

/** CUSTOM payloads consumed by the closed AIRI catalog. Unknown names are ignored. */
export interface AiriCustomPayloads {
  "airi.card": Card;
  "airi.part": { key: string; props?: unknown };
  "airi.notice": { text: string };
}

/** Wire events only. Store actions (especially approval) are not agent events. */
export type Event = (
  | Exclude<CoreEvent, RunStartedEvent | RunFinishedEvent | SubagentStartedEvent | StepStartedEvent>
  | AiriRunStartedEvent | AiriRunFinishedEvent | AiriSubagentStartedEvent | AiriStepStartedEvent
) & { agent?: AgentId };
export type AgentEvent = Event;
