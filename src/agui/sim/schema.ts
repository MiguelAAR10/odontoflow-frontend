import { z } from "zod";
import { EventSchemas } from "@ag-ui/core/schemas";
import { AgentIdSchema, CardSchema, type Card } from "../card.js";
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

/** Approval request identity from the backend Card DTO. The simulator also
 * attaches a copy beside metadata.card when emitting an interrupt.
 */
export type ApprovalEnvelope = { cardId: string; version: number; payload_hash: string };

/** Canonical JSON: recursively sorted object keys (UTF-16 lexical order), original
 * array order, JSON.stringify primitive/number encoding, no whitespace, UTF-8.
 * JSON's omission of undefined object properties is preserved.
 */
function canonicalCard(card: Card): string {
  return JSON.stringify(card, (_key, value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  });
}

// SHA-256 round constants (FIPS 180-4). Synchronous so replay has no async race;
// only typed arrays/TextEncoder are used, keeping the simulator browser-safe.
const sha256Rounds = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const rotateRight = (word: number, bits: number) => (word >>> bits) | (word << (32 - bits));
function sha256(text: string): string {
  const input = new TextEncoder().encode(text);
  const padded = new Uint8Array(Math.ceil((input.length + 9) / 64) * 64);
  padded.set(input);
  padded[input.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(input.length / 0x20000000));
  view.setUint32(padded.length - 4, (input.length * 8) >>> 0);
  const hash = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const x = words[i - 15]!, y = words[i - 2]!;
      const s0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3);
      const s1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10);
      words[i] = (words[i - 16]! + s0 + words[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = Array.from(hash) as [number, number, number, number, number, number, number, number];
    for (let i = 0; i < 64; i++) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const t1 = (h + sum1 + choice + sha256Rounds[i]! + words[i]!) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + sum0 + majority) >>> 0;
    }
    [a, b, c, d, e, f, g, h].forEach((word, i) => { hash[i] = (hash[i]! + word) >>> 0; });
  }
  return Array.from(hash, (word) => word.toString(16).padStart(8, "0")).join("");
}

/** Preserve backend proposal identity. Only cards without a hash use the
 * deterministic simulator fallback; real approval hashes are opaque.
 */
export function envelopeFor(card: Card): ApprovalEnvelope {
  return { cardId: card.id, version: card.version, payload_hash: card.payload_hash ?? sha256(canonicalCard(card)) };
}
