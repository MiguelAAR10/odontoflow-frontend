/**
 * `/api/session` — which staff persona the browser acts as.
 *
 * GET  → `{personas: [{key, display_name, role}], current}` (never a token).
 * POST `{persona: key | null}` → sets or clears the httpOnly persona cookie.
 *
 * Who is signed in (name, roles, permissions) is the backend's `GET /me`,
 * reached through the proxy with the persona's credential; this endpoint only
 * chooses the persona. Pure: the Route Handler passes the parsed server env.
 */
import { findPersona, personaCookie, readPersonaKey, type Persona } from "./personas";

export interface SessionOptions {
  humans: readonly Persona[];
  secure: boolean;
}

export interface PersonaSummary {
  key: string;
  display_name: string;
  role: string;
}

export interface SessionState {
  personas: PersonaSummary[];
  current: string | null;
}

function sessionError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message, details: {} } }, { status, headers: { "cache-control": "no-store" } });
}

function sessionState(humans: readonly Persona[], current: string | null, setCookie?: string): Response {
  const body: SessionState = {
    personas: humans.map((persona) => ({ key: persona.key, display_name: persona.displayName, role: persona.role })),
    current: findPersona(humans, current)?.key ?? null,
  };
  const headers = new Headers({ "cache-control": "no-store" });
  if (setCookie) headers.set("set-cookie", setCookie);
  return Response.json(body, { status: 200, headers });
}

export async function handlePersonaSession(request: Request, options: SessionOptions): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method === "GET") return sessionState(options.humans, readPersonaKey(request));
  if (method !== "POST") return sessionError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");

  const origin = request.headers.get("origin");
  if (origin !== null && origin !== new URL(request.url).origin) {
    return sessionError(403, "BFF_FORBIDDEN_ORIGIN", "Origen no permitido.");
  }
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return sessionError(415, "UNSUPPORTED_MEDIA_TYPE", "Se esperaba JSON.");
  }
  let persona: unknown;
  try {
    persona = ((await request.json()) as { persona?: unknown } | null)?.persona;
  } catch {
    return sessionError(400, "INVALID_INPUT", "El cuerpo no es JSON válido.");
  }
  if (persona === null) return sessionState(options.humans, null, personaCookie(null, options));
  const chosen = typeof persona === "string" ? findPersona(options.humans, persona) : undefined;
  if (!chosen) return sessionError(400, "PERSONA_UNKNOWN", "Esa persona no está configurada en este servidor.");
  return sessionState(options.humans, chosen.key, personaCookie(chosen.key, options));
}
