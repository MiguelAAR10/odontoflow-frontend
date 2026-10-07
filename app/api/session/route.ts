import { isWeakSessionSecret, parseDemoHumans, sessionSecret } from "../../../src/bff/personas";
import { handlePersonaSession, processAttemptLimiter } from "../../../src/bff/session";

/**
 * Staff persona switch. Server-only variables, read per request:
 *   BACKEND_DEMO_HUMANS — seed JSON; the response lists keys and names, never tokens
 *   BFF_ACCESS_CODE     — the code a switch must carry (unset → localhost only
 *                         outside production; in production → 503)
 *   BFF_SESSION_SECRET  — HMAC secret for the persona cookie, >= 32 characters
 *                         (unset → random per process; shorter → ignored and 503)
 * Wrong codes are counted per client in this process (5 per 10 minutes).
 */
async function handle(request: Request): Promise<Response> {
  const configuredSecret = process.env.BFF_SESSION_SECRET;
  return handlePersonaSession(request, {
    humans: parseDemoHumans(process.env.BACKEND_DEMO_HUMANS),
    secret: sessionSecret(configuredSecret, "BFF_SESSION_SECRET"),
    accessCode: process.env.BFF_ACCESS_CODE || undefined,
    accessCodeVariable: "BFF_ACCESS_CODE",
    production: process.env.NODE_ENV === "production",
    attempts: processAttemptLimiter(),
    rejectedSecretVariable: isWeakSessionSecret(configuredSecret) ? "BFF_SESSION_SECRET" : undefined,
  });
}

export { handle as GET, handle as POST };
