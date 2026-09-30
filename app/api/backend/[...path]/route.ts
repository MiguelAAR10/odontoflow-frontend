import { proxyToBackend } from "../../../../src/bff/proxy";

/**
 * Same-origin BFF for the backend. Server-only configuration is read per
 * request, inside the handler, so it never enters a client module graph:
 *   BACKEND_URL         — backend origin (default http://127.0.0.1:8010)
 *   BACKEND_DEMO_TOKEN  — optional bearer injected server-side
 */
type Context = { params: Promise<{ path: string[] }> };

async function handle(request: Request, { params }: Context): Promise<Response> {
  const { path } = await params;
  return proxyToBackend(request, path, {
    backendUrl: process.env.BACKEND_URL || "http://127.0.0.1:8010",
    token: process.env.BACKEND_DEMO_TOKEN,
    fetch,
  });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
