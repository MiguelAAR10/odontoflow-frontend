/** BFF staff persona: pure server-side selection of the backend credential. */
import { describe, expect, it } from "vitest";
import {
  PERSONA_COOKIE,
  parseDemoHumans,
  personaCookie,
  readPersonaKey,
  selectBackendToken,
} from "../src/bff/personas";
import { handlePersonaSession } from "../src/bff/session";

const HUMANS_RAW = JSON.stringify([
  { role: "secretaria", display_name: "Lucía Ramos", token: "ofk_lucia" },
  { role: "administrador", display_name: "Carlos Vega", token: "ofk_carlos" },
]);
const humans = parseDemoHumans(HUMANS_RAW);
const config = { humans, integrationToken: "ofk_integration" };

const withCookie = (cookie?: string, init: RequestInit = {}) =>
  new Request("http://app.test/api/session", { ...init, headers: { ...(cookie ? { cookie } : {}), ...(init.headers as Record<string, string> | undefined) } });

describe("parseDemoHumans", () => {
  it("reads the seed's compact JSON [{role, display_name, token}] keyed by role", () => {
    expect(humans).toEqual([
      { key: "secretaria", displayName: "Lucía Ramos", role: "secretaria", token: "ofk_lucia" },
      { key: "administrador", displayName: "Carlos Vega", role: "administrador", token: "ofk_carlos" },
    ]);
  });

  it.each([undefined, "", "not json", "{}", "[1]", JSON.stringify([{ role: "Bad Key!", display_name: "X", token: "t" }]), JSON.stringify([{ role: "secretaria", display_name: "", token: "t" }])])(
    "ignores missing or malformed input %j",
    (raw) => {
      expect(parseDemoHumans(raw)).toEqual([]);
    },
  );

  it("keeps the first entry when a role repeats", () => {
    const parsed = parseDemoHumans(JSON.stringify([
      { role: "secretaria", display_name: "Lucía Ramos", token: "a" },
      { role: "secretaria", display_name: "Otra", token: "b" },
    ]));
    expect(parsed.map((persona) => persona.token)).toEqual(["a"]);
  });
});

describe("readPersonaKey", () => {
  it("reads only the persona cookie", () => {
    expect(readPersonaKey(withCookie(`theme=dark; ${PERSONA_COOKIE}=administrador; x=1`))).toBe("administrador");
    expect(readPersonaKey(withCookie("theme=dark"))).toBeNull();
    expect(readPersonaKey(withCookie())).toBeNull();
  });
});

describe("selectBackendToken", () => {
  it("uses the chosen person's token", () => {
    expect(selectBackendToken(["agent", "inbox"], "secretaria", config)).toBe("ofk_lucia");
    expect(selectBackendToken(["me"], "administrador", config)).toBe("ofk_carlos");
  });

  it("an unknown persona gets no credential (backend 401), never another person or the integration", () => {
    expect(selectBackendToken(["agent", "inbox"], "gerente", config)).toBeUndefined();
    expect(selectBackendToken(["patients"], "", config)).toBeUndefined();
  });

  it("without a persona cookie keeps the integration credential (pre-persona behaviour)", () => {
    expect(selectBackendToken(["patients"], null, config)).toBe("ofk_integration");
    expect(selectBackendToken(["patients"], null, { humans, integrationToken: undefined })).toBeUndefined();
  });

  it("integration-only routes always use the integration credential", () => {
    expect(selectBackendToken(["public", "bookings"], "secretaria", config)).toBe("ofk_integration");
    expect(selectBackendToken(["public", "bookings"], "gerente", config)).toBe("ofk_integration");
  });
});

describe("personaCookie", () => {
  it("is httpOnly, SameSite=Lax and path-wide; Secure only when asked", () => {
    const cookie = personaCookie("secretaria", { secure: false });
    expect(cookie).toMatch(new RegExp(`^${PERSONA_COOKIE}=secretaria;`));
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toContain("Secure");
    expect(personaCookie("secretaria", { secure: true })).toContain("Secure");
  });

  it("clears with Max-Age=0", () => {
    expect(personaCookie(null, { secure: false })).toMatch(new RegExp(`^${PERSONA_COOKIE}=; .*Max-Age=0`));
  });
});

describe("handlePersonaSession", () => {
  const options = { humans, secure: false };
  const json = (body: unknown, cookie?: string, headers: Record<string, string> = {}) =>
    withCookie(cookie, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });

  it("GET lists personas without tokens and reports the current one", async () => {
    const response = await handlePersonaSession(withCookie(`${PERSONA_COOKIE}=administrador`), options);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      personas: [
        { key: "secretaria", display_name: "Lucía Ramos", role: "secretaria" },
        { key: "administrador", display_name: "Carlos Vega", role: "administrador" },
      ],
      current: "administrador",
    });
    expect(JSON.stringify(body)).not.toContain("ofk_");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("GET with an unknown cookie reports no current persona", async () => {
    const body = await (await handlePersonaSession(withCookie(`${PERSONA_COOKIE}=gerente`), options)).json();
    expect(body.current).toBeNull();
  });

  it("POST a known persona sets the httpOnly cookie", async () => {
    const response = await handlePersonaSession(json({ persona: "secretaria" }), options);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(new RegExp(`^${PERSONA_COOKIE}=secretaria;.*HttpOnly`));
    expect((await response.json()).current).toBe("secretaria");
  });

  it("POST null clears the persona", async () => {
    const response = await handlePersonaSession(json({ persona: null }, `${PERSONA_COOKIE}=secretaria`), options);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await response.json()).current).toBeNull();
  });

  it("POST an unknown persona is refused and sets no cookie", async () => {
    const response = await handlePersonaSession(json({ persona: "gerente" }), options);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("PERSONA_UNKNOWN");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("POST requires a JSON body (a plain cross-site form cannot switch persona)", async () => {
    const form = withCookie(undefined, { method: "POST", body: "persona=secretaria", headers: { "content-type": "application/x-www-form-urlencoded" } });
    const response = await handlePersonaSession(form, options);
    expect(response.status).toBe(415);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("POST from another origin is refused", async () => {
    const response = await handlePersonaSession(json({ persona: "secretaria" }, undefined, { origin: "http://evil.test" }), options);
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects other methods", async () => {
    expect((await handlePersonaSession(withCookie(undefined, { method: "PUT" }), options)).status).toBe(405);
  });
});
