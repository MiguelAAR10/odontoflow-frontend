import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import { CardSchema } from "../src/agui/card.js";
import { createAgentStore } from "../src/agui/store.js";
import { observeApprovalReceipts } from "../src/agui/sim/gaps.js";
import { SimulatedSource } from "../src/agui/sim/source.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function setup(scenarioId = "admin-hueco") {
  const source = new SimulatedSource({ scenarioId });
  const approveCard = vi.fn((...args: Parameters<typeof source.approveCard>) => source.approveCard(...args));
  const store = createAgentStore({ source, approveCard, toApiError: error => {
    if (!(error instanceof AxiosError)) throw error;
    return { ...error.response!.data.error, httpStatus: error.response!.status };
  } });
  const receipts = observeApprovalReceipts(store);
  const run = store.send("¿Quién toma el hueco?");
  await vi.runAllTimersAsync();
  await run;
  const id = Object.keys(store.getSnapshot().cards).find(id => id.endsWith("oferta"))!;
  const card = () => store.getSnapshot().cards[id]!.card;
  return { store, receipts, approveCard, id, card };
}

describe("recepción local de la confirmación de oferta", () => {
  it.each(["admin-hueco", "cv-huecos"])("conserva el instante observado en %s sin depender del montaje de Agenda", async scenario => {
    const { store, receipts, id, card } = await setup(scenario);
    expect(receipts.get(card())).toBeUndefined();
    vi.setSystemTime(new Date("2026-10-14T16:12:34Z"));
    await store.approve(id);
    const confirmed = card();
    expect(receipts.get(confirmed)).toBe("2026-10-14T16:12:34.000Z");
    expect(CardSchema.parse(confirmed)).toEqual(confirmed); // Metadata stays out of the backend DTO.
    vi.setSystemTime(new Date("2026-10-14T23:34:00Z"));
    store.setPanelOpen(false);
    store.setDocked(false);
    store.setPanelOpen(true);
    expect(receipts.get(card())).toBe("2026-10-14T16:12:34.000Z");
    receipts.dispose();
  });

  it("no fecha un error ni una petición en vuelo; registra cuando llega la confirmación", async () => {
    const { store, receipts, approveCard, id, card } = await setup();
    approveCard.mockRejectedValueOnce(new AxiosError("conflict", "ERR_BAD_REQUEST", undefined, undefined, {
      status: 409, statusText: "Conflict", headers: {}, config: { headers: new AxiosHeaders() },
      data: { error: { code: "PROPOSAL_CONFLICT", message: "La propuesta cambió." } },
    }));
    await expect(store.approve(id)).rejects.toMatchObject({ httpStatus: 409 });
    expect(receipts.get(card())).toBeUndefined();
    const retry = store.approve(id);
    expect(store.getSnapshot().cards[id]!.status).toBe("loading");
    expect(receipts.get(card())).toBeUndefined();
    vi.setSystemTime(new Date("2026-10-14T18:01:02Z"));
    await retry;
    expect(receipts.get(card())).toBe("2026-10-14T18:01:02.000Z");
    receipts.dispose();
  });

  it("no inventa recepción al observar una decisión que ya estaba aprobada", async () => {
    const { store, receipts, id, card } = await setup();
    await store.approve(id);
    const lateObserver = observeApprovalReceipts(store);
    store.setPanelOpen(true);
    expect(lateObserver.get(card())).toBeUndefined();
    lateObserver.dispose();
    receipts.dispose();
  });

  it("aísla stores y descarta recibos al reiniciar la sesión", async () => {
    const { store, receipts, id, card } = await setup();
    await store.approve(id);
    const confirmed = card();
    const other = await setup();
    expect(other.receipts.get(confirmed)).toBeUndefined();
    store.clear();
    expect(receipts.get(confirmed)).toBeUndefined();
    expect(Object.keys(store.getSnapshot().cards)).toHaveLength(0);
    receipts.dispose();
    other.receipts.dispose();
  });
});
