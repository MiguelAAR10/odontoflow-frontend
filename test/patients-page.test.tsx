import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import type { PatientRead } from "../src/contracts/client";

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock("axios", () => ({
  default: {
    create: () => ({ get: mockGet }),
    isAxiosError: (error: unknown) => Boolean((error as { isAxiosError?: boolean })?.isAxiosError),
  },
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

// The public contract has neither a creation date nor patient/lead metrics.
const fortyPatients: PatientRead[] = Array.from({ length: 40 }, (_, index) => ({
  id: index + 1,
  full_name: `Paciente ${index + 1}`,
  dni: String(70000000 + index),
  sexo: null,
  phone: `+51990000${String(index).padStart(3, "0")}`,
  birth_date: null,
}));

function text(node: ReactTestInstance | string): string {
  return typeof node === "string" ? node : node.children.map(text).join("");
}

describe("PatientsPage directory counts", () => {
  let page: ReactTestRenderer | undefined;

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false");
    mockGet.mockReset();
    mockGet.mockImplementation(async (url: string) => {
      if (url === "/patients") return { data: fortyPatients };
      throw new Error(`Unexpected GET ${url}`);
    });
  });

  afterEach(() => {
    if (page) act(() => page!.unmount());
    page = undefined;
    vi.unstubAllEnvs();
  });

  const renderPage = async () => {
    const { PatientsPage } = await import("../src/views/PatientsPage");
    await act(async () => { page = create(createElement(PatientsPage)); });
    return page!.root;
  };

  it("shows only the supported count and all 40 real patients without decorative pagination", async () => {
    const root = await renderPage();
    const cards = root.findAllByProps({ className: "kpi-card" });
    expect(cards.map(text)).toEqual(["40Pacientes registrados"]);
    expect(root.findByType("tbody").findAllByType("tr")).toHaveLength(40);
    expect(text(root.findByProps({ className: "result-count" }))).toBe("40 pacientes");
    const footer = root.findByProps({ className: "pagination" });
    expect(text(footer)).toContain("Mostrando 40 de 40 pacientes");
    expect(footer.findAllByType("button")).toHaveLength(0);
    expect(footer.findAllByType("select")).toHaveLength(0);
    expect(text(root)).not.toMatch(/1[,.]?284|Nuevos este mes|Leads por contactar/);
  });

  it("keeps the registered total when search reduces the visible rows", async () => {
    const root = await renderPage();
    await act(async () => {
      root.findByProps({ "aria-label": "Buscar pacientes" }).props.onChange({ target: { value: "Paciente 40" } });
    });
    expect(root.findByType("tbody").findAllByType("tr")).toHaveLength(1);
    expect(text(root.findByProps({ className: "kpi-card" }))).toBe("40Pacientes registrados");
    expect(text(root.findByProps({ className: "result-count" }))).toBe("1 pacientes");
    expect(text(root.findByProps({ className: "pagination" }))).toContain("Mostrando 1 de 40 pacientes");

    await act(async () => {
      root.findByProps({ "aria-label": "Buscar pacientes" }).props.onChange({ target: { value: "Sin coincidencias" } });
    });
    expect(text(root.findByType("tbody"))).toBe("No hay registros para mostrar");
    expect(text(root.findByProps({ className: "pagination" }))).toContain("Mostrando 0 de 40 pacientes");
  });

  it("shows a zero total when the real contract returns an empty list", async () => {
    mockGet.mockResolvedValue({ data: [] });
    const root = await renderPage();
    expect(text(root.findByProps({ className: "kpi-card" }))).toBe("0Pacientes registrados");
    expect(text(root.findByProps({ className: "pagination" }))).toContain("Mostrando 0 de 0 pacientes");
    expect(text(root.findByType("tbody"))).toBe("No hay registros para mostrar");
  });

  it("derives mock-mode totals from the six mockData patients", async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "true");
    const root = await renderPage();
    expect(text(root.findByProps({ className: "kpi-card" }))).toBe("6Pacientes registrados");
    expect(root.findByType("tbody").findAllByType("tr")).toHaveLength(6);
    expect(text(root.findByProps({ className: "pagination" }))).toContain("Mostrando 6 de 6 pacientes");
  });
});
