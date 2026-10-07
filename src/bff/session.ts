/**
 * `/api/session` — which staff persona the browser acts as.
 *
 * GET  → `{personas: [{key, display_name, role}], current, requires_code}`
 *        (never a token, never the code).
 * POST `{persona: key | null, code}` → sets or clears the signed httpOnly
 *        persona cookie. Same-origin only. Clearing (`persona: null`) needs
 *        nothing more; choosing needs the server's access code — when none is
 *        configured, only on a loopback host and never in production. Five
 *        wrong codes from one client within ten minutes → 429 until the
 *        window passes. A rejected (too short) session secret → 503.
 *
 * Who is signed in (name, roles, permissions) is the backend's `GET /me`,
 * reached through the proxy with the persona's credential; this endpoint only
 * chooses the persona. Pure: the Route Handler passes the parsed server env.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { MIN_SESSION_SECRET_LENGTH, findPersona, personaCookie, readPersonaKey, type Persona } from "./personas";
import { isSameOriginRequest, isSecureRequest } from "./proxy";

export interface SessionOptions {
  humans: readonly Persona[];
  /** HMAC secret the persona cookie is signed with. */
  secret: string;
  /** The access code a POST must carry; unset → loopback hosts only. */
  accessCode: string | undefined;
  /** Name of the server variable holding the code, for the 503 message. */
  accessCodeVariable: string;
  /** In production an unset code fails closed whatever the Host. */
  production?: boolean | undefined;
  /** Wrong-code counter; the Route Handler passes the per-process one. */
  attempts?: AttemptLimiter | undefined;
  /** Set when the configured session secret was rejected as too short; names the variable for the 503. */
  rejectedSecretVariable?: string | undefined;
  now?: () => number;
}

export interface AttemptLimiter {
  /** Seconds until `client` may try again; 0 when it is not locked out. */
  retryAfterSeconds(client: string, nowMs: number): number;
  recordFailure(client: string, nowMs: number): void;
  recordSuccess(client: string): void;
  size(): number;
}

export interface AttemptLimiterOptions {
  maxFailures?: number;
  windowMs?: number;
  /** Bound on remembered clients; the oldest is dropped beyond it. */
  maxClients?: number;
}

/** In-memory sliding-window counter of wrong access codes per client. */
export function createAttemptLimiter({ maxFailures = 5, windowMs = 10 * 60 * 1000, maxClients = 10_000 }: AttemptLimiterOptions = {}): AttemptLimiter {
  const failures = new Map<string, number[]>();
  const recent = (client: string, nowMs: number) => (failures.get(client) ?? []).filter((at) => nowMs - at < windowMs);
  return {
    retryAfterSeconds(client, nowMs) {
      const times = recent(client, nowMs);
      if (times.length < maxFailures) return 0;
      return Math.max(1, Math.ceil((times[times.length - maxFailures]! + windowMs - nowMs) / 1000));
    },
    recordFailure(client, nowMs) {
      const times = [...recent(client, nowMs), nowMs].slice(-maxFailures);
      failures.delete(client);
      if (failures.size >= maxClients) {
        for (const [key, value] of failures) if (value.every((at) => nowMs - at >= windowMs)) failures.delete(key);
        while (failures.size >= maxClients) failures.delete(failures.keys().next().value!);
      }
      failures.set(client, times);
    },
    recordSuccess(client) {
      failures.delete(client);
    },
    size: () => failures.size,
  };
}

const PROCESS_ATTEMPTS = Symbol.for("odontoflow.bff.accessCodeAttempts");

/** One limiter per server process, shared by every Route Handler bundle. */
export function processAttemptLimiter(): AttemptLimiter {
  const store = globalThis as typeof globalThis & { [PROCESS_ATTEMPTS]?: AttemptLimiter };
  return (store[PROCESS_ATTEMPTS] ??= createAttemptLimiter());
}

/** The client address the request exposes: first x-forwarded-for hop, else one shared bucket. */
function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
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
    requires_code: options.accessCode ? true : options.production === true || !isLoopbackRequest(request),
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

  const cookie = { secure: isSecureRequest(request), secret: options.secret, now };
  const persona = payload?.persona;
  // Leaving is always allowed: it only drops this browser's own cookie.
  if (persona === null) return sessionState(request, options, null, personaCookie(null, cookie));

  if (options.rejectedSecretVariable) {
    return sessionError(503, "SESSION_SECRET_TOO_SHORT", `${options.rejectedSecretVariable} tiene menos de ${MIN_SESSION_SECRET_LENGTH} caracteres; configúralo con un valor más largo para poder elegir persona.`);
  }
  if (options.accessCode) {
    const client = clientKey(request);
    const retryAfter = options.attempts?.retryAfterSeconds(client, now) ?? 0;
    if (retryAfter > 0) {
      const response = sessionError(429, "ACCESS_CODE_RATE_LIMITED", "Demasiados intentos con un código incorrecto. Vuelve a intentarlo más tarde.");
      response.headers.set("retry-after", String(retryAfter));
      return response;
    }
    if (!codeMatches(payload?.code, options.accessCode)) {
      options.attempts?.recordFailure(client, now);
      return sessionError(401, "ACCESS_CODE_INVALID", "El código de acceso no es correcto.");
    }
    options.attempts?.recordSuccess(client);
  } else if (options.production) {
    return sessionError(503, "ACCESS_CODE_NOT_CONFIGURED", `Este servidor no tiene ${options.accessCodeVariable} configurado; en producción no se puede cambiar de persona sin él.`);
  } else if (!isLoopbackRequest(request)) {
    return sessionError(503, "ACCESS_CODE_NOT_CONFIGURED", `Este servidor no tiene ${options.accessCodeVariable} configurado; cambiar de persona solo se permite en localhost.`);
  }

  const chosen = typeof persona === "string" ? findPersona(options.humans, persona) : undefined;
  if (!chosen) return sessionError(400, "PERSONA_UNKNOWN", "Esa persona no está configurada en este servidor.");
  return sessionState(request, options, chosen.key, personaCookie(chosen.key, cookie));
}
