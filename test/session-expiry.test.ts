import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError, AxiosHeaders, type AxiosAdapter } from "axios";

// Runtime imports keep these frontend tests out of the legacy NodeNext
// compilation graph without changing its config or the application imports.
const clientPath = "../src/contracts/client";
const sessionPath = "../src/session";
let client: any;
let session: any;
let unsubscribe = () => {};

const rejected: (status: number) => AxiosAdapter = (status) => async (config) => {
  throw new AxiosError("Refused", "ERR_BAD_REQUEST", config, undefined, {
    status, statusText: "Refused", headers: new AxiosHeaders(), config,
    data: { error: { code: "REFUSED", message: "Refused", details: {} } },
  });
};

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false");
  client = await import(clientPath);
  session = await import(sessionPath);
});
afterEach(() => { unsubscribe(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("session expiry at the transport boundary", () => {
  it("invalidates the shared identity for a 401 on an ordinary read", async () => {
    const expired = vi.fn();
    unsubscribe = client.onSessionExpired(expired);
    client.http.defaults.adapter = rejected(401);
    await expect(client.listPatients()).rejects.toMatchObject({ response: { status: 401 } });
    expect(expired).toHaveBeenCalledOnce();
  });

  it("invalidates a failed mutation once and never replays it", async () => {
    const expired = vi.fn();
    unsubscribe = client.onSessionExpired(expired);
    const adapter = vi.fn(rejected(401));
    client.http.defaults.adapter = adapter;
    await expect(client.createPatient({ full_name: "Demo" }, "intent-1")).rejects.toMatchObject({ response: { status: 401 } });
    expect(expired).toHaveBeenCalledOnce();
    expect(adapter).toHaveBeenCalledOnce();
  });

  it("keeps the session when a permission check returns 403", async () => {
    const expired = vi.fn();
    unsubscribe = client.onSessionExpired(expired);
    client.http.defaults.adapter = rejected(403);
    await expect(client.listPatients()).rejects.toMatchObject({ response: { status: 403 } });
    expect(expired).not.toHaveBeenCalled();
  });

  it("keeps the session when /admin refuses a profile without *.manage (403 PERMISSION_DENIED)", async () => {
    const expired = vi.fn();
    unsubscribe = client.onSessionExpired(expired);
    const version = client.getSessionVersion();
    client.http.defaults.adapter = rejected(403);
    await expect(client.setAdminActive("practitioners", 5, false, "intent-admin", "Fin de contrato")).rejects.toMatchObject({ response: { status: 403 } });
    await expect(client.listPractitionerRoster()).rejects.toMatchObject({ response: { status: 403 } });
    expect(expired).not.toHaveBeenCalled();
    expect(client.getSessionVersion()).toBe(version);
  });

  it("ignores an old persona's late 401 after switching identity", async () => {
    const expired = vi.fn();
    unsubscribe = client.onSessionExpired(expired);
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    client.http.defaults.adapter = async (config: any) => { entered(); await waiting; return rejected(401)(config); };
    const request = client.listPatients().catch((error: unknown) => error);
    await started;
    client.advanceSessionVersion();
    release();
    await request;
    expect(expired).not.toHaveBeenCalled();
  });

  it("also invalidates on a session fetch 401 and preserves its envelope", async () => {
    const expired = vi.fn();
    unsubscribe = client.onSessionExpired(expired);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { code: "ACCESS_CODE_INVALID", message: "Código inválido" } }, { status: 401 })));
    await expect(session.choosePersona("secretaria", "wrong")).rejects.toMatchObject({ code: "ACCESS_CODE_INVALID", httpStatus: 401 });
    expect(expired).toHaveBeenCalledOnce();
  });
});
