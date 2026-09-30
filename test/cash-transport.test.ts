/** FE3A real-mode transport tests at the axios boundary. */
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
  visit_id: 5,
  patient_id: 9,
  patient_name: "Paciente Canónico",
  service_id: 3,
  service_name: "Evaluación dental",
  location_id: 2,
  location_name: "Jesús María",
  practitioner_id: 1,
  practitioner_name: "Dra. Valeria Ruiz",
  executed_at: "2026-08-14T14:00:00Z",
};
const locationRead = { id: 2, name: "Jesús María", timezone: "America/Lima", is_active: true };
const paymentRead = { id: 1, charge_id: 7, amount: "100.00", method: "yape" as const, paid_at: "2026-08-14T14:15:00Z", reference: "YAPE-001", receiver: null, reconciliation_note: null, verification_status: "unverified" as const, verified_at: null };
const envelopeError = (code: string, message: string, status = 422) => ({ isAxiosError: true, response: { status, data: { error: { code, message, details: {} } } } });

describe("cash real-mode transport (mocked axios)", () => {
  let api: typeof import("../src/api");

  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false");
    vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "http://backend.test");
    api = await import("../src/api");
  });

  afterAll(() => vi.unstubAllEnvs());
  beforeEach(() => { mockGet.mockReset(); mockPost.mockReset(); });

  it("maps enriched charge context and every payment", async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === "/charges") return { data: [chargeRead] };
      if (url === "/locations") return { data: [locationRead] };
      if (url === "/charges/7/payments") return { data: [paymentRead] };
      throw new Error(`unexpected GET ${url}`);
    });
    const rows = await api.loadCharges();
    expect(rows[0]).toMatchObject({ id: "7", amount: 250, outstanding: 150, patientName: "Paciente Canónico", locationName: "Jesús María" });
    expect(rows[0]!.payments[0]).toMatchObject({ id: "1", amount: 100, method: "yape", reference: "YAPE-001", verificationStatus: "unverified" });
    expect(mockGet).toHaveBeenNthCalledWith(1, "/charges", { params: undefined });
  });

  it("posts typed digital metadata and omits absent optional fields", async () => {
    mockPost.mockResolvedValueOnce({ data: paymentRead });
    const payment = await api.registerPayment("7", { amount: 100, method: "yape", reference: "YAPE-001" }, "intent-digital");
    expect(payment.method).toBe("yape");
    expect(mockPost).toHaveBeenCalledWith(
      "/charges/7/payments",
      { amount: 100, method: "yape", reference: "YAPE-001" },
      { headers: { "Idempotency-Key": "intent-digital" } },
    );
  });

  it("omits metadata for non-digital payment and preserves the error envelope", async () => {
    mockPost.mockRejectedValueOnce(envelopeError("INVALID_INPUT", "The payment exceeds the outstanding amount of the charge."));
    const error = await api.registerPayment("7", { amount: 9999, method: "tarjeta" }, "intent-cash").then(() => null).catch((caught) => api.toApiError(caught));
    expect(error).toMatchObject({ code: "INVALID_INPUT", httpStatus: 422, message: "The payment exceeds the outstanding amount of the charge." });
    expect(mockPost).toHaveBeenCalledWith(
      "/charges/7/payments",
      { amount: 9999, method: "tarjeta" },
      { headers: { "Idempotency-Key": "intent-cash" } },
    );
  });

  it("verifies a reproducible payment with no verifier identity", async () => {
    mockPost.mockResolvedValueOnce({ data: { ...paymentRead, verification_status: "verified", verified_at: "2026-08-14T15:00:00Z" } });
    const payment = await api.verifyPaymentRecord("1", { reconciliation_note: "Conciliado" }, "intent-verify");
    expect(payment.verificationStatus).toBe("verified");
    expect("verifiedBy" in payment).toBe(false);
    expect(mockPost).toHaveBeenCalledWith("/payments/1/verify", { reconciliation_note: "Conciliado" }, { headers: { "Idempotency-Key": "intent-verify" } });
  });
});
