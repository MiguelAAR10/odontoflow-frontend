import { parseDemoHumans, sessionSecret } from "../../../src/bff/personas";
import { handlePersonaSession } from "../../../src/bff/session";

/**
 * Staff persona switch. Server-only variables, read per request:
 *   BACKEND_DEMO_HUMANS — seed JSON; the response lists keys and names, never tokens
 *   BFF_ACCESS_CODE     — the code a switch must carry (unset → localhost only)
 *   BFF_SESSION_SECRET  — HMAC secret for the persona cookie (unset → random per process)
 */
async function handle(request: Request): Promise<Response> {
  return handlePersonaSession(request, {
    humans: parseDemoHumans(process.env.BACKEND_DEMO_HUMANS),
    secret: sessionSecret(process.env.BFF_SESSION_SECRET),
    accessCode: process.env.BFF_ACCESS_CODE || undefined,
    accessCodeVariable: "BFF_ACCESS_CODE",
  });
}

export { handle as GET, handle as POST };
