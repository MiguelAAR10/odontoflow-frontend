import { z } from "zod";

// Exact presentation projection of the contracted StateSnapshot / SedeSummary.
const money = z.strictObject({ amount_cents: z.number().int().nonnegative(), currency: z.literal("PEN") });
export const directionSnapshotSchema = z.strictObject({
  cut_at: z.iso.datetime({ offset: true }),
  sedes: z.array(z.strictObject({
    name: z.string().min(1), occupied_minutes: z.number().int().nonnegative().nullable(),
    capacity_minutes: z.number().int().positive().nullable(), collected: money,
    pending_verification: money, exception: z.string().min(1), complete: z.boolean(),
  })),
  free_next_7_days_minutes: z.number().int().nonnegative(), overdue: money,
  overdue_patients: z.number().int().nonnegative(),
});
export type DirectionSnapshot = z.infer<typeof directionSnapshotSchema>;
export function occupancy(occupied: number | null, capacity: number | null) {
  return occupied === null || capacity === null ? null : Math.round(occupied / capacity * 100);
}
export function summarizeDirection(snapshot: DirectionSnapshot) {
  const published = snapshot.sedes.filter(sede => sede.occupied_minutes !== null && sede.capacity_minutes !== null);
  const occupied = published.reduce((total, sede) => total + sede.occupied_minutes!, 0);
  const capacity = published.reduce((total, sede) => total + sede.capacity_minutes!, 0);
  return {
    collected: snapshot.sedes.reduce((total, sede) => total + sede.collected.amount_cents, 0),
    pending: snapshot.sedes.reduce((total, sede) => total + sede.pending_verification.amount_cents, 0),
    partial: snapshot.sedes.some(sede => !sede.complete),
    occupancy: capacity > 0 ? occupancy(occupied, capacity) : null,
    published: published.length,
  };
}
