import { parseDemoHumans, sessionSecret } from "../../../../src/bff/personas";
import { handleBackendRequest } from "../../../../src/bff/proxy";

/**
 * Same-origin BFF for the backend. Server-only configuration is read per
 * request, inside the handler, so it never enters a client module graph:
 *   BACKEND_URL          — backend origin (default http://127.0.0.1:8010)
 *   BACKEND_DEMO_TOKEN   — integration bearer, only for integration-only
 *                          routes (`/public/*`); never an anonymous fallback
 *   BACKEND_DEMO_HUMANS  — seed JSON `[{role, display_name, token}]`; the
 *                          signed persona cookie picks one of these tokens
 *   BFF_SESSION_SECRET   — HMAC secret the persona cookie is verified with
 */
type Context = { params: Promise<{ path: string[] }> };

async function handle(request: Request, { params }: Context): Promise<Response> {
  const { path } = await params;
  return handleBackendRequest(request, path, {
    backendUrl: process.env.BACKEND_URL || "http://127.0.0.1:8010",
    fetch,
    humans: parseDemoHumans(process.env.BACKEND_DEMO_HUMANS),
    integrationToken: process.env.BACKEND_DEMO_TOKEN,
    secret: sessionSecret(process.env.BFF_SESSION_SECRET),
  });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
