/** BFF guard in front of the proxy: persona required (C), route allowlist (D), same-origin (E). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PERSONA_COOKIE, parseDemoHumans, signPersona } from "../src/bff/personas";
import { BROWSER_ROUTES, handleBackendRequest, isRouteAllowed, type GuardOptions } from "../src/bff/proxy";

const humans = parseDemoHumans(JSON.stringify([
  { role: "secretaria", display_name: "Lucía Ramos", token: "ofk_lucia" },
  { role: "administrador", display_name: "Carlos Vega", token: "ofk_carlos" },
]));
const SECRET = "test-session-secret-0123456789abcdef";
const NOW = Date.UTC(2026, 9, 2, 12, 0, 0);
const NOW_S = Math.floor(NOW / 1000);
const APP = "http://app.test";

function upstream() {
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
  );
}

function options(fetchMock: ReturnType<typeof upstream>, extra: Partial<GuardOptions> = {}): GuardOptions {
  return { backendUrl: "http://backend.test", fetch: fetchMock, humans, integrationToken: "ofk_integration", secret: SECRET, now: () => NOW, ...extra };
}

const personaCookie = (key: string, secret = SECRET, expiry = NOW_S + 3600) => `${PERSONA_COOKIE}=${signPersona(key, secret, expiry)}`;

function request(path: string, init: { method?: string; cookie?: string; origin?: string | null; headers?: Record<string, string> } = {}) {
  const method = init.method ?? "GET";
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.cookie) headers.cookie = init.cookie;
  const origin = init.origin === undefined ? (method === "GET" ? null : APP) : init.origin;
  if (origin !== null) headers.origin = origin;
  return new Request(`${APP}/api/backend/${path}`, { method, headers, body: method === "GET" ? null : "{}" });
}

const segments = (path: string) => path.split("?")[0]!.split("/");
const bearer = (fetchMock: ReturnType<typeof upstream>) => new Headers(fetchMock.mock.calls[0]![1]!.headers).get("authorization");

async function errorCode(response: Response) {
  return ((await response.json()) as { error: { code: string } }).error.code;
}

describe("C · no persona, no token", () => {
  it("a valid persona cookie sends that person's bearer", async () => {
    const fetchMock = upstream();
    const response = await handleBackendRequest(request("patients", { cookie: personaCookie("secretaria") }), ["patients"], options(fetchMock));
    expect(response.status).toBe(200);
    expect(bearer(fetchMock)).toBe("Bearer ofk_lucia");
  });

  it("no persona on a staff route is 401 PERSONA_REQUIRED and the backend is never called", async () => {
    const fetchMock = upstream();
    const response = await handleBackendRequest(request("patients"), ["patients"], options(fetchMock));
    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe("PERSONA_REQUIRED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no persona on /me is 401 PERSONA_REQUIRED (the UI shows the picker)", async () => {
    const fetchMock = upstream();
    const response = await handleBackendRequest(request("me"), ["me"], options(fetchMock));
    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe("PERSONA_REQUIRED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a forged cookie attaches no token", async () => {
    const fetchMock = upstream();
    const response = await handleBackendRequest(request("me", { cookie: personaCookie("administrador", "attacker-chosen-secret-0123456789") }), ["me"], options(fetchMock));
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an unsigned persona name attaches no token", async () => {
    const fetchMock = upstream();
    const response = await handleBackendRequest(request("me", { cookie: `${PERSONA_COOKIE}=administrador` }), ["me"], options(fetchMock));
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an expired cookie attaches no token", async () => {
    const fetchMock = upstream();
    const response = await handleBackendRequest(request("me", { cookie: personaCookie("administrador", SECRET, NOW_S - 1) }), ["me"], options(fetchMock));
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a malformed cookie throws nothing and attaches no token", async () => {
    const fetchMock = upstream();
    const response = await handleBackendRequest(request("me", { cookie: `${PERSONA_COOKIE}=%E0%A4%A` }), ["me"], options(fetchMock));
    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe("PERSONA_REQUIRED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a signed persona that is no longer configured attaches no token", async () => {
    const fetchMock = upstream();
    const response = await handleBackendRequest(request("me", { cookie: personaCookie("gerente") }), ["me"], options(fetchMock));
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the integration-only `public` prefix keeps the integration token, with or without a persona", async () => {
    const routes = [...BROWSER_ROUTES, { method: "POST" as const, path: "public/bookings" }];
    const anonymous = upstream();
    const first = await handleBackendRequest(request("public/bookings", { method: "POST" }), ["public", "bookings"], options(anonymous, { routes }));
    expect(first.status).toBe(200);
    expect(bearer(anonymous)).toBe("Bearer ofk_integration");

    const signedIn = upstream();
    await handleBackendRequest(request("public/bookings", { method: "POST", cookie: personaCookie("secretaria") }), ["public", "bookings"], options(signedIn, { routes }));
    expect(bearer(signedIn)).toBe("Bearer ofk_integration");
  });

  it("the browser client never calls `public`, so the default allowlist does not expose it", async () => {
    const fetchMock = upstream();
    const response = await handleBackendRequest(request("public/bookings", { method: "POST" }), ["public", "bookings"], options(fetchMock));
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("D · route allowlist", () => {
  it.each([
    ["GET", "internal/x"],
    ["POST", "internal/x"],
    ["GET", "Internal/x"],
    ["POST", "agent-tools/call"],
    ["GET", "agent-tools"],
    ["POST", "agent/proposals"],
    ["GET", "agent/proposals"],
    ["DELETE", "patients"],
    ["PUT", "products/1"],
    ["PATCH", "appointments/1"],
    ["POST", "me"],
    ["GET", "agent/proposals/3/approve"],
    ["POST", "agent/proposals/3/approve/extra"],
    ["GET", "nothing-here"],
  ])("%s /%s is 403 ROUTE_NOT_ALLOWED and the backend is never called", async (method, path) => {
    const fetchMock = upstream();
    const response = await handleBackendRequest(request(path, { method, cookie: personaCookie("administrador") }), segments(path), options(fetchMock));
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("ROUTE_NOT_ALLOWED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an unsafe path is still 400 BFF_BAD_PATH", async () => {
    const fetchMock = upstream();
    const response = await handleBackendRequest(request("x", { cookie: personaCookie("administrador") }), ["patients", ".."], options(fetchMock));
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("BFF_BAD_PATH");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows the approval actions the client uses", async () => {
    const fetchMock = upstream();
    const path = "agent/proposals/3/approve";
    const response = await handleBackendRequest(request(path, { method: "POST", cookie: personaCookie("administrador") }), segments(path), options(fetchMock));
    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[0]![0]).toBe("http://backend.test/agent/proposals/3/approve");
  });

  it("covers every backend call the browser client makes", () => {
    const sources = ["src/contracts/client.ts", "src/api.ts"].map((file) => readFileSync(join(process.cwd(), file), "utf8")).join("\n");
    const calls = [...sources.matchAll(/\b(?:http|api)\.(get|post|put|patch|delete)\s*(?:<[^()]*?>)?\(\s*(["'`])(.*?)\2/gs)].map((match) => ({
      method: match[1]!.toUpperCase(),
      path: match[3]!,
    }));
    calls.push(...[...sources.matchAll(/getOrMock(?:<[^()]*?>)?\(\s*(["'`])(.*?)\1/gs)].map((match) => ({ method: "GET", path: match[2]! })));
    expect(calls.length).toBeGreaterThan(40);
    const uncovered = calls
      .map(({ method, path }) => ({ method, path, segments: path.replace(/\$\{[^}]*\}/g, "7").replace(/^\/+/, "").split("/") }))
      .filter(({ method, segments }) => !isRouteAllowed(method, segments))
      .map(({ method, path }) => `${method} ${path}`);
    expect(uncovered).toEqual([]);
  });

  it("the allowlist only names GET and POST routes", () => {
    expect(new Set(BROWSER_ROUTES.map((route) => route.method))).toEqual(new Set(["GET", "POST"]));
  });
});

describe("E · same-origin on mutations", () => {
  const path = "charges/7/payments";

  it("a non-GET without Origin is 403 and the backend is never called", async () => {
    const fetchMock = upstream();
    const response = await handleBackendRequest(request(path, { method: "POST", origin: null, cookie: personaCookie("secretaria") }), segments(path), options(fetchMock));
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("BFF_FORBIDDEN_ORIGIN");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a cross-site non-GET is 403", async () => {
    const fetchMock = upstream();
    const response = await handleBackendRequest(request(path, { method: "POST", origin: "http://evil.test", cookie: personaCookie("secretaria"), headers: { "sec-fetch-site": "cross-site" } }), segments(path), options(fetchMock));
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a same-origin non-GET goes through", async () => {
    const fetchMock = upstream();
    const response = await handleBackendRequest(request(path, { method: "POST", cookie: personaCookie("secretaria"), headers: { "sec-fetch-site": "same-origin" } }), segments(path), options(fetchMock));
    expect(response.status).toBe(200);
    expect(bearer(fetchMock)).toBe("Bearer ofk_lucia");
  });

  it("a GET needs no Origin", async () => {
    const fetchMock = upstream();
    const response = await handleBackendRequest(request(path, { cookie: personaCookie("secretaria") }), segments(path), options(fetchMock));
    expect(response.status).toBe(200);
  });
});
