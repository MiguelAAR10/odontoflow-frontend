/** Real PostgreSQL/backend behind the production BFF guard and stream proxy.
 * Run via scripts/pilot-e2e.sh; the harness mints a temporary human credential.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { expect, it } from "vitest";
import { handleBackendRequest } from "../src/bff/proxy";
import { PERSONA_COOKIE, signPersona } from "../src/bff/personas";
import { http } from "../src/contracts/client";
import { HttpSource } from "../src/agui/http";
import { createInitialState, reducer } from "../src/agui/reducer";
import type { Event } from "../src/agui/events";

it("humano → BFF → SSE → propuesta pendiente → hash → aprobación idempotente", async () => {
  const path = process.env.AIRI_E2E_CONFIG;
  if (!path) throw new Error("Ejecuta scripts/pilot-e2e.sh para preparar AIRI_E2E_CONFIG.");
  const config = JSON.parse(readFileSync(path, "utf8")) as { token: string; ask: string };
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL!;
  const secret = "airi-e2e-local-session-secret-0123456789";
  const cookie = `${PERSONA_COOKIE}=${signPersona("testhuman", secret, Date.now() / 1000 + 600)}`;
  const responses: { path: string; status: number; replay: string | null }[] = [];
  const server = createServer(async (incoming, outgoing) => {
    const abort = new AbortController();
    outgoing.on("close", () => abort.abort());
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) if (typeof value === "string") headers.set(name, value);
      const method = incoming.method ?? "GET";
      const request = new Request(`${origin}${incoming.url}`, { method, headers, signal: abort.signal,
        ...(method === "GET" ? {} : { body: Buffer.concat(chunks).toString() }) });
      const segments = new URL(request.url).pathname.replace(/^\/api\/backend\//, "").split("/");
      const response = await handleBackendRequest(request, segments, {
        backendUrl, fetch, secret, humans: [{ key: "testhuman", role: "administrador", displayName: "Persona test", token: config.token }],
      });
      responses.push({ path: incoming.url!, status: response.status, replay: response.headers.get("idempotent-replay") });
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) {
        const reader = response.body.getReader();
        try { while (true) { const next = await reader.read(); if (next.done) break; outgoing.write(next.value); } }
        finally { reader.releaseLock(); }
      }
      outgoing.end();
    } catch { if (!outgoing.destroyed) outgoing.destroy(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const previousBase = http.defaults.baseURL;
  const previousHeaders = { ...http.defaults.headers.common };
  http.defaults.baseURL = `${origin}/api/backend`;
  http.defaults.headers.common.Cookie = cookie;
  http.defaults.headers.common.Origin = origin;
  const source = new HttpSource({ role: "admin", fetch: (url, init) => {
    const headers = new Headers(init.headers);
    headers.set("cookie", cookie); headers.set("origin", origin);
    return fetch(`${origin}${url}`, { ...init, headers });
  } });
  try {
    const input = { threadId: crypto.randomUUID(), runId: crypto.randomUUID(), messages: [{ id: crypto.randomUUID(), role: "user" as const, content: config.ask }], tools: [], context: [] };
    const events: Event[] = [];
    await source.run(input, event => events.push(event));
    const state = events.reduce(reducer, createInitialState());
    expect(state.run.status).toBe("waiting");
    const [entry] = Object.values(state.cards).filter(entry => entry.status === "pending");
    expect(entry?.card.proposal_id).toBeGreaterThan(0);
    const card = entry!.card;
    const followup: Event[] = [];
    await source.run({ ...input, runId: crypto.randomUUID(), messages: [{ id: crypto.randomUUID(), role: "user", content: "sí" }] }, event => followup.push(event));
    expect(followup.at(-1)).toMatchObject({ type: "RUN_FINISHED", outcome: { type: "success" } });
    expect(followup.some(event => event.type === "RUN_FINISHED" && event.outcome?.type === "interrupt")).toBe(false);
    expect((await http.get(`/agent/cards/${card.proposal_id}`)).data).toMatchObject({ id: card.id, state: "pending" });
    await expect(source.approveCard({ ...card, payload_hash: "0".repeat(64) }, crypto.randomUUID())).rejects.toMatchObject({ response: { status: 409 } });
    const key = crypto.randomUUID();
    expect(await source.approveCard(card, key)).toMatchObject({ id: card.id, state: "approved" });
    expect(await source.approveCard(card, key)).toMatchObject({ id: card.id, state: "approved" });
    expect(responses.some(response => response.path.endsWith("/approve") && response.replay === "true")).toBe(true);
  } finally {
    source.stop(); http.defaults.baseURL = previousBase; http.defaults.headers.common = previousHeaders;
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
}, 30_000);
