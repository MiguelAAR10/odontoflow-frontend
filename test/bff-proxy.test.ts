/** BFF proxy: pure function tested with a mocked fetch at the upstream boundary. */
import { describe, expect, it, vi } from "vitest";
import { proxyToBackend } from "../src/bff/proxy";

const BACKEND = "http://backend.test";
const TOKEN = "demo-token-value";

function upstream(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    }),
  );
}

function sentHeaders(fetchMock: ReturnType<typeof upstream>): Headers {
  return new Headers(fetchMock.mock.calls[0]![1]!.headers);
}

describe("proxyToBackend", () => {
  it("injects the server bearer and drops browser authorization/cookie", async () => {
    const fetchMock = upstream(200, []);
    const request = new Request("http://app.test/api/backend/patients", {
      headers: { authorization: "Bearer browser-supplied", cookie: "session=abc", accept: "application/json", "x-forwarded-for": "1.2.3.4" },
    });
    await proxyToBackend(request, ["patients"], { backendUrl: BACKEND, token: TOKEN, fetch: fetchMock });

    const headers = sentHeaders(fetchMock);
    expect(headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("x-forwarded-for")).toBeNull();
    expect(headers.get("accept")).toBe("application/json");
    expect(fetchMock.mock.calls[0]![1]!.cache).toBe("no-store");
  });

  it("forwards method, path, query string, idempotency key and raw body", async () => {
    const fetchMock = upstream(201, { id: 1 });
    const body = JSON.stringify({ amount: 100, method: "yape" });
    const request = new Request("http://app.test/api/backend/charges/7/payments?x=1&y=a%20b", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "intent-1", "x-request-id": "req-9" },
      body,
    });
    const response = await proxyToBackend(request, ["charges", "7", "payments"], { backendUrl: `${BACKEND}/`, token: TOKEN, fetch: fetchMock });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BACKEND}/charges/7/payments?x=1&y=a%20b`);
    expect(init!.method).toBe("POST");
    expect(new TextDecoder().decode(init!.body as ArrayBuffer)).toBe(body);
    const headers = sentHeaders(fetchMock);
    expect(headers.get("idempotency-key")).toBe("intent-1");
    expect(headers.get("x-request-id")).toBe("req-9");
    expect(headers.get("content-type")).toBe("application/json");
    expect(response.status).toBe(201);
  });

  it.each([409, 422])("passes the backend %i status and envelope through intact", async (status) => {
    const envelope = { error: { code: "INVALID_INPUT", message: "The payment exceeds the outstanding amount of the charge.", details: { field: "amount" } } };
    const fetchMock = upstream(status, envelope, { "x-request-id": "req-1", "retry-after": "3", "set-cookie": "leak=1" });
    const response = await proxyToBackend(new Request("http://app.test/api/backend/charges/7/payments", { method: "POST", body: "{}" }), ["charges", "7", "payments"], { backendUrl: BACKEND, token: TOKEN, fetch: fetchMock });

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(envelope);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("x-request-id")).toBe("req-1");
    expect(response.headers.get("retry-after")).toBe("3");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each([[[".."]], [["patients", ".."]], [["patients", ""]], [["a/..", "b"]], [[]]])("rejects unsafe path %j with 400 BFF_BAD_PATH", async (segments) => {
    const fetchMock = upstream(200, {});
    const response = await proxyToBackend(new Request("http://app.test/api/backend/x"), segments, { backendUrl: BACKEND, token: TOKEN, fetch: fetchMock });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "BFF_BAD_PATH", message: "La ruta solicitada no es válida.", details: {} } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forbids /internal/* with 403 BFF_FORBIDDEN_PATH", async () => {
    const fetchMock = upstream(200, {});
    const response = await proxyToBackend(new Request("http://app.test/api/backend/internal/x"), ["internal", "x"], { backendUrl: BACKEND, token: TOKEN, fetch: fetchMock });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("BFF_FORBIDDEN_PATH");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps an unreachable backend to 502 BACKEND_UNREACHABLE", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const response = await proxyToBackend(new Request("http://app.test/api/backend/patients"), ["patients"], { backendUrl: BACKEND, token: TOKEN, fetch: fetchMock });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: { code: "BACKEND_UNREACHABLE", message: "No se pudo contactar al servidor.", details: {} } });
  });

  it("sends no Authorization when no token is configured", async () => {
    const fetchMock = upstream(200, []);
    await proxyToBackend(new Request("http://app.test/api/backend/products", { headers: { authorization: "Bearer browser" } }), ["products"], { backendUrl: BACKEND, token: undefined, fetch: fetchMock });
    expect(sentHeaders(fetchMock).get("authorization")).toBeNull();
  });

  it("forwards Idempotent-Replay so the UI can tell a replay from a new execution", async () => {
    const fetchMock = upstream(200, { id: 3 }, { "idempotent-replay": "true" });
    const response = await proxyToBackend(new Request("http://app.test/api/backend/agent/proposals/3/approve", { method: "POST", body: "{}" }), ["agent", "proposals", "3", "approve"], { backendUrl: BACKEND, token: TOKEN, fetch: fetchMock });
    expect(response.headers.get("idempotent-replay")).toBe("true");
  });

  it("returns an empty body for 204 responses", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    const response = await proxyToBackend(new Request("http://app.test/api/backend/x/1", { method: "DELETE" }), ["x", "1"], { backendUrl: BACKEND, token: TOKEN, fetch: fetchMock });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });
});
