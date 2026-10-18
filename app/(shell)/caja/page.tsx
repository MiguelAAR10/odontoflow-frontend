import { CashPage } from "../../../src/views/CashPage";

export default async function CashRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const focusedPaymentId = typeof query.payment === "string" && /^[1-9]\d*$/.test(query.payment) ? query.payment : undefined;
  const initialLocationId = focusedPaymentId && typeof query.location === "string" && /^(?:[1-9]\d*)?$/.test(query.location) ? query.location : undefined;
  return <CashPage focusedPaymentId={focusedPaymentId} initialLocationId={initialLocationId} />;
}
