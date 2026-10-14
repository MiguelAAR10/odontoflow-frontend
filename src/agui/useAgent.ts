"use client";

import { useEffect } from "react";
import { z } from "zod";
import { usePersona } from "../components/PersonaContext";
import { useShellContext } from "../components/shell/ShellContext";
import { toApiError, newIdempotencyKey } from "../contracts/client";
import { agentStore, useAgentStore, type AgentStore } from "./store";
import { getAgentSource, type AgentSourceWithApproval } from "./index";
import { EventType, type RunAgentInput } from "./events.js";
import { MoneySchema } from "./card";
import { formatMoney } from "../catalog/format";
import type { CatalogItem } from "../catalog/schema";
import type { SimulatedSourceOptions } from "./sim/source.js";
import { getNavigation, type ShellRole } from "../nav";

export interface AgentContext { role: ShellRole; view: string; viewing: string }
type SourceFactory = (options: SimulatedSourceOptions) => Promise<AgentSourceWithApproval>;

// View model over StateSnapshot: no new domain fields or totals. Keep the
// simulation import behind the same explicit opt-in as getAgentSource.
const viewSnapshotSchema = z.object({
  cut_at: z.iso.datetime({ offset: true }),
  sedes: z.array(z.object({
    name: z.string().min(1), collected: MoneySchema, pending_verification: MoneySchema,
    occupied_minutes: z.number().int().nonnegative().nullable(),
    capacity_minutes: z.number().int().positive().nullable(), complete: z.boolean(),
  })),
  free_next_7_days_minutes: z.number().int().nonnegative(),
});
async function summarizeView(context: AgentContext, worldState: unknown, cards: ReturnType<AgentStore["getSnapshot"]>["cards"]) {
  const parts: CatalogItem[] = [];
  const entry = getNavigation(context.role).find(item => item.to === `/${context.view}`);
  if (!entry) return { parts: [{ type: "Notice", props: { text: "Esta vista no está disponible para tu rol." } }] satisfies CatalogItem[] };
  const prefix = `Viendo: ${entry.label}.`;
  if (context.view === "aprobaciones") {
    const pending = Object.values(cards).filter(card => card.status === "pending" || card.status === "error");
    parts.push({ type: "Say", props: { text: `${prefix} En este hilo hay ${pending.length} propuestas pendientes de decisión.` } });
  } else if (["home", "agenda", "caja", "direccion"].includes(context.view)) {
    let parsed = viewSnapshotSchema.safeParse(worldState);
    if (!parsed.success && process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
      const { default: fixtures } = await import("./sim/fixtures/state.json");
      parsed = viewSnapshotSchema.safeParse(fixtures[0]);
    }
    if (parsed.success) {
      const snapshot = parsed.data;
      const cut = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" }).format(new Date(snapshot.cut_at));
      parts.push({ type: "Say", props: { text: `${prefix} Corte disponible: ${cut} (hora Lima).` } });
      if (context.view === "agenda") {
        parts.push({ type: "Part", props: { kind: "list", title: "Ocupación en el corte", items: snapshot.sedes.map(sede => ({
          label: sede.name, value: sede.occupied_minutes === null || sede.capacity_minutes === null
            ? "Sin datos de ocupación" : `${sede.occupied_minutes} de ${sede.capacity_minutes} minutos ocupados`,
        })) } });
        parts.push({ type: "Say", props: { text: `${snapshot.free_next_7_days_minutes} minutos libres en los próximos 7 días.` } });
      } else {
        parts.push({ type: "Part", props: { kind: "list", title: "Cobrado y pendiente de verificación", items: snapshot.sedes.map(sede => ({
          label: sede.name, value: `Cobrado: ${formatMoney(sede.collected.amount_cents)} · Por verificar: ${formatMoney(sede.pending_verification.amount_cents)}${sede.complete ? "" : " · datos incompletos"}`,
        })) } });
      }
    } else parts.push({ type: "Notice", props: { text: `${prefix} No hay un corte disponible para resumir los datos de esta vista.` } });
  } else parts.push({ type: "Notice", props: { text: `${prefix} El hilo aún no contiene un resumen de los datos de esta vista. Revísalos en la vista abierta.` } });
  parts.push({ type: "Act", props: { label: entry.label, target: context.view } });
  return { parts };
}

/** Lazy transport keeps the store's synchronous acknowledgement ahead of I/O.
 * Sources survive navigation so pending approvals retain their original owner. */
export function createAgentController(store: AgentStore, factory: SourceFactory = getAgentSource) {
  let configured = false;
  let identity: string | null = null;
  let epoch = 0;
  let active: AgentSourceWithApproval | null = null;
  const sources = new Map<string, Promise<AgentSourceWithApproval>>();
  const proposals = new Map<string, AgentSourceWithApproval>();
  const source: AgentSourceWithApproval = {
    async run(input, emit) {
      const token = ++epoch;
      const context = input.forwardedProps as AgentContext;
      const text = input.messages.filter(message => message.role === "user").at(-1)?.content;
      // This explicit UI command projects existing data; it never asks the
      // source to prepare a mutation, create a proposal or approve one.
      if (text === "Resume esta vista") {
        emit({ type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId, agent: "airi", what: "Leyendo el corte de la vista" });
        const { parts } = await summarizeView(context, input.state, store.getSnapshot().cards);
        if (token !== epoch) return;
        for (const part of parts) emit({ type: EventType.CUSTOM, name: "airi.part", value: { key: part.type, props: part.props } });
        emit({ type: EventType.RUN_FINISHED, threadId: input.threadId, runId: input.runId, outcome: { type: "success" } });
        return;
      }
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
  const reset = () => { store.clear(); sources.clear(); proposals.clear(); };
  return {
    matchesIdentity: (next: string) => identity === next,
    bindIdentity(next: string) {
      if (identity === next) return;
      identity = next;
      reset();
    },
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
    reset,
  };
}
export const agentController = createAgentController(agentStore);
const snapshot = (state: ReturnType<AgentStore["getSnapshot"]>) => state;
export function useAgent() {
  const { role } = useShellContext();
  const { version, current } = usePersona();
  const identity = `${role}:${version}:${current ?? ""}`;
  const stored = useAgentStore(snapshot);
  // Mask the old identity on the first render, before effects or child controls
  // can expose its thread. The controller survives Lienzo and PersonaGate.
  const state = agentController.matchesIdentity(identity) ? stored : agentStore.getServerSnapshot();
  useEffect(() => { agentController.bindIdentity(identity); }, [identity]);
  return { ...state, ...agentController, working: state.run.status === "working", queries: state.thread.filter(turn => turn.role === "user").length };
}
