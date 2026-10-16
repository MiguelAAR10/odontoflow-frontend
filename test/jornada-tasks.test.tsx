import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { JornadaPage } from "../src/views/JornadaPage";

const model = vi.hoisted(() => ({
  mocks: true,
  day: { role: "doctor", data: null as null | { rows: []; doctor: string; cut: string }, error: "", retry: vi.fn() },
}));
vi.mock("../src/api", () => ({ get useMocks() { return model.mocks; } }));
vi.mock("../app/(shell)/atencion/useDoctorDay", () => ({ useDoctorDay: () => model.day }));

describe("doctor task discovery from Mi jornada", () => {
  it.each(["ready", "loading", "error", "unavailable"])("links to tasks when the clinical source is %s", state => {
    model.mocks = state !== "unavailable";
    model.day.data = state === "ready" ? { rows: [], doctor: "Doctor de prueba", cut: "2026-10-16T09:00:00-05:00" } : null;
    model.day.error = state === "error" ? "No se pudo cargar la jornada" : "";
    const html = renderToStaticMarkup(<JornadaPage />);
    expect(html).toMatch(/<a[^>]*href="\/mi-turno"[^>]*>Mis tareas<\/a>/);
    if (state === "unavailable") expect(html).toContain("Tu jornada clínica todavía no está disponible en esta fuente.");
    if (state === "error") expect(html).toContain(model.day.error);
    if (state === "loading") expect(html).toContain("Cargando tu jornada");
  });
});
