import type { Card } from "./card.js";
import type { AgentSource } from "./source.js";
import type { SimulatedSourceOptions } from "./sim/source.js";

export interface AgentSourceWithApproval extends AgentSource {
  approveCard?: (card: Card, idempotencyKey: string) => Promise<Card>;
}

/** Explicit opt-in: importing this module in real mode never evaluates fixtures.
 * Keep the public env access literal so Next can eliminate the simulation branch.
 */
export async function getAgentSource(options: SimulatedSourceOptions = {}): Promise<AgentSourceWithApproval> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    const { SimulatedSource } = await import("./sim/source.js");
    return new SimulatedSource(options);
  }
  // A scoped specifier avoids aliasing Axios's own ./http.js in Turbopack.
  const { HttpSource } = await import("../agui/http.js");
  return new HttpSource();
}
