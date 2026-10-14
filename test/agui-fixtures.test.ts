import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CardSchema, type Card } from "../src/agui/card.js";
import { createInitialState, reducer } from "../src/agui/reducer.js";
import { envelopeFor, ScenarioSchema, FixtureIndexSchema } from "../src/agui/sim/schema.js";

const root = resolve("src/agui/sim/fixtures");
const read = (file: string): unknown => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const expectedIds = ["dueno-compara", "admin-confirma", "admin-hueco", "doctor-brief", "doctor-evo", "cv-huecos", "cv-cobranza", "cv-sedes"];

// Inline local $defs so validation uses the copied backend schemas themselves.
function inlineRefs(value: unknown, definitions: Record<string, unknown>): unknown {
  if (Array.isArray(value)) return value.map((item) => inlineRefs(item, definitions));
  if (!value || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  if (typeof object.$ref === "string") {
    const key = object.$ref.replace("#/$defs/", "");
    if (!(key in definitions)) throw new Error(`Missing schema reference: ${key}`);
    return inlineRefs(definitions[key], definitions);
  }
  return Object.fromEntries(Object.entries(object).filter(([key]) => key !== "$defs")
    .map(([key, item]) => [key, inlineRefs(item, definitions)]));
}
const contractPairs = {
  "agenda.json": "AgendaItem", "agents.json": "Agent", "cards.json": "Card",
  "events.json": "AgUiEvent", "gaps.json": "Gap", "roles.json": "RoleHome",
  "scenarios.json": "Scenario", "sedes.json": "SedeSummary", "state.json": "StateSnapshot", "trail.json": "TrailEntry",
};

describe("AIRI fixtures", () => {
  it("indexes exactly eight scenarios and verifies every file against its sha256", () => {
    const index = FixtureIndexSchema.parse(read("index.json"));
    expect(index.scenarios.map((s) => s.id)).toEqual(expectedIds);
    for (const file of index.files) expect(hash(resolve(root, file.file)), file.file).toBe(file.sha256);
    const allFiles = [...readdirSync(root).filter((f) => f.endsWith(".json") && f !== "index.json"),
      ...readdirSync(resolve(root, "schema")).map((f) => `schema/${f}`)];
    expect(index.files.map((f) => f.file).sort()).toEqual(allFiles.sort());
  });

  it("keeps copied JSON byte-identical to the available backend contract (no skips)", () => {
    const index = FixtureIndexSchema.parse(read("index.json"));
    const candidates = [process.env.AIRI_CONTRACT_DIR, ...[resolve(".."), resolve("../..")].flatMap((product) => [
      resolve(product, "odontoflow-backend/contracts/airi-v10"),
      resolve(product, ".worktrees/backend-airi-contract/contracts/airi-v10"),
    ])];
    const backend = candidates.find((p): p is string => !!p && existsSync(resolve(p, "cards.json")));
    expect(backend, "Backend contract is required; use AIRI_CONTRACT_DIR outside the product workspace").toBeTruthy();
    const backendFiles = [...readdirSync(backend!).filter((f) => f.endsWith(".json")),
      ...readdirSync(resolve(backend!, "schema")).filter((f) => f.endsWith(".json")).map((f) => `schema/${f}`)];
    expect(index.files.filter((f) => f.source !== null).map((f) => f.source).sort()).toEqual(backendFiles.sort());
    for (const file of index.files.filter((f) => f.source !== null)) {
      expect(hash(resolve(backend!, file.source!)), file.file).toBe(file.sha256);
      expect(readFileSync(resolve(root, file.file)).equals(readFileSync(resolve(backend!, file.source!)))).toBe(true);
    }
  });

  it("validates every copied dataset with its backend JSON Schema", () => {
    for (const [file, name] of Object.entries(contractPairs)) {
      const schema = read(`schema/${name}.json`) as Record<string, unknown>;
      const validator = z.fromJSONSchema(inlineRefs(schema, schema.$defs as Record<string, unknown> ?? {}) as z.core.JSONSchema.JSONSchema);
      const rows = read(file) as unknown[];
      for (const row of rows) expect(validator.safeParse(row).success, `${file}: ${JSON.stringify(row)}`).toBe(true);
    }
  });

  it("derives five proposals and clinic data solely from copied datasets", () => {
    const cards = z.array(CardSchema).parse(read("cards.json"));
    const proposals = z.array(CardSchema).parse(read("proposals.json"));
    expect(proposals).toEqual(cards.filter((c) => c.id.startsWith("p-")));
    expect(proposals).toHaveLength(5);
    const agenda = read("agenda.json") as { practitioner: string; practitioner_name: string }[];
    const doctors = [...new Map(agenda.map((a) => [a.practitioner, { id: a.practitioner, name: a.practitioner_name }])).values()];
    expect(read("clinic.json")).toEqual({ timezone: "America/Lima", currency: "PEN", sedes: read("sedes.json"),
      doctors, appointments: agenda, cash: read("state.json"), trail: read("trail.json") });
  });

  it.each(expectedIds)("validates and replays %s, closing the run without approving", (id) => {
    const steps = ScenarioSchema.parse(read(`${id}.json`));
    expect(steps[0]?.event.type).toBe("RUN_STARTED");
    expect(steps.at(-1)?.event.type).toBe("RUN_FINISHED");
    const state = steps.reduce((state, step) => reducer(state, step.event), createInitialState());
    const end = steps.at(-1)!.event;
    expect(state.run.status).toBe(end.type === "RUN_FINISHED" && end.outcome?.type === "interrupt" ? "waiting" : "done");
    expect(Object.values(state.cards).some((entry) => entry.status === "approved")).toBe(false);
    expect(state.thread.flatMap((turn) => turn.parts).some((part) => part.type === "text" && part.streaming)).toBe(false);
    expect(state.thread.flatMap((turn) => turn.parts).some((part) => part.type === "tool" && part.status === "working")).toBe(false);
  });


  it("preserves each backend scenario's plan, cards, messages and outcome", () => {
    const scenarios = read("scenarios.json") as { id: string; agent: string; plan: string[]; card_ids: string[]; messages: string[]; outcome: string }[];
    const cards = z.array(CardSchema).parse(read("cards.json"));
    for (const scenario of scenarios) {
      const events = ScenarioSchema.parse(read(`${scenario.id}.json`)).map((s) => s.event);
      const start = events[0]!;
      expect(start.type === "RUN_STARTED" && start.plan).toEqual(scenario.plan);
      expect(start.agent).toBe(scenario.agent);
      expect(events.filter((e) => e.type === "TOOL_CALL_RESULT" && e.metadata?.card)
        .map((e) => e.metadata!.card)).toEqual(scenario.card_ids.map((id) => cards.find((c) => c.id === id)));
      expect(events.flatMap((e) => e.type === "TEXT_MESSAGE_CONTENT" ? [e.delta] : [])).toEqual(scenario.messages);
      const end = events.at(-1)!;
      expect(end.type === "RUN_FINISHED" && end.outcome?.type).toBe(scenario.outcome);
      if (end.type === "RUN_FINISHED" && end.outcome?.type === "interrupt") {
        expect(end.outcome.interrupts.map((i) => i.metadata?.card)).toEqual(scenario.card_ids
          .map((id) => cards.find((c) => c.id === id)!).filter((c) => c.level !== "auto"));
      }
    }
  });

  it("contains at least one interrupt with an aprobar card", () => {
    const ends = expectedIds.map((id) => ScenarioSchema.parse(read(`${id}.json`)).at(-1)!.event);
    expect(ends.some((e) => e.type === "RUN_FINISHED" && e.outcome?.type === "interrupt"
      && e.outcome.interrupts.some((i) => i.metadata?.card?.level === "aprobar"))).toBe(true);
  });

  it("rejects bad timing, malformed events/cards and missing finish", () => {
    const steps = read("admin-confirma.json") as { delayMs: number; event: Record<string, unknown> }[];
    expect(ScenarioSchema.safeParse(steps.slice(0, -1)).success).toBe(false);
    expect(ScenarioSchema.safeParse([{ ...steps[0], delayMs: -1 }, ...steps.slice(1)]).success).toBe(false);
    expect(ScenarioSchema.safeParse([{ ...steps[0], event: { type: "RUN_STARTED" } }, ...steps.slice(1)]).success).toBe(false);
    expect(ScenarioSchema.safeParse([...steps.slice(0, -1), { delayMs: 0, event: { type: "CUSTOM", name: "airi.card", value: { id: "invalid" } } }, steps.at(-1)]).success).toBe(false);
  });
});

// Independent serialization and Node SHA-256 oracle for the browser helper.
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

describe("simulated approval envelope", () => {
  it("hashes every full card canonically without widening or mutating the DTO", () => {
    const cards = z.array(CardSchema).parse(read("cards.json"));
    for (const card of cards) {
      const before = JSON.stringify(card);
      const envelope = envelopeFor(card);
      expect(envelope).toEqual({ cardId: card.id, version: 1,
        payload_hash: createHash("sha256").update(canonicalJson(card)).digest("hex") });
      expect(JSON.stringify(card)).toBe(before);
      expect(CardSchema.safeParse({ ...card, ...envelope }).success).toBe(false);
    }
  });

  it("ignores object key order at every depth, preserves array order and distinguishes null from absence", () => {
    const card = CardSchema.parse((read("proposals.json") as unknown[])[0]);
    const reorder = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(reorder);
      if (!value || typeof value !== "object") return value;
      return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorder(item)]));
    };
    const reordered = reorder(card) as Card;
    expect(CardSchema.safeParse(reordered).success).toBe(true);
    expect(Object.keys(reordered)).not.toEqual(Object.keys(card));
    expect(envelopeFor(reordered)).toEqual(envelopeFor(card));
    expect(envelopeFor({ ...card, title: `${card.title}!` })).not.toEqual(envelopeFor(card));
    expect(envelopeFor({ ...card, srcs: ["uno", "dos"] })).not.toEqual(envelopeFor({ ...card, srcs: ["dos", "uno"] }));
    expect(envelopeFor({ ...card, why: undefined })).toEqual(envelopeFor(CardSchema.parse(JSON.parse(JSON.stringify({ ...card, why: undefined })))));
    expect(envelopeFor({ ...card, why: undefined })).not.toEqual(envelopeFor({ ...card, why: null }));
  });

  it("matches SHA-256 for UTF-8, long inputs and every padding boundary", () => {
    const card = CardSchema.parse((read("proposals.json") as unknown[])[0]);
    for (const body of [...Array.from({ length: 130 }, (_, n) => "x".repeat(n)), "Clínica 🦷 Lima", "á🦷".repeat(1000)]) {
      const changed = { ...card, body };
      expect(envelopeFor(changed).payload_hash).toBe(createHash("sha256").update(canonicalJson(changed)).digest("hex"));
    }
  });
});
