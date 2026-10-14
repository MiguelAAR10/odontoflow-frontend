import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SimulatedSource } from "../src/agui/sim/source.js";
import { createAgentStore } from "../src/agui/store.js";
import { envelopeFor } from "../src/agui/sim/schema.js";
import type { Event } from "../src/agui/events.js";
import type { Card } from "../src/agui/card.js";
import { AxiosError } from "axios";

// Matches the shared error envelope at the source/store boundary; no UI logic.
const errorEnvelope = (error: unknown) => {
  if (!(error instanceof AxiosError)) throw error;
  return { ...error.response!.data.error, httpStatus: error.response!.status };
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function proposal(scenarioId: string) {
  const source = new SimulatedSource({ scenarioId });
  const events: Event[] = [];
  const run = source.run({ threadId: "agenda", runId: "offer", messages: [], tools: [], context: [] }, event => events.push(event));
  await vi.runAllTimersAsync();
  await run;
  const finished = events.at(-1)!;
  if (finished.type !== "RUN_FINISHED" || finished.outcome?.type !== "interrupt") throw new Error("Falta propuesta");
  const card = finished.outcome.interrupts[0]!.metadata!.card!;
  return { source, card };
}

describe.each(["admin-hueco", "cv-huecos"])("oferta %s", scenario => {
  it("conserva pending, rechaza hash viejo con 409 y permite reintentar la misma intención", async () => {
    const { source, card } = await proposal(scenario);
    expect(card.state).toBe("pending");
    const envelope = envelopeFor(card);
    await expect(source.approve({ ...envelope, payload_hash: "obsoleto" }, "oferta-intento").catch(error => { throw errorEnvelope(error); }))
      .rejects.toEqual({ code: "PROPOSAL_CONFLICT", httpStatus: 409, message: "La propuesta cambió. Revisa la tarjeta actual antes de aprobar." });
    const approved = await source.approve(envelope, "oferta-intento");
    expect(approved.state).toBe("approved");
    expect(approved.result).toContain("hueco sigue libre");
    expect(await source.approve(envelope, "oferta-intento")).toEqual(approved);
    await expect(source.approve(envelope, "otra-intencion")).rejects.toMatchObject({ httpStatus: 409 });
  });
});

it("un asentimiento en el hilo conserva pending; doble clic comparte una sola aprobación", async () => {
  const source = new SimulatedSource({ role: "admin", view: "agenda" });
  const approve = vi.fn((card: Card, key: string) => source.approveCard(card, key));
  const store = createAgentStore({ source, approveCard: approve, toApiError: errorEnvelope, newIdempotencyKey: () => "intent-key" });
  const run = store.send("¿Quién toma el hueco de la tarde?");
  await vi.runAllTimersAsync(); await run;
  expect(store.getSnapshot().cards["r-oferta"]?.status).toBe("pending");
  await store.send("sí");
  expect(store.getSnapshot().cards["r-oferta"]?.status).toBe("pending");
  expect(approve).not.toHaveBeenCalled();
  const first = store.approve("r-oferta"), duplicate = store.approve("r-oferta");
  expect(first).toBe(duplicate);
  await first;
  expect(approve).toHaveBeenCalledTimes(1);
  expect(approve.mock.calls[0]?.[1]).toBe("intent-key");
  expect(store.getSnapshot().cards["r-oferta"]?.status).toBe("approved");
});
