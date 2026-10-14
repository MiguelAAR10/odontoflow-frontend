const soles = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Presentation only: DTO cents are never combined or used to infer collection. */
export function formatMoney(amountCents: number): string {
  return `S/ ${soles.format(amountCents / 100)}`;
}
