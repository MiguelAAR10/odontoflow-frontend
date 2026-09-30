import { describe, expect, it } from "vitest";
import { nowMinutes, splitWorklist, timeToMinutes } from "../src/home/schedule";
import type { Appointment } from "../src/types";

const base: Appointment = {
  id: "base",
  day: 0,
  time: "10:30",
  patient: "Ana Torres",
  treatment: "Limpieza dental",
  doctor: "Dra. Ruiz",
  branch: "Lince",
  status: "Confirmada",
};

const at = (id: string, time: string): Appointment => ({ ...base, id, time });

describe("Home worklist time boundary", () => {
  it("parses HH:MM into minutes and rejects malformed values", () => {
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("10:30")).toBe(630);
    expect(timeToMinutes("23:59")).toBe(1439);
    expect(timeToMinutes("")).toBeNull();
    expect(timeToMinutes("10")).toBeNull();
    expect(timeToMinutes("24:00")).toBeNull();
    expect(timeToMinutes("10:61")).toBeNull();
  });

  it("splits past from upcoming and anchors Ahora on the next appointment", () => {
    const split = splitWorklist([at("c", "12:00"), at("a", "08:00"), at("b", "10:30")], 9 * 60);
    expect(split.past.map((row) => row.id)).toEqual(["a"]);
    expect(split.upcoming.map((row) => row.id)).toEqual(["b", "c"]);
    expect(split.nowId).toBe("b");
  });

  it("treats an appointment exactly now as upcoming", () => {
    const split = splitWorklist([at("a", "10:30")], 630);
    expect(split.upcoming.map((row) => row.id)).toEqual(["a"]);
    expect(split.nowId).toBe("a");
  });

  it("keeps unparseable times visible instead of hiding them", () => {
    const split = splitWorklist([at("a", "08:00"), at("b", "s/d")], 9 * 60);
    expect(split.past.map((row) => row.id)).toEqual(["a"]);
    expect(split.upcoming.map((row) => row.id)).toEqual(["b"]);
  });

  it("returns no anchor when nothing is upcoming", () => {
    const split = splitWorklist([at("a", "08:00")], 18 * 60);
    expect(split.upcoming).toEqual([]);
    expect(split.nowId).toBeNull();
  });

  it("reads wall-clock minutes from a date", () => {
    expect(nowMinutes(new Date(2026, 8, 17, 9, 5))).toBe(545);
  });
});
