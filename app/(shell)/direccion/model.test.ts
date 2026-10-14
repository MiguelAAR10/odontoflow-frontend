import { describe, expect, it } from "vitest";
import state from "../../../src/agui/sim/fixtures/state.json";
import { directionSnapshotSchema, summarizeDirection, occupancy } from "./model";

describe("Dirección: proyección del corte", () => {
  it("separa pagos verificados y pendientes y marca el total parcial", () => {
    const summary = summarizeDirection(directionSnapshotSchema.parse(state[0]));
    expect(summary.collected).toBe(624000);
    expect(summary.pending).toBe(118000);
    expect(summary.partial).toBe(true);
    expect(summary.occupancy).toBe(73);
    expect(summary.published).toBe(2);
  });
  it("no convierte ausencia de ocupación o capacidad en cero", () => {
    expect(occupancy(null, null)).toBeNull();
    expect(occupancy(null, 120)).toBeNull();
    expect(occupancy(0, 120)).toBe(0);
  });
  it("pondera minutos en vez de promediar porcentajes", () => {
    const snapshot = directionSnapshotSchema.parse(state[0]);
    snapshot.sedes = [
      { ...snapshot.sedes[0]!, occupied_minutes: 90, capacity_minutes: 100 },
      { ...snapshot.sedes[1]!, occupied_minutes: 10, capacity_minutes: 1000 },
    ];
    expect(summarizeDirection(snapshot).occupancy).toBe(9);
    snapshot.sedes = [];
    expect(summarizeDirection(snapshot).occupancy).toBeNull();
  });
  it("rechaza ceros en capacidad, fechas inválidas y campos ajenos al DTO", () => {
    expect(directionSnapshotSchema.safeParse({ ...state[0], cut_at: "ayer" }).success).toBe(false);
    expect(directionSnapshotSchema.safeParse({ ...state[0], extra: true }).success).toBe(false);
    const snapshot = structuredClone(state[0]!);
    snapshot.sedes[0]!.capacity_minutes = 0;
    expect(directionSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });
});
