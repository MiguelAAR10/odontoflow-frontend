import { USE_MOCKS } from "./env";
import { ApiError, createPaymentVerificationReview } from "./contracts/client";

export async function preparePaymentVerificationReview(paymentId: number, key: string) {
  if (USE_MOCKS) {
    throw new ApiError(422, "DEMO_UNAVAILABLE", "Preparar una revisión de pago requiere el backend real. La demo no crea propuestas ni verifica pagos.");
  }
  return createPaymentVerificationReview(paymentId, key);
}
