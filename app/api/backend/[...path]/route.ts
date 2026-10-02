import { parseDemoHumans, readPersonaKey, selectBackendToken } from "../../../../src/bff/personas";
import { proxyToBackend } from "../../../../src/bff/proxy";

/**
 * Same-origin BFF for the backend. Server-only configuration is read per
 * request, inside the handler, so it never enters a client module graph:
 *   BACKEND_URL          — backend origin (default http://127.0.0.1:8010)
 *   BACKEND_DEMO_TOKEN   — integration bearer (used when no persona is chosen
 *                          and for integration-only routes)
 *   BACKEND_DEMO_HUMANS  — seed JSON `[{role, display_name, token}]`; the
 *                          persona cookie picks one of these tokens
 */
type Context = { params: Promise<{ path: string[] }> };

async function handle(request: Request, { params }: Context): Promise<Response> {
  const { path } = await params;
  const token = selectBackendToken(path, readPersonaKey(request), {
    humans: parseDemoHumans(process.env.BACKEND_DEMO_HUMANS),
    integrationToken: process.env.BACKEND_DEMO_TOKEN,
  });
  return proxyToBackend(request, path, {
    backendUrl: process.env.BACKEND_URL || "http://127.0.0.1:8010",
    token,
    fetch,
  });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
