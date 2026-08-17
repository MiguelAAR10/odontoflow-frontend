/**
 * Inventory adapter unit tests — view-model mapping + mock-mode stock flows.
 * No network: the mock seam (VITE_USE_MOCKS default true under vitest)
 * exercises the same adapter functions the page calls, and the toUi*
 * mappers are mode-independent (they always consume the OpenAPI shapes).
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  createProduct,
  loadInventoryData,
  loadMovements,
  loadProductBalance,
  registerAdjustment,
  registerEntry,
  registerTransfer,
  sumAvailable,
  toUiBalance,
  toUiLocation,
  toUiMovement,
  toUiProduct,
  toUiTransfer,
} from "../src/api";
import { ApiError } from "../src/contracts/client";
import {
  mockBalances,
  mockLocations,
  mockMovements,
  mockProducts,
} from "../src/mockData";

const seedBalances = structuredClone(mockBalances);
const seedMovements = structuredClone(mockMovements);
const seedProducts = structuredClone(mockProducts);

beforeEach(() => {
  mockBalances.length = 0;
  mockBalances.push(...structuredClone(seedBalances));
  mockMovements.length = 0;
  mockMovements.push(...structuredClone(seedMovements));
  mockProducts.length = 0;
  mockProducts.push(...structuredClone(seedProducts));
});

describe("toUiProduct", () => {
  it("maps ProductRead into the UI product view model (no invented fields)", () => {
    const view = toUiProduct({ id: 3, name: "Resina compuesta A2", unit: "unidades", kind: "consumible", is_active: true });
    expect(view).toEqual({ id: "3", name: "Resina compuesta A2", unit: "unidades", kind: "consumible", status: "Activo" });
  });

  it("derives the status from the real is_active flag", () => {
    expect(toUiProduct({ id: 1, name: "A", unit: "u", kind: "reventa", is_active: true }).status).toBe("Activo");
    expect(toUiProduct({ id: 2, name: "B", unit: "u", kind: "consumible", is_active: false }).status).toBe("Inactivo");
  });
});

describe("toUiLocation", () => {
  it("maps LocationRead into the UI location view model", () => {
    const view = toUiLocation({ id: 2, name: "Lince", timezone: "America/Lima", is_active: true });
    expect(view).toEqual({ id: "2", name: "Lince", timezone: "America/Lima", isActive: true });
  });
});

describe("toUiBalance", () => {
  it("parses the decimal string available into a number", () => {
    const view = toUiBalance({ product_id: 1, location_id: 2, available: "180.50" });
    expect(view).toEqual({ productId: "1", locationId: "2", available: 180.5 });
  });
});

describe("toUiMovement", () => {
  it("maps a plain ENTRADA row", () => {
    const view = toUiMovement({
      id: 7,
      product_id: 1,
      location_id: 2,
      type: "ENTRADA",
      quantity: "240",
      unit_price: "25.00",
      reason: null,
      id_consumo_origen: null,
      transfer_id: null,
      moved_at: "2026-08-14T09:00:00Z",
    });
    expect(view).toEqual({
      id: "7",
      productId: "1",
      locationId: "2",
      type: "ENTRADA",
      quantity: 240,
      unitPrice: 25,
      reason: null,
      transferId: null,
      movedAt: "2026-08-14T09:00:00Z",
    });
  });

  it("maps a signed adjustment with a reason", () => {
    const view = toUiMovement({
      id: 8,
      product_id: 2,
      location_id: 1,
      type: "ADJUSTMENT",
      quantity: "-3",
      unit_price: null,
      reason: "Rotura de envase",
      id_consumo_origen: null,
      transfer_id: null,
      moved_at: "2026-08-14T10:00:00Z",
    });
    expect(view.quantity).toBe(-3);
    expect(view.reason).toBe("Rotura de envase");
    expect(view.unitPrice).toBeNull();
  });

  it("carries the shared transfer_id on transfer rows", () => {
    const view = toUiMovement({
      id: 9,
      product_id: 1,
      location_id: 3,
      type: "TRANSFER_IN",
      quantity: "60",
      unit_price: null,
      reason: "Reabastecimiento",
      id_consumo_origen: null,
      transfer_id: "t-9",
      moved_at: "2026-08-14T11:00:00Z",
    });
    expect(view.type).toBe("TRANSFER_IN");
    expect(view.transferId).toBe("t-9");
    expect(view.quantity).toBe(60);
  });
});

describe("toUiTransfer", () => {
  it("maps TransferRead into the UI transfer view model", () => {
    const view = toUiTransfer({
      transfer_id: "abc-123",
      product_id: 1,
      origin_location_id: 1,
      destination_location_id: 2,
      quantity: "60.00",
      reason: "Reabastecimiento",
      out_movement_id: 10,
      in_movement_id: 11,
    });
    expect(view).toEqual({
      transferId: "abc-123",
      productId: "1",
      originLocationId: "1",
      destinationLocationId: "2",
      quantity: 60,
      reason: "Reabastecimiento",
      outMovementId: 10,
      inMovementId: 11,
    });
  });

  it("tolerates a null reason", () => {
    const view = toUiTransfer({
      transfer_id: "abc-124",
      product_id: 2,
      origin_location_id: 2,
      destination_location_id: 3,
      quantity: "5",
      reason: null,
      out_movement_id: 12,
      in_movement_id: 13,
    });
    expect(view.reason).toBeNull();
    expect(view.quantity).toBe(5);
  });
});

describe("sumAvailable", () => {
  it("derives 'unidades en stock' as Σ available over the real balances", () => {
    expect(sumAvailable([
      { productId: "1", locationId: "1", available: 180 },
      { productId: "2", locationId: "1", available: 12 },
    ])).toBe(192);
  });

  it("tolerates an empty list", () => {
    expect(sumAvailable([])).toBe(0);
  });
});

describe("mock-mode inventory reads", () => {
  it("loads products and locations as copies (no invented fields)", async () => {
    const { products, locations } = await loadInventoryData();
    expect(products).toHaveLength(seedProducts.length);
    expect(locations).toHaveLength(seedLocationsLength());
    const product = products[0]!;
    expect(product).toHaveProperty("name");
    expect(product).toHaveProperty("unit");
    expect(product).toHaveProperty("kind");
    expect(product).toHaveProperty("status");
    expect(product).not.toHaveProperty("category");
    expect(product).not.toHaveProperty("branch");
    expect(product).not.toHaveProperty("stock");
    expect(product).not.toHaveProperty("minimum");
    products[0]!.name = "mutated";
    expect(mockProducts[0]!.name).not.toBe("mutated");
  });

  it("reads the balance of a product at a location", async () => {
    const balance = await loadProductBalance("1", "1");
    expect(balance).toEqual({ productId: "1", locationId: "1", available: 180 });
  });

  it("returns a zero balance when the product has no movements at the location", async () => {
    const balance = await loadProductBalance("6", "3");
    expect(balance).toEqual({ productId: "6", locationId: "3", available: 0 });
  });

  it("loads the kardex of a product at a location, newest first", async () => {
    const rows = await loadMovements("1", "1");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.type).toBe("TRANSFER_OUT");
    expect(rows[1]!.type).toBe("ENTRADA");
    expect(rows[1]!.quantity).toBe(240);
  });
});

describe("createProduct (mock mode)", () => {
  it("creates an active product with the real kind vocabulary", async () => {
    const created = await createProduct({ name: "Hilo de sutura", unit: "unidades", kind: "consumible" }, "key-1");
    expect(created.status).toBe("Activo");
    expect(created.kind).toBe("consumible");
    expect(created.id).toBeTruthy();
    expect(mockProducts[0]!.name).toBe("Hilo de sutura");
    expect(mockProducts[0]!.kind).toBe("consumible");
  });

  it("rejects an unknown kind before it reaches the store", async () => {
    const error = await createProduct({ name: "X", unit: "u", kind: "categoría" as "consumible" }, "key-2")
      .then(() => null)
      .catch((caught) => caught as ApiError);
    expect(error).toBeInstanceOf(ApiError);
    expect(error!.code).toBe("INVALID_INPUT");
  });
});

describe("registerEntry (mock mode)", () => {
  it("adds stock at the location and records an ENTRADA movement", async () => {
    const movement = await registerEntry("2", { location_id: 1, quantity: 10 }, "key-1");
    expect(movement.type).toBe("ENTRADA");
    expect(movement.quantity).toBe(10);
    expect(movement.locationId).toBe("1");
    const balance = mockBalances.find((b) => b.productId === "2" && b.locationId === "1")!;
    expect(balance.available).toBe(22);
  });

  it("keeps the optional unit_price", async () => {
    const movement = await registerEntry("4", { location_id: 3, quantity: 5, unit_price: 12.5 }, "key-2");
    expect(movement.unitPrice).toBe(12.5);
  });

  it("rejects non-positive quantities with the backend envelope", async () => {
    for (const quantity of [0, -3, Number.NaN]) {
      const error = await registerEntry("1", { location_id: 1, quantity }, "key-3")
        .then(() => null)
        .catch((caught) => caught as ApiError);
      expect(error!.code).toBe("INVALID_INPUT");
    }
  });

  it("rejects unknown products / locations", async () => {
    const error = await registerEntry("999", { location_id: 1, quantity: 1 }, "key-4")
      .then(() => null)
      .catch((caught) => caught as ApiError);
    expect(error!.code).toBe("PRODUCT_NOT_FOUND");
    expect(error!.httpStatus).toBe(404);

    const error2 = await registerEntry("1", { location_id: 999, quantity: 1 }, "key-5")
      .then(() => null)
      .catch((caught) => caught as ApiError);
    expect(error2!.code).toBe("LOCATION_NOT_FOUND");
  });
});

describe("registerAdjustment (mock mode)", () => {
  it("applies a signed adjustment and records it with the reason", async () => {
    const movement = await registerAdjustment("2", { location_id: 1, quantity: -2, reason: "Rotura de envase" }, "key-1");
    expect(movement.type).toBe("ADJUSTMENT");
    expect(movement.quantity).toBe(-2);
    expect(movement.reason).toBe("Rotura de envase");
    const balance = mockBalances.find((b) => b.productId === "2" && b.locationId === "1")!;
    expect(balance.available).toBe(10);
  });

  it("rejects a zero adjustment", async () => {
    const error = await registerAdjustment("1", { location_id: 1, quantity: 0, reason: "Nada" }, "key-2")
      .then(() => null)
      .catch((caught) => caught as ApiError);
    expect(error!.code).toBe("INVALID_INPUT");
  });

  it("rejects a negative adjustment that would overdraw the location", async () => {
    const error = await registerAdjustment("5", { location_id: 2, quantity: -999, reason: "Inventario" }, "key-3")
      .then(() => null)
      .catch((caught) => caught as ApiError);
    expect(error!.code).toBe("INVALID_INPUT");
    expect(error!.message).toContain("Stock insuficiente");
  });

  it("rejects an adjustment without a reason", async () => {
    const error = await registerAdjustment("1", { location_id: 1, quantity: 5, reason: "" }, "key-4")
      .then(() => null)
      .catch((caught) => caught as ApiError);
    expect(error!.code).toBe("INVALID_INPUT");
  });
});

describe("registerTransfer (mock mode)", () => {
  it("moves stock between locations and records the OUT/IN pair", async () => {
    const transfer = await registerTransfer(
      "1",
      { origin_location_id: 1, destination_location_id: 2, quantity: 30, reason: "Reabastecimiento" },
      "key-1",
    );
    expect(transfer.transferId).toBeTruthy();
    expect(transfer.originLocationId).toBe("1");
    expect(transfer.destinationLocationId).toBe("2");
    expect(transfer.quantity).toBe(30);
    expect(transfer.outMovementId).toBeGreaterThan(0);
    expect(transfer.inMovementId).toBeGreaterThan(0);

    const origin = mockBalances.find((b) => b.productId === "1" && b.locationId === "1")!;
    const destination = mockBalances.find((b) => b.productId === "1" && b.locationId === "2")!;
    expect(origin.available).toBe(150);
    expect(destination.available).toBe(90);

    const out = mockMovements.find((m) => m.id === String(transfer.outMovementId))!;
    const input = mockMovements.find((m) => m.id === String(transfer.inMovementId))!;
    expect(out.type).toBe("TRANSFER_OUT");
    expect(input.type).toBe("TRANSFER_IN");
    expect(out.transferId).toBe(transfer.transferId);
    expect(input.transferId).toBe(transfer.transferId);
    expect(out.quantity).toBe(30);
    expect(input.quantity).toBe(30);
  });

  it("rejects transfers to the same location", async () => {
    const error = await registerTransfer("1", { origin_location_id: 1, destination_location_id: 1, quantity: 5 }, "key-2")
      .then(() => null)
      .catch((caught) => caught as ApiError);
    expect(error!.code).toBe("INVALID_INPUT");
  });

  it("rejects a transfer that would overdraw the origin", async () => {
    const error = await registerTransfer("5", { origin_location_id: 2, destination_location_id: 1, quantity: 999 }, "key-3")
      .then(() => null)
      .catch((caught) => caught as ApiError);
    expect(error!.code).toBe("INVALID_INPUT");
    expect(error!.message).toContain("Stock insuficiente");
  });

  it("reflects the transfer on a later balance read", async () => {
    await registerTransfer("1", { origin_location_id: 1, destination_location_id: 2, quantity: 30 }, "key-4");
    const origin = await loadProductBalance("1", "1");
    const destination = await loadProductBalance("1", "2");
    expect(origin.available).toBe(150);
    expect(destination.available).toBe(90);
  });
});

function seedLocationsLength(): number {
  return mockLocations.length;
}