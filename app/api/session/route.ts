import { parseDemoHumans } from "../../../src/bff/personas";
import { handlePersonaSession } from "../../../src/bff/session";

/**
 * Staff persona switch. Reads `BACKEND_DEMO_HUMANS` (server-only) per request;
 * the response lists persona keys and names, never tokens.
 */
async function handle(request: Request): Promise<Response> {
  return handlePersonaSession(request, {
    humans: parseDemoHumans(process.env.BACKEND_DEMO_HUMANS),
    secure: new URL(request.url).protocol === "https:",
  });
}

export { handle as GET, handle as POST };
