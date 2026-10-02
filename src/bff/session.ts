/**
 * `/api/session` — which staff persona the browser acts as.
 *
 * GET  → `{personas: [{key, display_name, role}], current, requires_code}`
 *        (never a token, never the code).
 * POST `{persona: key | null, code}` → sets or clears the signed httpOnly
 *        persona cookie. Same-origin only, and only with the server's access
 *        code; when no code is configured, only on a loopback host.
 *
 * Who is signed in (name, roles, permissions) is the backend's `GET /me`,
 * reached through the proxy with the persona's credential; this endpoint only
 * chooses the persona. Pure: the Route Handler passes the parsed server env.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { findPersona, personaCookie, readPersonaKey, type Persona } from "./personas";
import { isSameOriginRequest, isSecureRequest } from "./proxy";

export interface SessionOptions {
  humans: readonly Persona[];
  /** HMAC secret the persona cookie is signed with. */
  secret: string;
  /** The access code a POST must carry; unset → loopback hosts only. */
  accessCode: string | undefined;
  /** Name of the server variable holding the code, for the 503 message. */
  accessCodeVariable: string;
  now?: () => number;
}

export interface PersonaSummary {
  key: string;
  display_name: string;
  role: string;
}

export interface SessionState {
  personas: PersonaSummary[];
  current: string | null;
  requires_code: boolean;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function sessionError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message, details: {} } }, { status, headers: { "cache-control": "no-store" } });
}

/** Loopback by URL and, when a proxy forwarded the request, by forwarded host too. */
function isLoopbackRequest(request: Request): boolean {
  if (!LOOPBACK_HOSTS.has(new URL(request.url).hostname)) return false;
  const forwarded = request.headers.get("x-forwarded-host");
  if (forwarded === null) return true;
  return forwarded.split(",").every((host) => {
    try {
      return LOOPBACK_HOSTS.has(new URL(`http://${host.trim()}`).hostname);
    } catch {
      return false;
    }
  });
}

/** Hash both sides so lengths match and the comparison is constant-time. */
function codeMatches(given: unknown, expected: string): boolean {
  if (typeof given !== "string" || !given) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

function sessionState(request: Request, options: SessionOptions, current: string | null, setCookie?: string): Response {
  const body: SessionState = {
    personas: options.humans.map((persona) => ({ key: persona.key, display_name: persona.displayName, role: persona.role })),
    current: findPersona(options.humans, current)?.key ?? null,
    requires_code: options.accessCode ? true : !isLoopbackRequest(request),
  };
  const headers = new Headers({ "cache-control": "no-store" });
  if (setCookie) headers.set("set-cookie", setCookie);
  return Response.json(body, { status: 200, headers });
}

export async function handlePersonaSession(request: Request, options: SessionOptions): Promise<Response> {
  const method = request.method.toUpperCase();
  const now = options.now?.() ?? Date.now();
  if (method === "GET") return sessionState(request, options, readPersonaKey(request, options.secret, now));
  if (method !== "POST") return sessionError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");

  if (!isSameOriginRequest(request)) return sessionError(403, "BFF_FORBIDDEN_ORIGIN", "Origen no permitido.");
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return sessionError(415, "UNSUPPORTED_MEDIA_TYPE", "Se esperaba JSON.");
  }
  let payload: { persona?: unknown; code?: unknown } | null;
  try {
    payload = (await request.json()) as { persona?: unknown; code?: unknown } | null;
  } catch {
    return sessionError(400, "INVALID_INPUT", "El cuerpo no es JSON válido.");
  }

  if (options.accessCode) {
    if (!codeMatches(payload?.code, options.accessCode)) {
      return sessionError(401, "ACCESS_CODE_INVALID", "El código de acceso no es correcto.");
    }
  } else if (!isLoopbackRequest(request)) {
    return sessionError(503, "ACCESS_CODE_NOT_CONFIGURED", `Este servidor no tiene ${options.accessCodeVariable} configurado; cambiar de persona solo se permite en localhost.`);
  }

  const cookie = { secure: isSecureRequest(request), secret: options.secret, now };
  const persona = payload?.persona;
  if (persona === null) return sessionState(request, options, null, personaCookie(null, cookie));
  const chosen = typeof persona === "string" ? findPersona(options.humans, persona) : undefined;
  if (!chosen) return sessionError(400, "PERSONA_UNKNOWN", "Esa persona no está configurada en este servidor.");
  return sessionState(request, options, chosen.key, personaCookie(chosen.key, cookie));
}
