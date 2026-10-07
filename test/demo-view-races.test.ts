import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const sessionPath = "../src/session";
const clientPath = "../src/contracts/client";

describe("view request ownership", () => {
  it("keeps the newer Agenda filter result when the older read finishes last", async () => {
    const { createLatestRequest } = await import(sessionPath);
    const requests = createLatestRequest();
    let resolveOld!: (rows: string[]) => void;
    const oldRows = new Promise<string[]>((resolve) => { resolveOld = resolve; });
    const commit = vi.fn();
    const oldCurrent = requests.begin();
    const oldRead = oldRows.then((rows) => { if (oldCurrent()) commit(rows); });
    const newCurrent = requests.begin();
    if (newCurrent()) commit(["sede nueva"]);
    resolveOld(["sede anterior"]);
    await oldRead;
    expect(commit.mock.calls).toEqual([[["sede nueva"]]]);
  });

  it("drops Chat page success, error and finally after a filter change", async () => {
    const { createLatestRequest } = await import(sessionPath);
    const requests = createLatestRequest();
    const success = requests.begin();
    requests.invalidate();
    expect(success()).toBe(false);
    const failedPage = requests.begin();
    const renderError = vi.fn();
    const finishLoading = vi.fn();
    requests.invalidate();
    await Promise.reject(new Error("old page")).catch((error) => { if (failedPage()) renderError(error); }).finally(() => { if (failedPage()) finishLoading(); });
    expect(renderError).not.toHaveBeenCalled();
    expect(finishLoading).not.toHaveBeenCalled();
  });

  it("cannot restore identity or a thread after expiry or persona change", async () => {
    const { createLatestRequest } = await import(sessionPath);
    const client = await import(clientPath);
    const identity = createLatestRequest().begin();
    const messages = createLatestRequest().begin();
    client.advanceSessionVersion();
    expect(identity()).toBe(false);
    expect(messages()).toBe(false);
  });
});

describe("PersonaProvider initial rendering", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  const renderInitial = async (useMocks: boolean) => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", String(useMocks));
    const providerPath = "../src/components/PersonaContext";
    const { PersonaProvider } = await import(providerPath);
    return renderToStaticMarkup(createElement(PersonaProvider, null, createElement("p", null, "design child")));
  };

  it("keeps mock design children visible before identity effects run", async () => {
    const html = await renderInitial(true);
    expect(html).toContain("design child");
    expect(html).not.toContain("Elige quién eres");
  });

  it("keeps real-mode children behind the identity gate initially", async () => {
    const html = await renderInitial(false);
    expect(html).not.toContain("design child");
    expect(html).toContain("Elige quién eres");
  });
});
