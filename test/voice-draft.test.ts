import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadVoiceDraft(env: Record<string, string>) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_ENABLE_VOICE_DRAFTS", env.NEXT_PUBLIC_ENABLE_VOICE_DRAFTS ?? "");
  vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", env.NEXT_PUBLIC_USE_MOCKS ?? "");
  if (env.NEXT_PUBLIC_VOICE_URL !== undefined) vi.stubEnv("NEXT_PUBLIC_VOICE_URL", env.NEXT_PUBLIC_VOICE_URL);
  const mod = await import("../src/voice-draft");
  const adapter = vi.fn(async (config: { baseURL?: string; url?: string; method?: string; data?: unknown }) => ({
    data: {
      sesion_id: "synthetic-session",
      flujo: "inventario",
      terminado: false,
      paso: 1,
      total_pasos: 1,
      pasos: [],
      pregunta: null,
      mensajes: [{ de: "bot", texto: "synthetic output", ts: "2026-09-27T00:00:00Z", adjunto: { tipo: "inventario", filas: [{ codigo: "SYNTH-1", nombre: "Guantes de nitrilo", contado: 999 }] } }],
      transcripcion: { texto: " Guantes de nitrilo: 175 cajas ", segundos_audio: 3.4, segundos_proceso: 0.8, modelo: "small" },
    },
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mod.voiceDraftApi.defaults.adapter = adapter as any;
  return { mod, adapter };
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

describe("mock-only inventory voice draft", () => {
  it("keeps the feature closed by default and sends no request", async () => {
    const { mod, adapter } = await loadVoiceDraft({ NEXT_PUBLIC_USE_MOCKS: "true" });
    expect(mod.voiceDraftEnabled).toBe(false);
    await expect(mod.transcribeInventoryAudioDraft(new Blob(["audio"]), "count.webm"))
      .rejects.toMatchObject({ name: "VoiceDraftUnavailableError", reason: "disabled" });
    expect(adapter).not.toHaveBeenCalled();
  });

  it("rejects API mode even when the separate draft flag is enabled", async () => {
    const { mod, adapter } = await loadVoiceDraft({
      NEXT_PUBLIC_ENABLE_VOICE_DRAFTS: "true",
      NEXT_PUBLIC_USE_MOCKS: "false",
    });
    expect(mod.voiceDraftEnabled).toBe(false);
    await expect(mod.transcribeInventoryAudioDraft(new Blob(["audio"]), "count.webm"))
      .rejects.toMatchObject({ name: "VoiceDraftUnavailableError", reason: "mock_only" });
    expect(adapter).not.toHaveBeenCalled();
  });

  it("calls only POST /audio and discards synthetic catalog rows", async () => {
    const { mod, adapter } = await loadVoiceDraft({
      NEXT_PUBLIC_ENABLE_VOICE_DRAFTS: "true",
      NEXT_PUBLIC_USE_MOCKS: "true",
      NEXT_PUBLIC_VOICE_URL: "http://127.0.0.1:9999",
    });
    const result = await mod.transcribeInventoryAudioDraft(new Blob(["audio"]), "count.webm");
    expect(result).toEqual({ texto: "Guantes de nitrilo: 175 cajas", segundos_audio: 3.4, segundos_proceso: 0.8, modelo: "small" });
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(adapter.mock.calls[0]?.[0]).toMatchObject({ baseURL: "http://127.0.0.1:9999", url: "/audio", method: "post" });
    const form = adapter.mock.calls[0]?.[0].data as FormData;
    expect(form.get("archivo")).toBeInstanceOf(Blob);
    expect(Array.from(form.keys())).toEqual(["archivo"]);
    expect(JSON.stringify(result)).not.toContain("SYNTH-1");
    expect(JSON.stringify(result)).not.toContain("999");
  });

  it("rejects an empty recording before any network call", async () => {
    const { mod, adapter } = await loadVoiceDraft({
      NEXT_PUBLIC_ENABLE_VOICE_DRAFTS: "true",
      NEXT_PUBLIC_USE_MOCKS: "true",
    });
    await expect(mod.transcribeInventoryAudioDraft(new Blob([]), "empty.webm"))
      .rejects.toMatchObject({ name: "VoiceDraftEmptyError" });
    expect(adapter).not.toHaveBeenCalled();
  });

  it("keeps service failures catchable by the draft UI", async () => {
    const { mod } = await loadVoiceDraft({
      NEXT_PUBLIC_ENABLE_VOICE_DRAFTS: "true",
      NEXT_PUBLIC_USE_MOCKS: "true",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mod.voiceDraftApi.defaults.adapter = (async () => { throw Object.assign(new Error("offline"), { code: "ERR_NETWORK" }); }) as any;
    await expect(mod.transcribeInventoryAudioDraft(new Blob(["audio"]), "count.webm"))
      .rejects.toMatchObject({ code: "ERR_NETWORK" });
  });
});
