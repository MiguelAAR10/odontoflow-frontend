import type { RunAgentInput } from "@ag-ui/core";
import type { Event } from "./events.js";

/** A source emits protocol events, never UI actions. stop must cancel its I/O;
 * the store also fences callbacks in case a transport delivers late events.
 */
export interface AgentSource {
  run(input: RunAgentInput, onEvent: (event: Event) => void): Promise<void>;
  stop(): void;
}
