import type { RunAgentInput } from "@ag-ui/core";
import type { Event } from "./events.js";

/** A source emits protocol events, never UI actions. stop cancels local I/O
 * immediately and may return a promise for remote acknowledgement. Consumers
 * must handle that result separately from run's fenced event callbacks.
 */
export interface AgentSource {
  run(input: RunAgentInput, onEvent: (event: Event) => void): Promise<void>;
  stop(): void | Promise<void>;
}
