/**
 * Staff persona selection for the BFF — server-side only.
 *
 * The backend seed mints one human credential per demo staff person and writes
 * them as compact JSON `[{role, display_name, token}]`. The Route Handlers read
 * that value from server env and pass it here; tokens never leave the server.
 * The browser holds at most a signed persona key in an httpOnly cookie:
 * `<persona>.<expiry>.<hmac>`, HMAC-SHA256 over `<persona>.<expiry>` with the
 * server's session secret. Anything that does not verify is "no persona".
 *
 * Pure and framework-free so it can be unit-tested; no env access in this file.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const PERSONA_COOKIE = "of_persona";
/** One working day; the demo re-picks a person after that. */
export const PERSONA_MAX_AGE_SECONDS = 12 * 60 * 60;
const PERSONA_KEY = /^[a-z][a-z0-9-]{0,31}$/;
/** `<persona>.<expiry seconds>.<base64url HMAC-SHA256>`; no percent-encoding is ever needed. */
const SIGNED_PERSONA = /^([a-z][a-z0-9-]{0,31})\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/;

/** Routes the backend only accepts from an integration principal (SELF:
 *  `POST /public/bookings` → 403 for humans). They keep the integration
 *  credential whoever is signed in. */
const INTEGRATION_ONLY_PREFIXES = new Set(["public"]);

export interface Persona {
  key: string;
  displayName: string;
  role: string;
  token: string;
}

export interface CredentialConfig {
  humans: readonly Persona[];
  integrationToken?: string | undefined;
}

export function parseDemoHumans(raw: string | undefined): Persona[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const personas: Persona[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const { role, display_name: displayName, token } = entry as Record<string, unknown>;
    if (typeof role !== "string" || !PERSONA_KEY.test(role)) continue;
    if (typeof displayName !== "string" || !displayName.trim()) continue;
    if (typeof token !== "string" || !token) continue;
    if (personas.some((persona) => persona.key === role)) continue;
    personas.push({ key: role, displayName, role, token });
  }
  return personas;
}

function mac(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signPersona(key: string, secret: string, expiresAtSeconds: number): string {
  const payload = `${key}.${Math.floor(expiresAtSeconds)}`;
  return `${payload}.${mac(payload, secret)}`;
}

/** The persona key of a signed cookie value, or null when it is unsigned,
 *  forged, expired or malformed. Never throws. */
export function verifyPersonaValue(value: string, secret: string, nowMs: number = Date.now()): string | null {
  const match = SIGNED_PERSONA.exec(value);
  if (!match) return null;
  const key = match[1]!;
  const expiry = match[2]!;
  const signature = match[3]!;
  const expected = Buffer.from(mac(`${key}.${expiry}`, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return Number(expiry) * 1000 > nowMs ? key : null;
}

/** The verified persona key from the request's cookie, or null. */
export function readPersonaKey(request: Request, secret: string, nowMs: number = Date.now()): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0 || part.slice(0, index).trim() !== PERSONA_COOKIE) continue;
    const key = verifyPersonaValue(part.slice(index + 1).trim(), secret, nowMs);
    if (key !== null) return key;
  }
  return null;
}

const PROCESS_SECRET = Symbol.for("odontoflow.bff.sessionSecret");
const REPORTED_WEAK_SECRETS = Symbol.for("odontoflow.bff.reportedWeakSecrets");
/** A configured session secret shorter than this is rejected (treated as unset). */
export const MIN_SESSION_SECRET_LENGTH = 32;

/** True when a secret is configured but too short to sign cookies with. */
export function isWeakSessionSecret(configured: string | undefined): boolean {
  return !!configured && configured.length < MIN_SESSION_SECRET_LENGTH;
}

/** The configured session secret, else one random secret per server process
 *  (kept on `globalThis` so every Route Handler bundle shares it); cookies
 *  signed with it die when the process restarts. A secret shorter than
 *  `MIN_SESSION_SECRET_LENGTH` counts as unset and is reported once per
 *  variable, by name only — never its value. */
export function sessionSecret(configured: string | undefined, variable = "the session secret"): string {
  if (configured && !isWeakSessionSecret(configured)) return configured;
  const store = globalThis as typeof globalThis & { [PROCESS_SECRET]?: string; [REPORTED_WEAK_SECRETS]?: Set<string> };
  if (isWeakSessionSecret(configured)) {
    const reported = (store[REPORTED_WEAK_SECRETS] ??= new Set());
    if (!reported.has(variable)) {
      reported.add(variable);
      console.warn(`[bff] ${variable} is shorter than ${MIN_SESSION_SECRET_LENGTH} characters; ignoring it and using a random per-process secret.`);
    }
  }
  store[PROCESS_SECRET] ??= randomBytes(32).toString("base64url");
  return store[PROCESS_SECRET];
}

export function findPersona(humans: readonly Persona[], key: string | null): Persona | undefined {
  return key === null ? undefined : humans.find((persona) => persona.key === key);
}

/**
 * The bearer the proxy injects:
 * - integration-only routes → the integration credential;
 * - a known persona → that person's credential;
 * - an unknown persona or no persona → none, never another person's or the
 *   integration's credential (the proxy answers 401 PERSONA_REQUIRED itself).
 */
export function isIntegrationOnlyPath(pathSegments: readonly string[]): boolean {
  const first = pathSegments[0]?.toLowerCase();
  return first !== undefined && INTEGRATION_ONLY_PREFIXES.has(first);
}

export function selectBackendToken(pathSegments: readonly string[], personaKey: string | null, config: CredentialConfig): string | undefined {
  if (isIntegrationOnlyPath(pathSegments)) return config.integrationToken;
  return findPersona(config.humans, personaKey)?.token;
}

export interface PersonaCookieOptions {
  secure: boolean;
  secret: string;
  now?: number;
}

/** `Set-Cookie` for a signed persona (or clearing it with `null`). */
export function personaCookie(key: string | null, { secure, secret, now = Date.now() }: PersonaCookieOptions): string {
  const attributes = ["Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${key === null ? 0 : PERSONA_MAX_AGE_SECONDS}`];
  if (secure) attributes.push("Secure");
  const value = key === null ? "" : signPersona(key, secret, Math.floor(now / 1000) + PERSONA_MAX_AGE_SECONDS);
  return `${PERSONA_COOKIE}=${value}; ${attributes.join("; ")}`;
}
