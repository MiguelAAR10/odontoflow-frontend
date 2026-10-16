import { describe, expect, it } from "vitest";
import { agentActivity } from "../src/crew/activity";
import { createInitialState } from "../src/agui/reducer";
import type { CardEntry } from "../src/agui/card";

const entry = (id: string, state: CardEntry["card"]["state"], result?: string): CardEntry => ({
  card: { id, agent: "airi", title: id, body: "", level: "aprobar", state, version: 1, payload_hash: "a".repeat(64), result },
  status: state === "approved" ? "approved" : "pending", runId: "run", error: null,
});
describe("thread-local crew evidence", () => {
  it("does not count a prepared proposal or finished run as an applied result", () => {
    const state = createInitialState();
    state.run.status = "done";
    state.cards.draft = entry("draft", "ready", "Expected future result");
    const activity = agentActivity(state, "airi");
    expect(activity.result).toBeUndefined();
    expect(activity.pending?.card.id).toBe("draft");
    expect(activity.decision).toContain("decidir en su tarjeta");
  });
  it("keeps an earlier pending decision visible after a later approved result", () => {
    const state = createInitialState();
    state.cards.first = entry("first", "pending");
    state.cards.second = entry("second", "approved", "Movimiento registrado");
    expect(agentActivity(state, "airi").pending?.card.id).toBe("first");
    expect(agentActivity(state, "airi").result?.card.result).toBe("Movimiento registrado");
    expect(agentActivity(state, "cepillo").result).toBeUndefined();
    expect(agentActivity(createInitialState(), "airi").pending).toBeUndefined();
  });
  it("uses approval order rather than proposal insertion order for the latest result", () => {
    const state = createInitialState();
    state.cards.first = entry("first", "approved", "Primera aplicada después");
    state.cards.second = entry("second", "approved", "Segunda aplicada antes");
    state.trace = [{ type: "CARD_APPROVED", agent: "airi", cardId: "first", timestamp: 1, runId: "run", message: "Primera aplicada después" }];
    expect(agentActivity(state, "airi").result?.card.id).toBe("first");
    expect(agentActivity(state, "airi").resultOrdered).toBe(true);
  });
  it("does not invite a second approval while its request is pending", () => {
    const state = createInitialState();
    state.cards.first = { ...entry("first", "pending"), status: "loading", loadingReason: "approval" };
    expect(agentActivity(state, "airi").decision).toContain("Esperando");
  });
});
