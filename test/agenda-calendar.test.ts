import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/api", () => ({ useMocks: true }));
vi.mock("../src/agui/useAgent", () => ({ useAgent: vi.fn() }));
vi.mock("../src/agui", () => ({ approvalReceipts: { get: vi.fn() } }));
vi.mock("../src/components/shell/ShellContext", () => ({ useShellContext: vi.fn() }));
import { DoctorDayCalendar } from "../src/views/AgendaPage";
import agenda from "../src/agui/sim/fixtures/agenda.json";

const entries = agenda.map(row => ({
  id: row.id, start: row.start_at, end: row.end_at, doctorId: row.practitioner,
  doctor: row.practitioner_name, patient: row.patient, procedure: row.procedure,
  state: row.state, kind: row.kind,
}));
const render = (now = "2026-10-13T14:00:00-05:00") => renderToStaticMarkup(createElement(DoctorDayCalendar, {
  entries, now, date: "2026-10-13", doctorOrder: ["ruiz", "salinas", "leon"], onSelect: () => {},
}));
const appointment = (html: string, id: string) => html.match(new RegExp(`<button[^>]*data-appointment="${id}"[^>]*>`))![0];

describe("calendario Agenda v10", () => {
  it("mantiene todos los odontólogos en orden de presentación, independiente del orden de las citas", () => {
    const html = render();
    const headings = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map(match => match[1]);
    expect(headings).toEqual(["Dra. Valeria Ruiz", "Dr. Andrés Salinas", "Dra. Paula León"]);
    expect(html).toContain('value="all" selected="">Todos los odontólogos');
    expect(html.match(/class="airi-doctor-column"/g)).toHaveLength(3);
  });

  it("permite filtrar un odontólogo y regresar a la grilla completa", () => {
    let view!: ReactTestRenderer;
    act(() => { view = create(createElement(DoctorDayCalendar, {
      entries, now: "2026-10-13T14:00:00-05:00", date: "2026-10-13", onSelect: () => {},
    })); });
    try {
      const select = view.root.findByType("select");
      act(() => select.props.onChange({ target: { value: "salinas" } }));
      expect(view.root.findAllByType("section").map(section => section.props["aria-label"])).toEqual(["Dr. Andrés Salinas"]);
      act(() => select.props.onChange({ target: { value: "all" } }));
      expect(view.root.findAllByType("section")).toHaveLength(3);
    } finally { act(() => view.unmount()); }
  });

  it("presenta lecturas reales sin inventar tipo clínico ni huecos", () => {
    const html = renderToStaticMarkup(createElement(DoctorDayCalendar, {
      entries: [{ ...entries[0], doctorId: "42", doctor: "Dra. Backend", kind: undefined, state: "Confirmada" }],
      now: "2026-10-13T14:00:00-05:00", date: "2026-10-13", onSelect: () => {},
    }));
    expect(html).toContain("Dra. Backend");
    expect(appointment(html, "c0")).toContain("airi-kind-unknown");
    expect(appointment(html, "c0")).not.toContain("airi-appointment-past");
    expect(html).not.toContain('aria-label="Tipos de atención"');
    expect(html).not.toContain("data-gap=");
  });

  it("distingue citas cerradas sin apagar ausentes ni atenciones sin cerrar por el reloj", () => {
    const html = render();
    expect(appointment(html, "c0")).toContain("airi-appointment-past");
    expect(appointment(html, "c3")).not.toContain("airi-appointment-past");
    expect(appointment(html, "c4")).not.toContain("airi-appointment-past");
    expect(html).toContain("Resina 1.1 · sin cerrar");
    expect(html).toContain("Evaluación · ausente");
  });

  it("coloca el corte real a las 14:00 sobre la escala v10 y lo nombra con un rol válido", () => {
    const html = render();
    expect(html.match(/role="img" aria-label="Hora Lima 14:00"/g)).toHaveLength(3);
    expect(html).toContain('style="top:378px"');
    expect(html).toContain('role="group" aria-label="Tipos de atención"');
    expect(html).not.toMatch(/<div(?![^>]*role=)[^>]*aria-label=/);
    expect(render("2026-10-14T14:00:00-05:00")).not.toContain('aria-label="Hora Lima');
  });
});
