import type { Card } from "./card.js";
import type { AgentSource } from "./source.js";
import type { SimulatedSourceOptions } from "./sim/source.js";

export interface AgentSourceWithApproval extends AgentSource {
  approveCard?: (card: Card, idempotencyKey: string) => Promise<Card>;
}

/** Temporary real-mode boundary owned here until E2 supplies src/agui/http.ts.
 * No request is fabricated against an endpoint absent from the current contract.
 */
export class HttpSource implements AgentSource {
  async run(): Promise<void> { throw new Error("Agente no conectado. La fuente HTTP aún no está disponible."); }
  stop(): void {}
}

/** Explicit opt-in: importing this module in real mode never evaluates fixtures.
 * Keep the public env access literal so Next can eliminate the simulation branch.
 */
export async function getAgentSource(options: SimulatedSourceOptions = {}): Promise<AgentSourceWithApproval> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    const { SimulatedSource } = await import("./sim/source.js");
    return new SimulatedSource(options);
  }
  return new HttpSource();
}
