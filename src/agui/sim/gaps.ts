import { z } from "zod";
import type { Card } from "../card.js";
import type { AgentStore } from "../store.js";

/** Session-only UI metadata, never a backend audit timestamp. Observe the
 * approval transition before any view mounts; pre-approved cards have no receipt.
 * Weak keys follow the immutable decision and cannot leak across sessions.
 */
export function observeApprovalReceipts(store: AgentStore) {
  let previous = store.getSnapshot();
  let receipts = new WeakMap<Card, string>();
  const dispose = store.subscribe(() => {
    const next = store.getSnapshot();
    if (next.threadId !== previous.threadId) receipts = new WeakMap();
    if (next.cards !== previous.cards) {
      for (const [id, entry] of Object.entries(next.cards)) {
        const before = previous.cards[id];
        if (entry.status === "approved" && before?.status === "loading" && before.loadingReason === "approval") {
          receipts.set(entry.card, new Date().toISOString());
        }
      }
    }
    previous = next;
  });
  return { get: (card: Card) => receipts.get(card), dispose };
}

/** Exact Gap.json DTO; availability is supplied, never inferred from blank cells. */
export const GapSchema = z.strictObject({
  start_at: z.iso.datetime({ offset: true }), end_at: z.iso.datetime({ offset: true }),
  duration_minutes: z.number().int().positive(),
  practitioner: z.enum(["ruiz", "salinas", "leon"]), sede: z.string().min(1),
});
export type Gap = z.infer<typeof GapSchema>;
interface OccupiedInterval {
  start_at: string; end_at: string; practitioner: string; sede: string;
}
export interface GapContext { date: string; now: string; practitioner?: string; sede?: string }
const dateInLima = (instant: string) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(instant));

/** Half-open intervals allow an appointment to end exactly when a gap starts.
 * Discard inconsistent declarations instead of shortening the backend's gap.
 */
export function visibleGaps(declared: unknown[], appointments: OccupiedInterval[], context: GapContext): Gap[] {
  return declared.flatMap(raw => {
    const parsed = GapSchema.safeParse(raw);
    if (!parsed.success) return [];
    const gap = parsed.data;
    const start = Date.parse(gap.start_at), end = Date.parse(gap.end_at);
    if (end - start !== gap.duration_minutes * 60_000 || start < Date.parse(context.now)
      || dateInLima(gap.start_at) !== context.date
      || (context.practitioner && gap.practitioner !== context.practitioner)
      || (context.sede && gap.sede !== context.sede)) return [];
    const overlaps = appointments.some(row => row.practitioner === gap.practitioner && row.sede === gap.sede
      && Date.parse(row.start_at) < end && Date.parse(row.end_at) > start);
    return overlaps ? [] : [gap];
  }).sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
}

/** Imported only after the application's explicit mock seam. */
export async function readDemoAgenda() {
  const [{ default: appointments }, { default: declared }, { default: snapshots }] = await Promise.all([
    import("./fixtures/agenda.json", { with: { type: "json" } }),
    import("./fixtures/gaps.json", { with: { type: "json" } }),
    import("./fixtures/state.json", { with: { type: "json" } }),
  ]);
  const cutAt = snapshots[0]!.cut_at;
  // The admin-hueco/cv-huecos fixtures offer exactly this canonical interval.
  const offer = declared.find(gap => gap.practitioner === "ruiz" && gap.duration_minutes === 30);
  return { appointments, declared, cutAt, offer, visibleGaps };
}
export type DemoAgendaData = Awaited<ReturnType<typeof readDemoAgenda>>;
