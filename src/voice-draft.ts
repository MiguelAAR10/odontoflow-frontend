/**
 * Narrow audio-to-text path for a reviewable inventory draft.
 *
 * This is intentionally separate from the existing voice workflow. It only
 * calls POST /audio, only when the explicit draft flag is enabled in mock
 * mode, and only returns `transcripcion`. Bot messages and synthetic catalog
 * attachments from odontoflow-voice are discarded here. No ERP or repository
 * adapter is imported into this module.
 */
import axios from "axios";
import { USE_MOCKS, VOICE_DRAFTS_ENABLED, VOICE_URL } from "./env";
import type { VoiceReply, VoiceTranscription } from "./types";

export const voiceDraftApi = axios.create({ baseURL: VOICE_URL, timeout: 60_000 });
export const voiceDraftEnabled = VOICE_DRAFTS_ENABLED && USE_MOCKS;

export class VoiceDraftUnavailableError extends Error {
  readonly reason: "disabled" | "mock_only";

  constructor(reason: "disabled" | "mock_only") {
    super(reason === "disabled"
      ? "La transcripción por voz está desactivada."
      : "La transcripción de borrador solo está disponible en modo demo.");
    this.name = "VoiceDraftUnavailableError";
    this.reason = reason;
  }
}

export class VoiceDraftEmptyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceDraftEmptyError";
  }
}

function guardVoiceDraft(): void {
  if (!VOICE_DRAFTS_ENABLED) throw new VoiceDraftUnavailableError("disabled");
  if (!USE_MOCKS) throw new VoiceDraftUnavailableError("mock_only");
}

/** Send one recording to Whisper and expose only its editable transcript. */
export async function transcribeInventoryAudioDraft(
  blob: Blob,
  filename: string,
  signal?: AbortSignal,
): Promise<VoiceTranscription> {
  guardVoiceDraft();
  if (blob.size === 0) throw new VoiceDraftEmptyError("La grabación está vacía. Intenta grabar de nuevo o escribe el conteo.");

  const form = new FormData();
  form.append("archivo", blob, filename);
  const { data } = await voiceDraftApi.post<VoiceReply>("/audio", form, { signal });
  const transcription = data.transcripcion;
  const texto = transcription?.texto.trim() ?? "";
  if (!transcription || !texto) throw new VoiceDraftEmptyError("No se obtuvo texto del audio. Puedes escribir el conteo en el mismo campo.");

  return { ...transcription, texto };
}
