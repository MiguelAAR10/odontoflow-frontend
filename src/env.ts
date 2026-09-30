/**
 * Public browser configuration for the operational frontend.
 *
 * Keep each access as a literal static member expression: Next.js inlines
 * NEXT_PUBLIC_* values into the browser bundle at build time. Legacy simulator
 * variables remain owned by its Node entrypoint and must not enter this graph.
 *
 * `BACKEND_URL` is the browser base URL: the same-origin BFF (`app/api/backend/[...path]`), which
 * injects the server-side credential. `NEXT_PUBLIC_BACKEND_URL` is only a
 * direct-connection override for the Node integration suite — not a secret and
 * not meant to be set for the browser build.
 */
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "/api/backend";
export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS !== "false";
export const VOICE_ENABLED = process.env.NEXT_PUBLIC_ENABLE_VOICE === "true";
export const VOICE_URL = process.env.NEXT_PUBLIC_VOICE_URL ?? "http://127.0.0.1:8000";
