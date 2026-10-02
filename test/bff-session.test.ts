/** BFF session hardening: access code (A), signed cookie (B), same-origin (E), cookie flags (F). */
import { describe, expect, it } from "vitest";
import { PERSONA_COOKIE, parseDemoHumans, readPersonaKey, sessionSecret, signPersona } from "../src/bff/personas";
import { handlePersonaSession, type SessionOptions } from "../src/bff/session";

const humans = parseDemoHumans(JSON.stringify([
  { role: "secretaria", display_name: "Lucía Ramos", token: "ofk_lucia" },
  { role: "administrador", display_name: "Carlos Vega", token: "ofk_carlos" },
]));
const SECRET = "test-session-secret-0123456789abcdef";
const OTHER_SECRET = "another-secret-entirely-fedcba9876543210";
const CODE = "codigo-de-acceso-demo";
const NOW = Date.UTC(2026, 9, 2, 12, 0, 0);
const NOW_S = Math.floor(NOW / 1000);

const withCode: SessionOptions = { humans, secret: SECRET, accessCode: CODE, accessCodeVariable: "BFF_ACCESS_CODE", now: () => NOW };
const withoutCode: SessionOptions = { ...withCode, accessCode: undefined };

function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", origin: new URL(url).origin, ...headers },
  });
}
const get = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });
const cookieRequest = (value: string) => get("http://app.test/api/session", { cookie: `${PERSONA_COOKIE}=${value}` });

describe("A · access code", () => {
  it("a wrong code is 401 and sets no cookie", async () => {
    const response = await handlePersonaSession(post("http://app.test/api/session", { persona: "administrador", code: "adivinanza" }), withCode);
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("ACCESS_CODE_INVALID");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each([[{ persona: "administrador" }], [{ persona: "administrador", code: "" }], [{ persona: "administrador", code: 1234 }], [{ persona: "administrador", code: `${CODE}x` }], [{ persona: "administrador", code: CODE.slice(0, -1) }]])(
    "a missing or near-miss code %j is 401 and sets no cookie",
    async (body) => {
      const response = await handlePersonaSession(post("http://app.test/api/session", body), withCode);
      expect(response.status).toBe(401);
      expect(response.headers.get("set-cookie")).toBeNull();
    },
  );

  it("clearing the persona also needs the code", async () => {
    const response = await handlePersonaSession(post("http://app.test/api/session", { persona: null }), withCode);
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each(["http://localhost:5173", "http://127.0.0.1:5173", "http://[::1]:5173"])("without a configured code, %s may switch without one", async (origin) => {
    const response = await handlePersonaSession(post(`${origin}/api/session`, { persona: "secretaria" }), withoutCode);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(new RegExp(`^${PERSONA_COOKIE}=secretaria\\.`));
  });

  it("without a configured code, any other host is 503 naming the variable", async () => {
    const response = await handlePersonaSession(post("http://clinic.example/api/session", { persona: "secretaria", code: "anything" }), withoutCode);
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("ACCESS_CODE_NOT_CONFIGURED");
    expect(body.error.message).toContain("BFF_ACCESS_CODE");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("without a configured code, a localhost URL reached through a forwarded public host is 503", async () => {
    const request = post("http://localhost:5173/api/session", { persona: "secretaria" }, { "x-forwarded-host": "clinic.example" });
    expect((await handlePersonaSession(request, withoutCode)).status).toBe(503);
  });

  it("GET reveals only a requires_code boolean", async () => {
    const configured = await (await handlePersonaSession(get("http://app.test/api/session"), withCode)).json();
    expect(Object.keys(configured).sort()).toEqual(["current", "personas", "requires_code"]);
    expect(configured.requires_code).toBe(true);
    expect(JSON.stringify(configured)).not.toContain(CODE);
    expect((await (await handlePersonaSession(get("http://localhost:5173/api/session"), withoutCode)).json()).requires_code).toBe(false);
    expect((await (await handlePersonaSession(get("http://clinic.example/api/session"), withoutCode)).json()).requires_code).toBe(true);
  });
});

describe("B · signed persona cookie", () => {
  it("round-trips a signed value until it expires", () => {
    const value = signPersona("secretaria", SECRET, NOW_S + 60);
    expect(value).toMatch(/^secretaria\.\d+\.[A-Za-z0-9_-]+$/);
    expect(readPersonaKey(cookieRequest(value), SECRET, NOW)).toBe("secretaria");
  });

  it("a forged cookie (signed with another secret) is no persona", () => {
    expect(readPersonaKey(cookieRequest(signPersona("administrador", OTHER_SECRET, NOW_S + 60)), SECRET, NOW)).toBeNull();
  });

  it("a cookie whose persona was swapped is no persona, never the other person", () => {
    const [, expiry, mac] = signPersona("secretaria", SECRET, NOW_S + 60).split(".");
    expect(readPersonaKey(cookieRequest(`administrador.${expiry}.${mac}`), SECRET, NOW)).toBeNull();
  });

  it("a cookie whose expiry was extended is no persona", () => {
    const [persona, expiry, mac] = signPersona("secretaria", SECRET, NOW_S + 60).split(".");
    expect(readPersonaKey(cookieRequest(`${persona}.${Number(expiry) + 86400}.${mac}`), SECRET, NOW)).toBeNull();
  });

  it("an expired cookie is no persona", () => {
    expect(readPersonaKey(cookieRequest(signPersona("secretaria", SECRET, NOW_S - 1)), SECRET, NOW)).toBeNull();
    expect(readPersonaKey(cookieRequest(signPersona("secretaria", SECRET, NOW_S)), SECRET, NOW)).toBeNull();
  });

  it.each(["%E0%A4%A", "secretaria", "secretaria.", "secretaria.123", "secretaria.abc.def", "a.b.c.d", "", "Secretaria.9999999999.x", "%"])(
    "a malformed cookie %j is no persona and never throws",
    (value) => {
      expect(() => readPersonaKey(cookieRequest(value), SECRET, NOW)).not.toThrow();
      expect(readPersonaKey(cookieRequest(value), SECRET, NOW)).toBeNull();
    },
  );

  it("GET /api/session with a malformed cookie answers 200 with no persona", async () => {
    const response = await handlePersonaSession(cookieRequest("%E0%A4%A"), withCode);
    expect(response.status).toBe(200);
    expect((await response.json()).current).toBeNull();
  });

  it("the cookie set by POST verifies with the same secret only", async () => {
    const response = await handlePersonaSession(post("http://app.test/api/session", { persona: "administrador", code: CODE }), withCode);
    const value = /^of_persona=([^;]+);/.exec(response.headers.get("set-cookie") ?? "")![1]!;
    expect(readPersonaKey(cookieRequest(value), SECRET, NOW)).toBe("administrador");
    expect(readPersonaKey(cookieRequest(value), OTHER_SECRET, NOW)).toBeNull();
    expect(readPersonaKey(cookieRequest(value), SECRET, NOW + 13 * 60 * 60 * 1000)).toBeNull();
  });

  it("sessionSecret uses the configured secret, else one random secret per process", () => {
    expect(sessionSecret("configured-secret-value")).toBe("configured-secret-value");
    const fallback = sessionSecret(undefined);
    expect(fallback.length).toBeGreaterThanOrEqual(32);
    expect(sessionSecret("")).toBe(fallback);
    expect(sessionSecret(undefined)).toBe(fallback);
  });
});

describe("E · same-origin on POST /api/session", () => {
  it("a POST without Origin is 403 even with the right code", async () => {
    const request = new Request("http://app.test/api/session", { method: "POST", body: JSON.stringify({ persona: "secretaria", code: CODE }), headers: { "content-type": "application/json" } });
    const response = await handlePersonaSession(request, withCode);
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("an opaque Origin (null) is 403", async () => {
    const response = await handlePersonaSession(post("http://app.test/api/session", { persona: "secretaria", code: CODE }, { origin: "null" }), withCode);
    expect(response.status).toBe(403);
  });

  it("a cross-site request is 403 even when it carries the code", async () => {
    const request = post("http://app.test/api/session", { persona: "secretaria", code: CODE }, { origin: "http://evil.test", "sec-fetch-site": "cross-site" });
    expect((await handlePersonaSession(request, withCode)).status).toBe(403);
  });

  it("behind a TLS proxy, Sec-Fetch-Site: same-origin is accepted", async () => {
    const request = post("http://internal:3000/api/session", { persona: "secretaria", code: CODE }, { origin: "https://clinic.example", "sec-fetch-site": "same-origin" });
    expect((await handlePersonaSession(request, withCode)).status).toBe(200);
  });
});

describe("F · cookie flags", () => {
  const setCookie = async (url: string, headers: Record<string, string> = {}) =>
    (await handlePersonaSession(post(url, { persona: "secretaria", code: CODE }, headers), withCode)).headers.get("set-cookie") ?? "";

  it("is httpOnly, SameSite=Strict and Path=/", async () => {
    const cookie = await setCookie("http://app.test/api/session");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toContain("Secure");
  });

  it("is Secure when the request is https", async () => {
    expect(await setCookie("https://app.test/api/session")).toContain("Secure");
  });

  it("is Secure when a TLS-terminating proxy says x-forwarded-proto: https", async () => {
    expect(await setCookie("http://app.test/api/session", { "x-forwarded-proto": "https" })).toContain("Secure");
    expect(await setCookie("http://app.test/api/session", { "x-forwarded-proto": "https,http" })).toContain("Secure");
  });

  it("clearing keeps the same flags", async () => {
    const response = await handlePersonaSession(post("https://app.test/api/session", { persona: null, code: CODE }), withCode);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Secure");
  });
});
