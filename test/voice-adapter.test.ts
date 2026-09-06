/**
 * Voice adapter tests — the V1 environment contract.
 *
 * These exist to prove one thing the donor version got wrong: that voice can
 * never issue a real HTTP request unless BOTH switches allow it. The donor
 * fired live requests even in mock mode, which would break the M4 guarantee
 * the pilot E2E depends on.
 *
 * Proof technique: the axios instance's **adapter** is replaced by a spy. The
 * adapter is the last layer before the transport, so if any request were
 * genuinely dispatched the spy would record it — this is stronger than spying
 * on `.get`/`.post`, which a refactor could route around.
 *
 * `src/voice.ts` reads the public env accessor at module load, so every case stubs
 * the env and re-imports the module fresh.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VOICE_URL = "http://127.0.0.1:9999";

/** Load a fresh copy of the module under a specific flag combination. */
async function loadVoice(env: Record<string, string>) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_ENABLE_VOICE", env.NEXT_PUBLIC_ENABLE_VOICE ?? "");
  vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", env.NEXT_PUBLIC_USE_MOCKS ?? "");
  if (env.NEXT_PUBLIC_VOICE_URL !== undefined) vi.stubEnv("NEXT_PUBLIC_VOICE_URL", env.NEXT_PUBLIC_VOICE_URL);
  const mod = await import("../src/voice");
  // Any real dispatch lands here and gets recorded instead of hitting the network.
  const adapter = vi.fn(async (config: { baseURL?: string; url?: string }) => ({
    data: { estado: "ok", insumos_en_catalogo: 12 },
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mod.voiceApi.defaults.adapter = adapter as any;
  return { mod, adapter };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("mock mode never contacts the voice service", () => {
  it("rejects every call with reason 'mocks' and dispatches nothing", async () => {
    const { mod, adapter } = await loadVoice({
      NEXT_PUBLIC_ENABLE_VOICE: "true",
      NEXT_PUBLIC_USE_MOCKS: "true",
      NEXT_PUBLIC_VOICE_URL: VOICE_URL,
    });

    expect(mod.voiceEnabled).toBe(true);
    expect(mod.voiceLive).toBe(false);

    const calls = [
      () => mod.getVoiceHealth(),
      () => mod.sendVoiceText(null, "hola"),
      () => mod.sendVoiceAudio(null, new Blob(["x"]), "d.webm"),
      () => mod.restartVoiceSession("abc"),
      () => mod.editVoiceField("abc", "paciente", "Juan"),
    ];

    for (const call of calls) {
      await expect(call()).rejects.toMatchObject({
        name: "VoiceUnavailableError",
        reason: "mocks",
      });
    }

    // The whole point: not one request reached the transport.
    expect(adapter).not.toHaveBeenCalled();
  });

  it("treats an absent NEXT_PUBLIC_USE_MOCKS as mocks ON (matching api.ts)", async () => {
    const { mod, adapter } = await loadVoice({ NEXT_PUBLIC_ENABLE_VOICE: "true" });
    expect(mod.voiceLive).toBe(false);
    await expect(mod.getVoiceHealth()).rejects.toMatchObject({ reason: "mocks" });
    expect(adapter).not.toHaveBeenCalled();
  });
});

describe("voice disabled never contacts the voice service", () => {
  it("rejects with reason 'disabled' even when mocks are off", async () => {
    const { mod, adapter } = await loadVoice({
      NEXT_PUBLIC_ENABLE_VOICE: "false",
      NEXT_PUBLIC_USE_MOCKS: "false",
      NEXT_PUBLIC_VOICE_URL: VOICE_URL,
    });

    expect(mod.voiceEnabled).toBe(false);
    expect(mod.voiceLive).toBe(false);

    await expect(mod.getVoiceHealth()).rejects.toMatchObject({
      name: "VoiceUnavailableError",
      reason: "disabled",
    });
    await expect(mod.sendVoiceText(null, "hola")).rejects.toMatchObject({ reason: "disabled" });
    expect(adapter).not.toHaveBeenCalled();
  });

  it("stays disabled for any value that is not exactly \"true\"", async () => {
    for (const value of ["", "1", "yes", "TRUE", "on"]) {
      const { mod, adapter } = await loadVoice({
        NEXT_PUBLIC_ENABLE_VOICE: value,
        NEXT_PUBLIC_USE_MOCKS: "false",
      });
      expect(mod.voiceEnabled, `NEXT_PUBLIC_ENABLE_VOICE=${value}`).toBe(false);
      await expect(mod.getVoiceHealth()).rejects.toMatchObject({ reason: "disabled" });
      expect(adapter).not.toHaveBeenCalled();
    }
  });
});

describe("voice enabled in real mode uses NEXT_PUBLIC_VOICE_URL", () => {
  it("opens the gate and points the client at the configured URL", async () => {
    const { mod, adapter } = await loadVoice({
      NEXT_PUBLIC_ENABLE_VOICE: "true",
      NEXT_PUBLIC_USE_MOCKS: "false",
      NEXT_PUBLIC_VOICE_URL: VOICE_URL,
    });

    expect(mod.voiceLive).toBe(true);
    expect(mod.voiceBaseUrl).toBe(VOICE_URL);
    expect(mod.voiceApi.defaults.baseURL).toBe(VOICE_URL);

    await expect(mod.getVoiceHealth()).resolves.toMatchObject({ estado: "ok" });

    // Now a request IS expected, and it must carry the configured base URL.
    expect(adapter).toHaveBeenCalledTimes(1);
    const config = adapter.mock.calls[0]?.[0];
    expect(config?.baseURL).toBe(VOICE_URL);
    expect(config?.url).toBe("/salud");
  });

  it("falls back to the documented default only when no URL is configured", async () => {
    const { mod } = await loadVoice({ NEXT_PUBLIC_ENABLE_VOICE: "true", NEXT_PUBLIC_USE_MOCKS: "false" });
    expect(mod.voiceBaseUrl).toBe(mod.VOICE_DEFAULT_URL);
    expect(mod.VOICE_DEFAULT_URL).toBe("http://127.0.0.1:8000");
  });
});

describe("a disconnected voice service does not break the SPA", () => {
  it("surfaces a catchable rejection rather than throwing at import or on call", async () => {
    const { mod } = await loadVoice({
      NEXT_PUBLIC_ENABLE_VOICE: "true",
      NEXT_PUBLIC_USE_MOCKS: "false",
      NEXT_PUBLIC_VOICE_URL: VOICE_URL,
    });

    // Simulate the service being down at the transport layer.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mod.voiceApi.defaults.adapter = (async () => {
      throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    }) as any;

    // The page's contract: it awaits and catches. Nothing throws synchronously.
    let caught: unknown = null;
    expect(() => {
      void mod.getVoiceHealth().catch((error: unknown) => { caught = error; });
    }).not.toThrow();

    await expect(mod.sendVoiceText(null, "hola")).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(caught).toBeInstanceOf(Error);
    // A real outage must NOT masquerade as a closed gate — the page shows a
    // different message for each, so this distinction has to hold.
    expect(mod.isVoiceUnavailable(caught)).toBe(false);
  });

  it("classifies only gate failures as VoiceUnavailableError", async () => {
    const { mod } = await loadVoice({ NEXT_PUBLIC_ENABLE_VOICE: "true", NEXT_PUBLIC_USE_MOCKS: "true" });
    const gateError = await mod.getVoiceHealth().catch((error: unknown) => error);

    expect(mod.isVoiceUnavailable(gateError)).toBe(true);
    expect(mod.isVoiceUnavailable(new Error("boom"))).toBe(false);
    expect(mod.isVoiceUnavailable(null)).toBe(false);
    expect(mod.isVoiceUnavailable("mocks")).toBe(false);
  });
});
