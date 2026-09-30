/**
 * Same-origin BFF proxy: browser → `/api/backend/*` → FastAPI backend.
 *
 * Pure and framework-free so it can be tested with a mocked `fetch`. The
 * Route Handler (`app/api/backend/[...path]/route.ts`) reads the server-only
 * configuration and delegates here. The demo credential is injected on the
 * server; it never reaches the browser bundle.
 *
 * The backend's error envelope passes through untouched so `toApiError`
 * keeps working. Only proxy-level failures use the proxy's own envelope.
 */

export interface ProxyOptions {
  backendUrl: string;
  token?: string | undefined;
  fetch: typeof fetch;
}

/** Browser headers allowed to reach the backend. Everything else — notably
 *  `authorization` and `cookie` — is dropped. */
const FORWARDED_REQUEST_HEADERS = ["content-type", "accept", "idempotency-key", "x-request-id"] as const;

/** Backend response headers returned to the browser as-is. */
const FORWARDED_RESPONSE_HEADERS = ["content-type", "retry-after", "x-request-id"] as const;

/** `/internal/*` is server-to-server only; later phases may add an explicit allowlist. */
const FORBIDDEN_PREFIXES = new Set(["internal"]);

function proxyError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message, details: {} } }, { status });
}

function hasBody(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}

export async function proxyToBackend(
  request: Request,
  pathSegments: readonly string[],
  options: ProxyOptions,
): Promise<Response> {
  if (
    pathSegments.length === 0 ||
    pathSegments.some((segment) => segment === "" || segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\"))
  ) {
    return proxyError(400, "BFF_BAD_PATH", "La ruta solicitada no es válida.");
  }
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
