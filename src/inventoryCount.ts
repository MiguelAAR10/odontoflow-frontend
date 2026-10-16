import { USE_MOCKS } from "./env";
import { ApiError, createInventoryCount, getCountContext, type InventoryCountCreate } from "./contracts/client";

const unavailable = () => new ApiError(422, "DEMO_UNAVAILABLE", "El conteo guiado requiere el catálogo y saldo del backend real. La demo no crea movimientos ni propuestas de conteo.");
export async function loadCountContext(productId: number, locationId: number) {
  if (USE_MOCKS) throw unavailable();
  return getCountContext(productId, locationId);
}
export async function proposeInventoryCount(input: InventoryCountCreate, key: string) {
  if (USE_MOCKS) throw unavailable();
  return createInventoryCount(input, key);
}
