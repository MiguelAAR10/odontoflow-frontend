import { afterEach, describe, expect, it, vi } from "vitest";
import { http } from "../src/contracts/client";
import { HttpSource } from "../src/agui/http";
import type { Card } from "../src/agui/card";

const card: Card = { id: "17", proposal_id: 17, version: 2, payload_hash: "a".repeat(64), agent: "hilo", level: "aprobar", state: "pending", title: "Confirmar citas", body: "Revisa el mensaje" };
afterEach(() => vi.restoreAllMocks());
describe("Aprobación de tarjetas del stream", () => {
  it("conserva hash e intención y relee la tarjeta confirmada por el backend", async () => {
    const post = vi.spyOn(http, "post").mockResolvedValue({ data: {}, headers: {} });
    const get = vi.spyOn(http, "get").mockResolvedValue({ data: { ...card, state: "approved" } });
    const result = await new HttpSource().approveCard(card, "same-intent");
    expect(post).toHaveBeenCalledWith("/agent/proposals/17/approve", { payload_hash: card.payload_hash }, { headers: { "Idempotency-Key": "same-intent" } });
    expect(get).toHaveBeenCalledWith("/agent/cards/17");
    expect(result).toMatchObject({ id: "17", state: "approved" });
  });
  it("un conflicto de hash deja el error del backend y no fabrica una aprobación", async () => {
    const conflict = new Error("La propuesta cambió");
    vi.spyOn(http, "post").mockRejectedValue(conflict);
    const get = vi.spyOn(http, "get");
    await expect(new HttpSource().approveCard(card, "same-intent")).rejects.toBe(conflict);
    expect(get).not.toHaveBeenCalled();
  });
  it("una tarjeta sin propuesta real no produce ninguna mutación", async () => {
    const post = vi.spyOn(http, "post");
    await expect(new HttpSource().approveCard({ ...card, proposal_id: null }, "intent")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(post).not.toHaveBeenCalled();
  });
});
