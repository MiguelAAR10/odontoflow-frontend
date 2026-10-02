/**
 * Staff persona selection for the BFF — server-side only.
 *
 * The backend seed mints one human credential per demo staff person and writes
 * them as compact JSON `[{role, display_name, token}]`. The Route Handlers read
 * that value from server env and pass it here; tokens never leave the server.
 * The browser holds at most the persona key (the role) in an httpOnly cookie.
 *
 * Pure and framework-free so it can be unit-tested; no env access in this file.
 */

export const PERSONA_COOKIE = "of_persona";
/** One working day; the demo re-picks a person after that. */
const PERSONA_MAX_AGE_SECONDS = 12 * 60 * 60;
const PERSONA_KEY = /^[a-z][a-z0-9-]{0,31}$/;

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

export function readPersonaKey(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === PERSONA_COOKIE) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

export function findPersona(humans: readonly Persona[], key: string | null): Persona | undefined {
  return key === null ? undefined : humans.find((persona) => persona.key === key);
}

/**
 * The bearer the proxy injects:
 * - integration-only routes → the integration credential;
 * - a known persona → that person's credential;
 * - a cookie naming an unknown persona → none (the backend answers 401), never
 *   another person's or the integration's credential;
 * - no persona cookie → the integration credential (pre-persona behaviour).
 */
export function selectBackendToken(pathSegments: readonly string[], personaKey: string | null, config: CredentialConfig): string | undefined {
  const first = pathSegments[0]?.toLowerCase();
  if (first !== undefined && INTEGRATION_ONLY_PREFIXES.has(first)) return config.integrationToken;
  if (personaKey === null) return config.integrationToken;
  return findPersona(config.humans, personaKey)?.token;
}

export function personaCookie(key: string | null, { secure }: { secure: boolean }): string {
  const attributes = ["Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${key === null ? 0 : PERSONA_MAX_AGE_SECONDS}`];
  if (secure) attributes.push("Secure");
  return `${PERSONA_COOKIE}=${key === null ? "" : encodeURIComponent(key)}; ${attributes.join("; ")}`;
}
