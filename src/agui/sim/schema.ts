import { z } from "zod";
import { EventSchemas } from "@ag-ui/core/schemas";
import { AgentIdSchema, CardSchema } from "../card.js";
import type { Event } from "../events.js";

/** Keep AIRI extensions: the core parser alone strips agent/plan/index. */
export const ScenarioEventSchema = z.custom<Event>((value) => {
  if (!EventSchemas.safeParse(value).success) return false;
  const event = value as Event;
  if (event.agent !== undefined && !AgentIdSchema.safeParse(event.agent).success) return false;
  if (event.type === "RUN_STARTED") {
    if (event.plan !== undefined && !z.array(z.string().min(1)).safeParse(event.plan).success) return false;
    if (event.what !== undefined && typeof event.what !== "string") return false;
  }
  if (event.type === "STEP_STARTED" && event.index !== undefined
    && !z.number().int().nonnegative().safeParse(event.index).success) return false;
  if (event.metadata?.card !== undefined && !CardSchema.safeParse(event.metadata.card).success) return false;
  if (event.type === "CUSTOM" && event.name === "airi.card") return CardSchema.safeParse(event.value).success;
  if (event.type === "CUSTOM" && event.name === "airi.part") {
    return z.strictObject({ key: z.string().min(1), props: z.unknown().optional() }).safeParse(event.value).success;
  }
  if (event.type === "RUN_FINISHED" && event.outcome?.type === "interrupt") {
    return event.outcome.interrupts.every((interrupt) => CardSchema.safeParse(interrupt.metadata?.card).success);
  }
  return true;
}, "Invalid AG-UI event or AIRI card");

/** delayMs is relative to the previous step, not elapsed time since RUN_STARTED. */
export const ScenarioStepSchema = z.strictObject({
  delayMs: z.number().int().nonnegative(), event: ScenarioEventSchema,
});
export const ScenarioSchema = z.array(ScenarioStepSchema).min(2).superRefine((steps, ctx) => {
  const first = steps[0]?.event;
  const last = steps.at(-1)?.event;
  if (first?.type !== "RUN_STARTED" || last?.type !== "RUN_FINISHED") {
    ctx.addIssue({ code: "custom", message: "Scenario must start RUN_STARTED and end RUN_FINISHED" });
    return;
  }
  if (first.runId !== last.runId || first.threadId !== last.threadId) {
    ctx.addIssue({ code: "custom", message: "Run and thread identifiers must match" });
  }
  if (steps.slice(1, -1).some(({ event }) => event.type === "RUN_STARTED" || event.type === "RUN_FINISHED")) {
    ctx.addIssue({ code: "custom", message: "Scenario must contain exactly one run" });
  }
});
export type ScenarioStep = z.infer<typeof ScenarioStepSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;

const fileName = z.string().regex(/^[a-zA-Z0-9/-]+\.json$/).refine((s) => !s.startsWith("/"));
export const FixtureIndexSchema = z.strictObject({
  contract: z.literal("airi-v10"),
  source: z.string().min(1),
  cutAt: z.iso.datetime({ offset: true }),
  timezone: z.literal("America/Lima"),
  files: z.array(z.strictObject({ file: fileName, source: fileName.nullable(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })),
  scenarios: z.array(z.strictObject({
    id: z.string().min(1), name: z.string().min(1), role: z.enum(["dueno", "admin", "doctor"]),
    phrases: z.array(z.string().min(1)).min(1), file: fileName,
  })).length(8),
});
export type FixtureIndex = z.infer<typeof FixtureIndexSchema>;
