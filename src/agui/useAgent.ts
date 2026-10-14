"use client";

import { toApiError, newIdempotencyKey } from "../contracts/client";
import { agentStore, useAgentStore, type AgentStore } from "./store";
import { getAgentSource, type AgentSourceWithApproval } from "./index";
import type { RunAgentInput } from "./events.js";
import type { SimulatedSourceOptions } from "./sim/source.js";
import type { ShellRole } from "../nav.js";

export interface AgentContext { role: ShellRole; view: string; viewing: string }
type SourceFactory = (options: SimulatedSourceOptions) => Promise<AgentSourceWithApproval>;

/** Lazy transport keeps the store's synchronous acknowledgement ahead of I/O.
 * Sources survive navigation so pending approvals retain their original owner. */
export function createAgentController(store: AgentStore, factory: SourceFactory = getAgentSource) {
  let configured = false;
  let epoch = 0;
  let active: AgentSourceWithApproval | null = null;
  const sources = new Map<string, Promise<AgentSourceWithApproval>>();
  const proposals = new Map<string, AgentSourceWithApproval>();
  const source: AgentSourceWithApproval = {
    async run(input, emit) {
      const token = ++epoch;
      const context = input.forwardedProps as AgentContext;
      const cacheKey = `${context.role}:${context.view}`;
      let pending = sources.get(cacheKey);
      if (!pending) {
        pending = factory({ role: context.role, view: context.view });
        sources.set(cacheKey, pending);
        void pending.catch(() => { sources.delete(cacheKey); });
      }
      const resolved = await pending;
      if (token !== epoch) return;
      active = resolved;
      try {
        await resolved.run(input, event => {
          if (token !== epoch) return;
          if (event.type === "RUN_FINISHED" && event.outcome?.type === "interrupt") {
            for (const interrupt of event.outcome.interrupts) {
              if (interrupt.metadata?.card) proposals.set(interrupt.metadata.card.id, resolved);
            }
          }
          emit(event);
        });
      } finally { if (token === epoch) active = null; }
    },
    stop() { epoch += 1; active?.stop(); active = null; },
    approveCard(card, key) {
      const owner = proposals.get(card.id);
      if (!owner?.approveCard) return Promise.reject(new Error("La aprobación de esta tarjeta no está disponible."));
      return owner.approveCard(card, key);
    },
  };
  return {
    send(text: string, context: AgentContext) {
      if (!text.trim()) return Promise.resolve();
      if (!configured) {
        store.configure({ source, approveCard: source.approveCard, toApiError, newIdempotencyKey });
        configured = true;
      }
      if (store.getSnapshot().run.status === "working") return Promise.reject(new Error("AIRI está trabajando. Detén la tarea actual o espera."));
      store.setDocked(true);
      store.setPanelOpen(true);
      const current = store.getSnapshot();
      const messages: RunAgentInput["messages"] = current.thread.flatMap(turn => {
        const content = turn.parts.flatMap(part => part.type === "text" ? [part.text] : []).join("");
        return content ? [{ id: turn.id, role: turn.role, content }] : [];
      });
      return store.send({ threadId: current.threadId ?? newIdempotencyKey(), runId: newIdempotencyKey(),
        messages: [...messages, { id: newIdempotencyKey(), role: "user", content: text.trim() }], tools: [],
        context: [{ description: "Vista actual", value: `Viendo: ${context.viewing}` }, { description: "Rol de presentación", value: context.role }],
        state: current.worldState, forwardedProps: context,
      });
    },
    stop: () => store.stop(),
    approve: (id: string) => store.approve(id),
    openPanel() { store.setDocked(true); store.setPanelOpen(true); },
    closePanel: () => store.setPanelOpen(false),
    toCenter() { store.setPanelOpen(false); store.setDocked(false); },
    reset() { store.clear(); sources.clear(); proposals.clear(); },
  };
}
export const agentController = createAgentController(agentStore);
const snapshot = (state: ReturnType<AgentStore["getSnapshot"]>) => state;
export function useAgent() {
  const state = useAgentStore(snapshot);
  return { ...state, ...agentController, working: state.run.status === "working", queries: state.thread.filter(turn => turn.role === "user").length };
}
