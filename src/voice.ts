/**
 * Voice service client — the adapter seam for the contributed voice assistant.
 *
 * Provenance: the five client calls and the wire shapes below are the
 * contribution of **Alejandro Marcelo (AlejandroMarceloCh)**, ported from
 * `alejandro/feat/asistente-voz` (`c0f418d`, donor PR
 * leonardopanduro-rgb/ODONTO-SMART-FRONT#1). The donor placed them directly in
 * `src/api.ts`; they live in their own module here so the flag logic is
 * isolated and provable by test. The service they talk to is
 * `odontoflow-voice` (donor history preserved, upstream
 * `AlejandroMarceloCh/odonto-voz`).
 *
 * ## The gate (V1 environment contract)
 *
 * Two independent switches, and BOTH must allow it before a single byte
 * reaches the network:
 *
 * | `NEXT_PUBLIC_ENABLE_VOICE` | `NEXT_PUBLIC_USE_MOCKS` | behaviour |
 * |---|---|---|
 * | `false` (default) | anything | route hidden; every call rejects `disabled` |
 * | `true` | `true` (default) | page renders, **no HTTP ever**; calls reject `mocks` |
 * | `true` | `false` | live: requests go to `NEXT_PUBLIC_VOICE_URL` |
 *
 * The donor version had no gate — it fired live HTTP even in mock mode, which
 * breaks the M4 guarantee the pilot E2E depends on. `guardVoiceCall()` below is
 * that fix, and it runs **before** the axios instance is ever touched, so the
 * isolation is structural rather than a matter of discipline.
 *
 * There is deliberately **no mock/fixture voice transport**. A fake assistant
 * would invite mistaking scripted output for a real dictation, and V1 produces
 * drafts a human confirms. In mock mode the page says so plainly instead.
 */
import axios from "axios";
import { USE_MOCKS, VOICE_ENABLED, VOICE_URL } from "./env";
import type { VoiceHealth, VoiceReply, VoiceVisitSummary } from "./types";

/** Fallback base URL: the port `odontoflow-voice` documents in its README. */
export const VOICE_DEFAULT_URL = "http://127.0.0.1:8000";

/** Opt-in feature flag. Absent or anything but `"true"` means off. */
export const voiceEnabled = VOICE_ENABLED;

/** Mirrors `api.ts`: mocks are ON unless explicitly `"false"`. */
const mocksOn = USE_MOCKS;

/** The only condition under which voice HTTP is permitted. */
export const voiceLive = voiceEnabled && !mocksOn;

export const voiceBaseUrl = VOICE_URL;

export type VoiceUnavailableReason = "disabled" | "mocks";

/**
 * Thrown instead of performing a request when the gate is closed.
 *
 * The page treats it as a first-class state, not an error to log: it explains
 * *why* the assistant is unavailable rather than showing a generic failure.
 */
export class VoiceUnavailableError extends Error {
  readonly reason: VoiceUnavailableReason;

  constructor(reason: VoiceUnavailableReason) {
    super(
      reason === "disabled"
        ? "Voice is disabled (NEXT_PUBLIC_ENABLE_VOICE is not \"true\")."
        : "Voice is unavailable in mock mode (NEXT_PUBLIC_USE_MOCKS is not \"false\").",
    );
    this.name = "VoiceUnavailableError";
    this.reason = reason;
  }
}

export const isVoiceUnavailable = (error: unknown): error is VoiceUnavailableError =>
  error instanceof VoiceUnavailableError;

/**
 * Exported so tests can assert it is never touched while the gate is closed.
 * Creating the instance performs no I/O.
 */
export const voiceApi = axios.create({ baseURL: voiceBaseUrl });

/** Throws before any transport is reached. Every call below starts here. */
export function guardVoiceCall(): void {
  if (!voiceEnabled) throw new VoiceUnavailableError("disabled");
  if (mocksOn) throw new VoiceUnavailableError("mocks");
}

export async function getVoiceHealth(): Promise<VoiceHealth> {
  guardVoiceCall();
  return (await voiceApi.get<VoiceHealth>("/salud")).data;
}

export async function sendVoiceText(sessionId: string | null, texto: string): Promise<VoiceReply> {
  guardVoiceCall();
  return (await voiceApi.post<VoiceReply>("/mensaje", { sesion_id: sessionId, texto })).data;
}

export async function sendVoiceAudio(
  sessionId: string | null,
  blob: Blob,
  filename: string,
): Promise<VoiceReply> {
  guardVoiceCall();
  const form = new FormData();
  form.append("archivo", blob, filename);
  if (sessionId) form.append("sesion_id", sessionId);
  return (await voiceApi.post<VoiceReply>("/audio", form)).data;
}

export async function restartVoiceSession(sessionId: string): Promise<{ sesion_id: string }> {
  guardVoiceCall();
  return (await voiceApi.post<{ sesion_id: string }>(`/sesion/${sessionId}/reiniciar`)).data;
}

export async function editVoiceField(
  sessionId: string,
  campo: string,
  texto: string,
): Promise<{
  sesion_id: string;
  flujo: VoiceReply["flujo"];
  terminado: boolean;
  resumen: VoiceVisitSummary;
}> {
  guardVoiceCall();
  return (
    await voiceApi.post(`/sesion/${sessionId}/campo`, { campo, texto })
  ).data;
}
