"use client";

import { useEffect } from "react";
import { agentStore, type AgentStore } from "../agui/store";
import type { RunState } from "../agui/reducer";
import { sound } from "./sound";

/** Subscribe outside render: even synchronous source events get their sound.
 * Trace entries distinguish human approval from a run finishing in `done`.
 * Mount once in AppShell; never replay an existing thread on navigation.
 */
export function useAgentSounds(store: AgentStore = agentStore): void {
  useEffect(() => {
    // Arm gesture listeners without creating an AudioContext.
    void sound.enabled;
    let previous = store.getSnapshot();
    const unsubscribe = store.subscribe(() => {
      const next = store.getSnapshot();
      const before = previous;
      previous = next;
      const continued = before.trace.length === 0 || next.trace[before.trace.length - 1] === before.trace.at(-1);
      const fresh = next.trace.slice(continued ? before.trace.length : 0);
      for (const event of fresh) {
        switch (event.type) {
          case "RUN_REQUESTED": sound.play("send"); break;
          case "RUN_STARTED": sound.play("start", event.agent); break;
          case "SUBAGENT_STARTED":
            if (event.agent !== before.run.agent) sound.play("start", event.agent);
            break;
          case "TOOL_CALL_RESULT":
            for (const entry of completedCards(before, next)) sound.play("done", entry.card.agent);
            break;
          case "RUN_FINISHED":
            if (next.run.status === "waiting") sound.play("needs", event.agent);
            else if (next.run.status === "done") sound.play("done", event.agent);
            break;
          case "CARD_APPROVED": sound.play("approved"); break;
          case "RUN_ERROR":
          case "CARD_APPROVAL_FAILED":
          case "STOP_ERROR": sound.play("error"); break;
        }
      }
    });
    // Existing data-airi-input marks both Inicio and InteractionBar. A single
    // delegated listener also covers inputs mounted after route/panel changes.
    const typing = (event: KeyboardEvent) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)
        || !input.hasAttribute("data-airi-input") || input.disabled || input.readOnly
        || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.length === 1 || event.key === "Backspace" || event.key === "Delete") sound.play("key");
    };
    document.addEventListener("keydown", typing, true);
    return () => { unsubscribe(); document.removeEventListener("keydown", typing, true); };
  }, [store]);
}

function completedCards(before: RunState, next: RunState) {
  return Object.values(next.cards).filter(entry => entry.status === "done"
    && before.cards[entry.card.id]?.status !== "done");
}
