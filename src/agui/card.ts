import { z } from "zod";

export const AgentIdSchema = z.enum(["airi", "cepillo", "pasta", "hilo", "enjuague", "espejo", "escudo"]);
export type AgentId = z.infer<typeof AgentIdSchema>;
export const ReversibleSchema = z.enum([
  "none", "reversible", "reassign", "until_patient_accepts", "authorized_reversal", "window", "unspecified",
]);
export const MoneySchema = z.strictObject({
  amount_cents: z.number().int().min(0), currency: z.literal("PEN"),
});
export const CardScopeSchema = z.strictObject({
  label: z.string().min(1), value: z.string().min(1),
  amount: MoneySchema.nullable().optional(),
  expires_at: z.iso.datetime({ offset: true }).nullable().optional(),
  reversible: ReversibleSchema.nullable().optional(),
});

/** Mirrors backend contracts/airi-v10/schema/Card.json, including absent vs null.
 * Runtime UI states belong in CardEntry; they must never widen the backend DTO.
 */
export const CardSchema = z.strictObject({
  id: z.string().min(1),
  agent: AgentIdSchema,
  level: z.enum(["auto", "borrador", "aprobar"]),
  state: z.enum(["ready", "pending", "approved", "declined", "delegated", "undone"]),
  title: z.string().min(1),
  body: z.string(),
  why: z.string().nullable().optional(),
  srcs: z.array(z.string().min(1)).optional(),
  scope: z.array(CardScopeSchema).optional(),
  amounts: z.array(MoneySchema.extend({ label: z.string().min(1) })).optional(),
  approve: z.string().min(1).nullable().optional(),
  alt: z.string().min(1).nullable().optional(),
  result: z.string().min(1).nullable().optional(),
  ev: z.string().min(1).nullable().optional(),
  delta: MoneySchema.extend({ sede: z.string().min(1) }).nullable().optional(),
  version: z.number().int().positive(),
  payload_hash: z.string().length(64).regex(/^[0-9a-fA-F]{64}$/).nullable().optional(),
  proposal_id: z.number().int().nullable().optional(),
  edit: z.boolean().optional(),
  undo: z.boolean().optional(),
  reversible: ReversibleSchema.optional(),
  undo_window_seconds: z.number().int().positive().nullable().optional(),
}).superRefine((card, ctx) => {
  if (card.level !== "auto" && card.payload_hash == null) {
    ctx.addIssue({ code: "custom", path: ["payload_hash"], message: "A proposal requires its backend payload hash" });
  }
});

export type Card = z.infer<typeof CardSchema>;
export type CardStatus = "loading" | "pending" | "approved" | "rejected" | "stopped" | "done" | "error";
export interface CardEntry {
  card: Card;
  status: CardStatus;
  runId: string | null;
  error: string | null;
  /** UI operation only; approval I/O is independent of the agent run. */
  loadingReason?: "tool" | "approval" | null;
}

export function canApproveCard(entry: (Pick<CardEntry, "status" | "loadingReason"> & { card: Pick<Card, "level" | "state"> }) | undefined): boolean {
  return !!entry && entry.card.level !== "auto"
    && (entry.card.state === "ready" || entry.card.state === "pending")
    && (entry.status === "pending" || (entry.status === "error" && entry.loadingReason === "approval"));
}
