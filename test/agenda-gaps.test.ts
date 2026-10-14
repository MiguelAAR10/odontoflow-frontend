import { describe, expect, it } from "vitest";
import { visibleGaps } from "../src/agui/sim/gaps.js";
import gaps from "../src/agui/sim/fixtures/gaps.json" with { type: "json" };
import agenda from "../src/agui/sim/fixtures/agenda.json" with { type: "json" };

const context = { date: "2026-10-13", now: "2026-10-13T14:00:00-05:00" };

describe("huecos declarados de la agenda", () => {
  it("muestra solo intervalos declarados libres, sin inventar disponibilidad ni ocultar citas", () => {
    const result = visibleGaps(gaps, agenda, context);
    expect(result.map(gap => [gap.practitioner, gap.duration_minutes])).toEqual([["ruiz", 30], ["salinas", 60]]);
    // León figura ocupado hasta las 16:15: no es libre todo el intervalo 16–17.
    expect(agenda.find(row => row.id === "c11")?.end_at).toBe("2026-10-13T16:15:00-05:00");
  });
});

it("respeta el día Lima, el corte, la sede y el odontólogo", () => {
  expect(visibleGaps(gaps, agenda, { ...context, now: "2026-10-13T21:01:00Z" }).map(row => row.practitioner)).toEqual(["salinas"]);
  expect(visibleGaps(gaps, agenda, { ...context, date: "2026-10-14" })).toEqual([]);
  expect(visibleGaps(gaps, agenda, { ...context, sede: "Miraflores" })).toEqual([]);
  expect(visibleGaps(gaps, agenda, { ...context, practitioner: "ruiz" })).toHaveLength(1);
});

it("rechaza duración inconsistente, campos inventados y respeta límites adyacentes", () => {
  expect(visibleGaps([{ ...gaps[0], duration_minutes: 60 }, { ...gaps[0], fake: true }], [], context)).toEqual([]);
  expect(visibleGaps([gaps[0]], [{ start_at: "2026-10-13T15:00:00-05:00", end_at: "2026-10-13T16:00:00-05:00", practitioner: "ruiz", sede: "Lince" }], context)).toHaveLength(1);
  expect(visibleGaps([gaps[0]], [{ start_at: "2026-10-13T16:30:00-05:00", end_at: "2026-10-13T17:00:00-05:00", practitioner: "ruiz", sede: "Lince" }], context)).toHaveLength(1);
});
