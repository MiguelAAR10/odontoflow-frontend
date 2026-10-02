/** BFF session hardening: access code (A), signed cookie (B), same-origin (E), cookie flags (F),
 *  and the FE-SEC2 follow-up: fail closed in production (G), attempt limit (H), secret length (I),
 *  logout without code (J). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as sessionRoute } from "../app/api/session/route";
import { MIN_SESSION_SECRET_LENGTH, PERSONA_COOKIE, isWeakSessionSecret, parseDemoHumans, readPersonaKey, sessionSecret, signPersona } from "../src/bff/personas";
import { createAttemptLimiter, handlePersonaSession, type SessionOptions } from "../src/bff/session";

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
    expect(sessionSecret("configured-secret-value-0123456789")).toBe("configured-secret-value-0123456789");
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

describe("G · fail closed in production without an access code", () => {
  const production: SessionOptions = { ...withoutCode, production: true };

  it.each(["http://localhost:5173", "http://127.0.0.1:5173", "http://[::1]:5173", "http://clinic.example"])("in production, %s without a code is 503 naming the variable", async (origin) => {
    const response = await handlePersonaSession(post(`${origin}/api/session`, { persona: "secretaria" }), production);
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("ACCESS_CODE_NOT_CONFIGURED");
    expect(body.error.message).toContain("BFF_ACCESS_CODE");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("in production, GET on localhost reports requires_code", async () => {
    expect((await (await handlePersonaSession(get("http://localhost:5173/api/session"), production)).json()).requires_code).toBe(true);
  });

  it("in production with a code, the code still works", async () => {
    const response = await handlePersonaSession(post("http://localhost:5173/api/session", { persona: "secretaria", code: CODE }), { ...withCode, production: true });
    expect(response.status).toBe(200);
  });
});

describe("H · access-code attempt limit", () => {
  const clock = { now: NOW };
  const limited = (attempts = createAttemptLimiter()): SessionOptions => ({ ...withCode, now: () => clock.now, attempts });
  const from = (client: string | undefined, body: unknown) =>
    post("http://app.test/api/session", body, client === undefined ? {} : { "x-forwarded-for": client });
  const fail = async (options: SessionOptions, client: string | undefined, times: number) => {
    for (let i = 0; i < times; i += 1) expect((await handlePersonaSession(from(client, { persona: "secretaria", code: "adivinanza" }), options)).status).toBe(401);
  };

  afterEach(() => {
    clock.now = NOW;
  });

  it("after 5 wrong codes the client gets 429 with Retry-After, even with the right code, and no cookie", async () => {
    const options = limited();
    await fail(options, "203.0.113.7", 5);
    const response = await handlePersonaSession(from("203.0.113.7", { persona: "secretaria", code: CODE }), options);
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe("ACCESS_CODE_RATE_LIMITED");
    expect(response.headers.get("retry-after")).toBe("600");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("4 wrong codes still let the right one through", async () => {
    const options = limited();
    await fail(options, "203.0.113.7", 4);
    expect((await handlePersonaSession(from("203.0.113.7", { persona: "secretaria", code: CODE }), options)).status).toBe(200);
  });

  it("the lock lifts when the 10-minute window passes; Retry-After counts down", async () => {
    const options = limited();
    await fail(options, "203.0.113.7", 5);
    clock.now = NOW + 9 * 60 * 1000;
    const locked = await handlePersonaSession(from("203.0.113.7", { persona: "secretaria", code: CODE }), options);
    expect(locked.status).toBe(429);
    expect(locked.headers.get("retry-after")).toBe("60");
    clock.now = NOW + 10 * 60 * 1000;
    expect((await handlePersonaSession(from("203.0.113.7", { persona: "secretaria", code: CODE }), options)).status).toBe(200);
  });

  it("failures spread wider than the window never lock", async () => {
    const options = limited();
    for (let i = 0; i < 8; i += 1) {
      clock.now = NOW + i * 3 * 60 * 1000;
      await fail(options, "203.0.113.7", 1);
    }
    expect((await handlePersonaSession(from("203.0.113.7", { persona: "secretaria", code: CODE }), options)).status).toBe(200);
  });

  it("the counter is per client (first x-forwarded-for hop); a correct code does not reset other clients", async () => {
    const options = limited();
    await fail(options, "203.0.113.7, 10.0.0.1", 5);
    expect((await handlePersonaSession(from("198.51.100.9, 10.0.0.1", { persona: "secretaria", code: CODE }), options)).status).toBe(200);
    expect((await handlePersonaSession(from("203.0.113.7", { persona: "secretaria", code: CODE }), options)).status).toBe(429);
  });

  it("requests without x-forwarded-for share one bucket", async () => {
    const options = limited();
    await fail(options, undefined, 5);
    expect((await handlePersonaSession(from(undefined, { persona: "secretaria", code: CODE }), options)).status).toBe(429);
  });

  it("the client table is bounded", async () => {
    const attempts = createAttemptLimiter({ maxClients: 3 });
    const options = limited(attempts);
    for (let i = 0; i < 10; i += 1) await fail(options, `192.0.2.${i}`, 1);
    expect(attempts.size()).toBeLessThanOrEqual(3);
  });

  it("the route handler enforces the limit per process", async () => {
    vi.stubEnv("BFF_ACCESS_CODE", CODE);
    vi.stubEnv("BFF_SESSION_SECRET", SECRET);
    try {
      const client = { "x-forwarded-for": "192.0.2.250" };
      for (let i = 0; i < 5; i += 1) expect((await sessionRoute(post("http://app.test/api/session", { persona: "secretaria", code: "adivinanza" }, client))).status).toBe(401);
      const response = await sessionRoute(post("http://app.test/api/session", { persona: "secretaria", code: CODE }, client));
      expect(response.status).toBe(429);
      expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("I · session secret length", () => {
  const short = "x".repeat(MIN_SESSION_SECRET_LENGTH - 1);

  it("a secret shorter than 32 characters is treated as unset", () => {
    expect(MIN_SESSION_SECRET_LENGTH).toBe(32);
    const fallback = sessionSecret(undefined);
    expect(isWeakSessionSecret(short)).toBe(true);
    expect(isWeakSessionSecret("x".repeat(32))).toBe(false);
    expect(isWeakSessionSecret(undefined)).toBe(false);
    expect(isWeakSessionSecret("")).toBe(false);
    expect(sessionSecret(short)).toBe(fallback);
    expect(sessionSecret("x".repeat(32))).toBe("x".repeat(32));
  });

  it("a short secret is reported once per variable, by name and never by value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      sessionSecret("weak-secret-value", "TEST_WEAK_SECRET_VARIABLE");
      sessionSecret("weak-secret-value", "TEST_WEAK_SECRET_VARIABLE");
      expect(warn).toHaveBeenCalledTimes(1);
      const message = warn.mock.calls.flat().join(" ");
      expect(message).toContain("TEST_WEAK_SECRET_VARIABLE");
      expect(message).not.toContain("weak-secret-value");
    } finally {
      warn.mockRestore();
    }
  });

  it("choosing a persona with a rejected secret is 503 naming the variable, never the value", async () => {
    const response = await handlePersonaSession(post("http://app.test/api/session", { persona: "secretaria", code: CODE }), { ...withCode, rejectedSecretVariable: "BFF_SESSION_SECRET" });
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("SESSION_SECRET_TOO_SHORT");
    expect(body.error.message).toContain("BFF_SESSION_SECRET");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("the route handler rejects a short BFF_SESSION_SECRET without echoing it", async () => {
    vi.stubEnv("BFF_ACCESS_CODE", CODE);
    vi.stubEnv("BFF_SESSION_SECRET", "short-route-secret");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const response = await sessionRoute(post("http://app.test/api/session", { persona: "secretaria", code: CODE }));
      expect(response.status).toBe(503);
      const text = await response.text();
      expect(text).toContain("BFF_SESSION_SECRET");
      expect(text).not.toContain("short-route-secret");
      expect(warn.mock.calls.flat().join(" ")).not.toContain("short-route-secret");
    } finally {
      warn.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});

describe("J · logout without the access code", () => {
  const logout = (url = "http://app.test/api/session", headers: Record<string, string> = {}) => post(url, { persona: null }, headers);
  const expectCleared = async (response: Response) => {
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(new RegExp(`^${PERSONA_COOKIE}=; .*Max-Age=0`));
    expect((await response.json()).current).toBeNull();
  };

  it("clearing the persona needs no code", async () => {
    await expectCleared(await handlePersonaSession(logout(), withCode));
  });

  it("clearing ignores a wrong code and does not count it as a failed attempt", async () => {
    const attempts = createAttemptLimiter();
    const options = { ...withCode, attempts };
    for (let i = 0; i < 6; i += 1) await expectCleared(await handlePersonaSession(post("http://app.test/api/session", { persona: null, code: "adivinanza" }), options));
    expect((await handlePersonaSession(post("http://app.test/api/session", { persona: "secretaria", code: CODE }), options)).status).toBe(200);
  });

  it("clearing works while the client is locked out, in production without a code, and with a rejected secret", async () => {
    const attempts = createAttemptLimiter();
    const options = { ...withCode, attempts };
    for (let i = 0; i < 5; i += 1) await handlePersonaSession(post("http://app.test/api/session", { persona: "secretaria", code: "adivinanza" }), options);
    await expectCleared(await handlePersonaSession(logout(), options));
    await expectCleared(await handlePersonaSession(logout("http://clinic.example/api/session"), { ...withoutCode, production: true }));
    await expectCleared(await handlePersonaSession(logout(), { ...withCode, rejectedSecretVariable: "BFF_SESSION_SECRET" }));
  });

  it("clearing still needs same-origin", async () => {
    const response = await handlePersonaSession(logout("http://app.test/api/session", { origin: "http://evil.test", "sec-fetch-site": "cross-site" }), withCode);
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
    const noOrigin = new Request("http://app.test/api/session", { method: "POST", body: JSON.stringify({ persona: null }), headers: { "content-type": "application/json" } });
    expect((await handlePersonaSession(noOrigin, withCode)).status).toBe(403);
  });
});

describe("G · route handler fails closed under NODE_ENV=production", () => {
  it("POST on localhost without BFF_ACCESS_CODE is 503", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BFF_ACCESS_CODE", "");
    vi.stubEnv("BFF_SESSION_SECRET", SECRET);
    try {
      const response = await sessionRoute(post("http://localhost:5173/api/session", { persona: "secretaria" }));
      expect(response.status).toBe(503);
      expect((await response.json()).error.message).toContain("BFF_ACCESS_CODE");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
