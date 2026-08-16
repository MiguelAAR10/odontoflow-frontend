/**
 * Cash real-mode transport tests — the adapter/client boundary with a mocked
 * axios transport. No real server: these prove the real-mode path (charges +
 * payments only, Idempotency-Key, envelope errors) against the wire contract.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }));

vi.mock("axios", () => ({
  default: {
    create: () => ({ get: mockGet, post: mockPost }),
    isAxiosError: (error: unknown) => Boolean((error as { isAxiosError?: boolean })?.isAxiosError),
  },
}));

const chargeRead = {
  id: 7,
  service_execution_id: 42,
  amount: "250.00",
  paid: "100.00",
  outstanding: "150.00",
  created_at: "2026-08-14T14:15:00Z",
};
const paymentRead = { id: 1, charge_id: 7, amount: "100.00", method: "Yape", paid_at: "2026-08-14T14:15:00Z" };

const envelopeError = (code: string, message: string, status = 422) => ({
  isAxiosError: true,
  response: { status, data: { error: { code, message, details: {} } } },
});

describe("cash real-mode transport (mocked axios)", () => {
  let api: typeof import("../src/api");

  beforeAll(async () => {
    vi.stubEnv("VITE_USE_MOCKS", "false");
    vi.stubEnv("VITE_BACKEND_URL", "http://backend.test");
    api = await import("../src/api");
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it("maps the charge list AND the payments of every charge", async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === "/charges") return { data: [chargeRead] };
      if (url === "/charges/7/payments") return { data: [paymentRead] };
      throw new Error(`unexpected GET ${url}`);
    });

    const rows = await api.loadCharges();
    expect(mockGet).toHaveBeenNthCalledWith(1, "/charges", { params: undefined });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("7");
    expect(rows[0]!.amount).toBe(250);
    expect(rows[0]!.outstanding).toBe(150);
    expect(rows[0]!.status).toBe("Parcial");
    expect(rows[0]!.payments).toEqual([{ id: "1", amount: 100, method: "Yape", paidAt: "2026-08-14T14:15:00Z" }]);
  });

  it("renders a charge with no payments as Pendiente", async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === "/charges") return { data: [{ ...chargeRead, paid: "0.00", outstanding: "250.00" }] };
      if (url === "/charges/7/payments") return { data: [] };
      throw new Error(`unexpected GET ${url}`);
    });

    const [row] = await api.loadCharges();
    expect(row!.status).toBe("Pendiente");
    expect(row!.payments).toEqual([]);
  });

  it("posts a payment with the Idempotency-Key per payment intent", async () => {
    mockPost.mockResolvedValueOnce({ data: paymentRead });

    const payment = await api.registerPayment("7", { amount: 100, method: "Yape" }, "intent-abc");
    expect(payment).toEqual({ id: "1", amount: 100, method: "Yape", paidAt: "2026-08-14T14:15:00Z" });
    expect(mockPost).toHaveBeenCalledWith(
      "/charges/7/payments",
      { amount: 100, method: "Yape" },
      { headers: { "Idempotency-Key": "intent-abc" } },
    );
  });

  it("surfaces the backend overpayment rejection via the envelope", async () => {
    mockPost.mockRejectedValueOnce(
      envelopeError("PAYMENT_EXCEEDS_OUTSTANDING", "El pago supera el saldo pendiente del cargo."),
    );

    const error = await api
      .registerPayment("7", { amount: 9999, method: "Tarjeta" }, "intent-xyz")
      .then(() => null)
      .catch((caught) => api.toApiError(caught));
    expect(error).not.toBeNull();
    expect(error!.code).toBe("PAYMENT_EXCEEDS_OUTSTANDING");
    expect(error!.httpStatus).toBe(422);
    expect(error!.message).toBe("El pago supera el saldo pendiente del cargo.");
  });

  it("maps a network failure to the NETWORK error state", async () => {
    mockGet.mockRejectedValueOnce({ isAxiosError: true, response: undefined });

    const error = await api
      .loadCharges()
      .then(() => null)
      .catch((caught) => api.toApiError(caught));
    expect(error).not.toBeNull();
    expect(error!.code).toBe("NETWORK");
  });

  it("reloads the charges after a payment (refresh-after-payment)", async () => {
    let outstanding = "150.00";
    mockGet.mockImplementation(async (url: string) => {
      if (url === "/charges") return { data: [{ ...chargeRead, outstanding, paid: "100.00" }] };
      if (url === "/charges/7/payments") return { data: [paymentRead] };
      throw new Error(`unexpected GET ${url}`);
    });
    mockPost.mockImplementation(async () => {
      outstanding = "0.00"; // the server applied the payment
      return { data: { ...paymentRead, id: 2, amount: "150.00", method: "Efectivo" } };
    });

    const before = await api.loadCharges();
    expect(before[0]!.outstanding).toBe(150);

    await api.registerPayment("7", { amount: 150, method: "Efectivo" }, "intent-full");

    const after = await api.loadCharges();
    expect(after[0]!.outstanding).toBe(0);
    expect(after[0]!.status).toBe("Pagado");
  });
});
