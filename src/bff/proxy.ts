/**
 * Same-origin BFF proxy: browser → `/api/backend/*` → FastAPI backend.
 *
 * Pure and framework-free so it can be tested with a mocked `fetch`. The
 * Route Handler (`app/api/backend/[...path]/route.ts`) reads the server-only
 * configuration and calls `handleBackendRequest`, which guards the request
 * (route allowlist, same-origin, signed persona) and only then forwards it with
 * `proxyToBackend`. The credential is injected on the server; it never reaches
 * the browser bundle.
 *
 * The backend's error envelope passes through untouched so `toApiError`
 * keeps working. Only proxy-level failures use the proxy's own envelope.
 */
import { findPersona, isIntegrationOnlyPath, readPersonaKey, selectBackendToken, type Persona } from "./personas";

export interface ProxyOptions {
  backendUrl: string;
  token?: string | undefined;
  fetch: typeof fetch;
}

/** Browser headers allowed to reach the backend. Everything else — notably
 *  `authorization` and `cookie` — is dropped. */
const FORWARDED_REQUEST_HEADERS = ["content-type", "accept", "idempotency-key", "x-request-id"] as const;

/** Backend response headers returned to the browser as-is. `idempotent-replay`
 *  tells the UI a retried intent was replayed, not executed twice. */
const FORWARDED_RESPONSE_HEADERS = ["content-type", "retry-after", "x-request-id", "idempotent-replay"] as const;

/** `/internal/*` is server-to-server only. Defence in depth behind the
 *  allowlist in `handleBackendRequest`. */
const FORBIDDEN_PREFIXES = new Set(["internal"]);

function proxyError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message, details: {} } }, { status });
}

function hasBody(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}

function isSafePath(pathSegments: readonly string[]): boolean {
  return (
    pathSegments.length > 0 &&
    !pathSegments.some((segment) => segment === "" || segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\"))
  );
}

const badPath = () => proxyError(400, "BFF_BAD_PATH", "La ruta solicitada no es válida.");

export async function proxyToBackend(
  request: Request,
  pathSegments: readonly string[],
  options: ProxyOptions,
): Promise<Response> {
  if (!isSafePath(pathSegments)) return badPath();
  if (FORBIDDEN_PREFIXES.has(pathSegments[0]!.toLowerCase())) {
    return proxyError(403, "BFF_FORBIDDEN_PATH", "Esta ruta no está disponible desde el navegador.");
  }

  const base = options.backendUrl.replace(/\/+$/, "");
  const path = pathSegments.map((segment) => encodeURIComponent(segment)).join("/");
  const target = `${base}/${path}${new URL(request.url).search}`;

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  if (options.token) headers.set("authorization", `Bearer ${options.token}`);

  const method = request.method.toUpperCase();
  let body: ArrayBuffer | undefined;
  if (hasBody(method)) {
    const raw = await request.arrayBuffer();
    if (raw.byteLength > 0) body = raw;
  }

  let upstream: Response;
  try {
    upstream = await options.fetch(target, { method, headers, body, cache: "no-store", redirect: "manual" });
  } catch {
    return proxyError(502, "BACKEND_UNREACHABLE", "No se pudo contactar al servidor.");
  }

  const responseHeaders = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) responseHeaders.set(name, value);
  }
  const nullBody = method === "HEAD" || upstream.status === 204 || upstream.status === 304;
  return new Response(nullBody ? null : await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: responseHeaders,
  });
}

// --- guard: what the browser may reach, and as whom ----------------------------

export interface BrowserRoute {
  method: "GET" | "POST";
  /** Backend path without the leading slash; `:id` matches one id segment. */
  path: string;
}

/**
 * Every backend call the typed client (`src/contracts/client.ts`) makes, and
 * nothing else. `test/bff-guard.test.ts` fails when the client calls a path
 * this list does not cover. Server-to-server routes (`/internal`,
 * `/agent-tools`, creating proposals) are deliberately absent.
 */
export const BROWSER_ROUTES: readonly BrowserRoute[] = [
  { method: "GET", path: "me" },
  { method: "GET", path: "patients" },
  { method: "POST", path: "patients" },
  { method: "GET", path: "leads" },
  { method: "GET", path: "locations" },
  { method: "GET", path: "services" },
  { method: "GET", path: "practitioners/eligible" },
  { method: "POST", path: "slots/query" },
  { method: "GET", path: "appointments" },
  { method: "POST", path: "appointments" },
  { method: "GET", path: "appointments/:id" },
  { method: "POST", path: "appointments/:id/reschedule" },
  { method: "POST", path: "appointments/:id/cancel" },
  { method: "POST", path: "scheduling/appointment-proposals/confirm" },
  { method: "POST", path: "scheduling/appointment-proposals/decline" },
  { method: "GET", path: "visits" },
  { method: "POST", path: "visits" },
  { method: "GET", path: "visits/:id" },
  { method: "GET", path: "visits/:id/executions" },
  { method: "POST", path: "visits/:id/executions" },
  { method: "GET", path: "executions" },
  { method: "POST", path: "executions/:id/charges" },
  { method: "GET", path: "charges" },
  { method: "GET", path: "charges/:id" },
  { method: "GET", path: "charges/:id/payments" },
  { method: "POST", path: "charges/:id/payments" },
  { method: "GET", path: "charges/:id/follow-ups" },
  { method: "POST", path: "charges/:id/follow-ups" },
  { method: "GET", path: "payments" },
  { method: "POST", path: "payments/:id/verify" },
  { method: "GET", path: "follow-ups" },
  { method: "POST", path: "follow-ups/:id/reschedule" },
  { method: "POST", path: "follow-ups/:id/close" },
  { method: "GET", path: "products" },
  { method: "POST", path: "products" },
  { method: "GET", path: "products/:id" },
  { method: "GET", path: "products/:id/balance" },
  { method: "GET", path: "products/:id/movements" },
  { method: "POST", path: "products/:id/entries" },
  { method: "POST", path: "products/:id/adjustments" },
  { method: "POST", path: "products/:id/transfers" },
  { method: "GET", path: "agent/inbox" },
  { method: "POST", path: "agent/proposals/:id/approve" },
  { method: "POST", path: "agent/proposals/:id/decline" },
  { method: "GET", path: "agent-runs" },
  { method: "POST", path: "agent-runs" },
  { method: "POST", path: "agent-runs/jobs/run-due" },
  { method: "GET", path: "activity" },
  { method: "GET", path: "metrics/productivity" },
  { method: "GET", path: "conversations" },
  { method: "GET", path: "conversations/:id/messages" },
  { method: "GET", path: "handoffs" },
  { method: "POST", path: "handoffs/:id/claim" },
];

const ID_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

export function isRouteAllowed(method: string, pathSegments: readonly string[], routes: readonly BrowserRoute[] = BROWSER_ROUTES): boolean {
  const upper = method.toUpperCase();
  return routes.some((route) => {
    if (route.method !== upper) return false;
    const pattern = route.path.split("/");
    return pattern.length === pathSegments.length && pattern.every((part, index) => (part === ":id" ? ID_SEGMENT.test(pathSegments[index]!) : part === pathSegments[index]));
  });
}

function firstHeaderValue(request: Request, name: string): string | null {
  const value = request.headers.get(name)?.split(",")[0]?.trim();
  return value ? value : null;
}

/** https directly, or behind a TLS-terminating proxy that says so. */
export function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === "https:" || firstHeaderValue(request, "x-forwarded-proto")?.toLowerCase() === "https";
}

/**
 * A mutation must come from this app's own pages: an `Origin` header is
 * required, and either the browser says `Sec-Fetch-Site: same-origin` or the
 * Origin equals the request's origin (direct or as forwarded by a proxy).
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return false;
  if (request.headers.get("sec-fetch-site") === "same-origin") return true;
  const url = new URL(request.url);
  if (origin === url.origin) return true;
  const forwardedHost = firstHeaderValue(request, "x-forwarded-host");
  if (forwardedHost === null) return false;
  const forwardedProto = firstHeaderValue(request, "x-forwarded-proto") ?? url.protocol.replace(/:$/, "");
  return origin === `${forwardedProto}://${forwardedHost}`;
}

export interface GuardOptions {
  backendUrl: string;
  fetch: typeof fetch;
  humans: readonly Persona[];
  integrationToken?: string | undefined;
  /** HMAC secret the persona cookie is signed with. */
  secret: string;
  now?: () => number;
  routes?: readonly BrowserRoute[];
}

/**
 * The BFF entry point. Refuses — without calling the backend — anything the
 * browser client does not use (403 ROUTE_NOT_ALLOWED), cross-site mutations
 * (403 BFF_FORBIDDEN_ORIGIN) and staff routes without a valid signed persona
 * (401 PERSONA_REQUIRED). There is no anonymous credential: only the
 * integration-only prefixes carry the integration token.
 */
export async function handleBackendRequest(request: Request, pathSegments: readonly string[], options: GuardOptions): Promise<Response> {
  if (!isSafePath(pathSegments)) return badPath();
  const method = request.method.toUpperCase();
  if (!isRouteAllowed(method, pathSegments, options.routes)) {
    return proxyError(403, "ROUTE_NOT_ALLOWED", "Esta ruta no está disponible desde el navegador.");
  }
  if (method !== "GET" && method !== "HEAD" && !isSameOriginRequest(request)) {
    return proxyError(403, "BFF_FORBIDDEN_ORIGIN", "Origen no permitido.");
  }

  const integrationOnly = isIntegrationOnlyPath(pathSegments);
  const personaKey = integrationOnly ? null : readPersonaKey(request, options.secret, options.now?.());
  if (!integrationOnly && !findPersona(options.humans, personaKey)) {
    return proxyError(401, "PERSONA_REQUIRED", "Elige quién eres para continuar.");
  }
  const token = selectBackendToken(pathSegments, personaKey, { humans: options.humans, integrationToken: options.integrationToken });
  return proxyToBackend(request, pathSegments, { backendUrl: options.backendUrl, token, fetch: options.fetch });
}
