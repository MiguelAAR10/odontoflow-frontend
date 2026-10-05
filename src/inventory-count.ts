import type { Product } from "./types.js";

export type InventoryCountParseResult =
  | { ok: true; productId: string; quantity: number }
  | { ok: false; code: "empty" | "not_found" | "invalid" | "ambiguous" };

const normalize = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLocaleLowerCase("es-PE")
  .replace(/\s+/g, " ");

/** Parses only a human-entered exact product name followed by one quantity. */
export function parseInventoryCountCommand(input: string, products: Product[]): InventoryCountParseResult {
  const command = normalize(input);
  if (!command) return { ok: false, code: "empty" };

  const validMatches: Array<{ product: Product; quantity: number }> = [];
  let recognizedProduct = false;

  for (const product of products) {
    const name = normalize(product.name);
    if (!command.startsWith(name)) continue;
    recognizedProduct = true;
    const remainder = command.slice(name.length);
    const match = remainder.match(/^\s*(?::|=|—|,)\s*(\d+(?:[.,]\d+)?)\s*(.*?)\s*$/u)
      ?? remainder.match(/^\s+(\d+(?:[.,]\d+)?)\s*(.*?)\s*$/u);
    if (!match) continue;

    const suppliedUnit = (match[2] ?? "").trim();
    if (suppliedUnit && normalize(suppliedUnit) !== normalize(product.unit)) continue;
    const quantity = Number((match[1] ?? "").replace(",", "."));
    if (!Number.isFinite(quantity) || quantity < 0) continue;
    validMatches.push({ product, quantity });
  }

  if (validMatches.length > 1) return { ok: false, code: "ambiguous" };
  if (validMatches.length === 1) {
    const match = validMatches[0]!;
    return { ok: true, productId: match.product.id, quantity: match.quantity };
  }
  return { ok: false, code: recognizedProduct ? "invalid" : "not_found" };
}
