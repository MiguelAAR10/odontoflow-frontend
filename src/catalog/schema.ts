import { z } from "zod";
import { AgentIdSchema, CardSchema, MoneySchema } from "../agui/card";

export const SaySchema = z.strictObject({ text: z.string().min(1), agent: AgentIdSchema.optional() });
export const FallbackSchema = z.strictObject({ message: z.string().min(1).optional() });
export const CellSchema = z.union([z.string(), z.number(), MoneySchema]);
const ItemSchema = z.strictObject({ label: z.string().min(1), value: CellSchema });
const ColumnsSchema = z.array(z.strictObject({ key: z.string().min(1), label: z.string().min(1) })).min(1)
  .refine(columns => new Set(columns.map(column => column.key)).size === columns.length, "Columnas repetidas");
export const PartSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("table"), title: z.string().min(1), columns: ColumnsSchema, rows: z.array(z.record(z.string(), CellSchema)) })
    .refine(table => table.rows.every(row => Object.keys(row).length === table.columns.length && table.columns.every(column => Object.hasOwn(row, column.key))), "Fila incompatible con columnas"),
  z.strictObject({ kind: z.literal("list"), title: z.string().min(1), items: z.array(z.strictObject({ label: z.string().min(1), value: CellSchema.optional() })) }),
  z.strictObject({ kind: z.literal("kpi"), title: z.string().min(1), items: z.array(ItemSchema) }),
]);
export const NoticeSchema = z.strictObject({ text: z.string().min(1), tone: z.enum(["info", "warning", "error"]).optional() });
export const AskSchema = z.strictObject({ text: z.string().min(1), options: z.array(z.strictObject({ id: z.string().min(1), label: z.string().min(1) }))
  .refine(options => new Set(options.map(option => option.id)).size === options.length, "Opciones repetidas").optional() });
export const ActSchema = z.strictObject({ label: z.string().min(1), target: z.string().min(1), action: z.string().min(1).optional() });
export const StatusSchema = z.strictObject({
  text: z.string().min(1), agent: AgentIdSchema.optional(),
  state: z.enum(["idle", "working", "waiting", "done", "stopped", "error"]),
  plan: z.array(z.strictObject({ label: z.string().min(1), status: z.enum(["pending", "working", "done"]) })).optional(),
});
export const CardPropsSchema = z.strictObject({
  card: CardSchema,
  status: z.enum(["loading", "pending", "approved", "rejected", "stopped", "done", "error"]).optional(),
  error: z.string().nullable().optional(),
  loadingReason: z.enum(["tool", "approval"]).nullable().optional(),
  undoRemainingSeconds: z.number().int().min(0).optional(),
});
export const CatalogItemSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("Say"), props: SaySchema }),
  z.strictObject({ type: z.literal("Part"), props: PartSchema }),
  z.strictObject({ type: z.literal("Card"), props: CardPropsSchema }),
  z.strictObject({ type: z.literal("Notice"), props: NoticeSchema }),
  z.strictObject({ type: z.literal("Ask"), props: AskSchema }),
  z.strictObject({ type: z.literal("Act"), props: ActSchema }),
  z.strictObject({ type: z.literal("Status"), props: StatusSchema }),
  z.strictObject({ type: z.literal("Fallback"), props: FallbackSchema }),
]);
export type CatalogItem = z.infer<typeof CatalogItemSchema>;
