import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

const { mockGet, mockPost, persona } = vi.hoisted(() => ({
  mockGet: vi.fn(), mockPost: vi.fn(),
  persona: { current: { identity: null as unknown, loading: false } },
}));
vi.mock("axios", () => ({
  default: {
    create: () => ({ get: mockGet, post: mockPost }),
    isAxiosError: (error: unknown) => Boolean((error as { isAxiosError?: boolean })?.isAxiosError),
  },
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
// The panel decides what it offers from the backend's `/me` permissions (via the persona context), never from a role name.
vi.mock("../src/components/PersonaContext", () => ({ usePersona: () => persona.current }));
// The test renderer has no DOM (`document`, `self`): the dialog focus trap and
// next/link's viewport prefetch both need one, so each is replaced by its plain equivalent.
vi.mock("../src/components/useFocusTrap", () => ({ useFocusTrap: () => {} }));
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => createElement("a", { href, ...rest }, children) };
});

const ADMIN_GRANTS = ["practitioners.read", "practitioners.manage", "capabilities.manage", "availability.manage", "locations.manage", "services.manage", "audit.read"];
const asIdentity = (roles: string[], permissions: string[]) => {
  persona.current = { identity: { principalType: "human", displayName: "Persona", organizationName: "ODONTO SMART", roles, permissions }, loading: false };
};
const asAdministrador = () => asIdentity(["Administrador"], ADMIN_GRANTS);

const roster = [
  { id: 1, display_name: "Dra. Andrea Salazar", platform_active: true, membership_active: true, deactivated_at: null, future_confirmed_appointments: 2, capabilities: [], availability_rules: [] },
  { id: 2, display_name: "Dr. Renato Paredes", platform_active: true, membership_active: false, deactivated_at: "2026-10-01T15:00:00Z", future_confirmed_appointments: 0, capabilities: [], availability_rules: [] },
];

function text(node: ReactTestInstance | string): string {
  return typeof node === "string" ? node : node.children.map(text).join("");
}

describe("PractitionersPanel", () => {
  let view: ReactTestRenderer | undefined;
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false");
    asAdministrador();
    mockGet.mockReset();
    mockPost.mockReset();
    mockGet.mockImplementation(async (url: string) => {
      if (url === "/admin/practitioners") return { data: roster };
      throw new Error(`Unexpected GET ${url}`);
    });
  });
  afterEach(() => { view?.unmount(); vi.unstubAllEnvs(); });

  it("lists active and inactive doctors with their state", async () => {
    const { PractitionersPanel } = await import("../src/views/PractitionersPanel");
    await act(async () => { view = create(createElement(PractitionersPanel)); });
    const content = text(view!.root);
    expect(content).toContain("Dra. Andrea Salazar");
    expect(content).toContain("Dr. Renato Paredes");
    expect(content).toContain("Inactivo desde");
  });

  it("explains the future-appointment conflict instead of failing silently", async () => {
    mockPost.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 409, data: { error: { code: "APPOINTMENT_CONFLICT", message: "x", details: { reason: "future_appointments", appointment_ids: [7, 9] } } } },
    });
    const { PractitionersPanel } = await import("../src/views/PractitionersPanel");
    await act(async () => { view = create(createElement(PractitionersPanel)); });
    const manage = view!.root.findAll((node) => node.type === "button" && text(node).includes("Gestionar"))[0]!;
    await act(async () => { manage.props.onClick(); });
    const deactivate = view!.root.findAll((node) => node.type === "button" && text(node) === "Desactivar")[0]!;
    await act(async () => { deactivate.props.onClick(); });
    const reason = view!.root.find((node) => node.type === "textarea");
    await act(async () => { reason.props.onChange({ target: { value: "Fin de contrato" } }); });
    const form = view!.root.find((node) => node.type === "form" && node.props["aria-label"] === "Desactivar doctor");
    await act(async () => { await form.props.onSubmit({ preventDefault() {}, currentTarget: form }); });
    const alert = view!.root.find((node) => node.props.role === "alert");
    expect(text(alert)).toContain("2 citas futuras confirmadas");
  });
});

// --- everything the drawer, the dialog and the forms promise ---------------------------

const lince = "ODONTO SMART Lince";
const magdalena = "ODONTO SMART Magdalena";
const capability = (id: number, serviceName: string, locationName: string, active = true) => ({
  id, service_id: id - 10, service_name: serviceName, location_id: 1, location_name: locationName, is_active: active, deactivated_at: active ? null : "2026-10-05T14:30:00Z",
});
const rule = (id: number, day: number, active = true) => ({
  id, location_id: 1, location_name: lince, day_of_week: day, start_local: "09:00:00", end_local: "13:00:00", is_active: active, deactivated_at: active ? null : "2026-10-03T16:00:00Z",
});
const catalogServices = [
  { id: 1, name: "Limpieza dental", duration_minutes: 30, is_active: true },
  { id: 2, name: "Evaluación dental", duration_minutes: 30, is_active: true },
  { id: 3, name: "Servicio retirado", duration_minutes: 30, is_active: false },
];
const catalogSites = [
  { id: 1, name: lince, timezone: "America/Lima", is_active: true },
  { id: 3, name: magdalena, timezone: "America/Lima", is_active: true },
  { id: 4, name: "Sede cerrada", timezone: "America/Lima", is_active: false },
];
const outcome = (entityType: string, id: number, active: boolean, reason: string | null = null) => ({
  entity_type: entityType, id, practitioner_id: 1, is_active: active, deactivated_at: active ? null : "2026-10-10T15:00:00Z", reason,
});
const axiosFailure = (status: number, code: string, message: string, details: Record<string, unknown> = {}) => ({
  isAxiosError: true, response: { status, data: { error: { code, message, details } } },
});
const keyOf = (call: unknown[]) => (call[2] as { headers: Record<string, string> }).headers["Idempotency-Key"];

describe("PractitionersPanel · management", () => {
  let view: ReactTestRenderer | undefined;
  let doctors: typeof roster;
  let history: unknown[];

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false");
    asAdministrador();
    mockGet.mockReset();
    mockPost.mockReset();
    doctors = [
      {
        ...roster[0]!,
        capabilities: [capability(11, "Limpieza dental", lince), capability(12, "Evaluación dental", lince, false)] as never,
        availability_rules: [rule(21, 0), rule(22, 5, false)] as never,
      },
      roster[1]!,
    ];
    history = [];
    mockGet.mockImplementation(async (url: string) => {
      if (url === "/admin/practitioners") return { data: doctors };
      if (url === "/services") return { data: catalogServices };
      if (url === "/locations") return { data: catalogSites };
      if (url === "/admin/practitioners/1/history") return { data: history };
      throw new Error(`Unexpected GET ${url}`);
    });
  });
  afterEach(() => { view?.unmount(); view = undefined; vi.unstubAllEnvs(); });

  const root = () => view!.root;
  const rosterReads = () => mockGet.mock.calls.filter(([url]) => url === "/admin/practitioners").length;
  const buttons = (name: string) => root().findAll((node) => node.type === "button" && text(node) === name);
  const form = (label: string) => root().find((node) => node.type === "form" && node.props["aria-label"] === label);
  const click = (node: ReactTestInstance) => act(async () => { node.props.onClick(); });
  const type = (node: ReactTestInstance, value: string) => act(async () => { node.props.onChange({ target: { value } }); });
  const submit = (label: string) => act(async () => {
    const target = form(label);
    await target.props.onSubmit({ preventDefault() {}, currentTarget: target });
  });
  const manage = async (name: string) => {
    await click(root().findAll((node) => node.type === "button" && node.props["aria-label"] === `Gestionar ${name}`)[0]!);
  };
  const mount = async () => {
    const { PractitionersPanel } = await import("../src/views/PractitionersPanel");
    await act(async () => { view = create(createElement(PractitionersPanel)); });
  };
  /** Opens the reason dialog from the drawer's Estado section and confirms it with `reason`. */
  const deactivateDoctor = async (reason: string) => {
    await click(buttons("Desactivar")[0]!);
    await type(root().find((node) => node.type === "textarea"), reason);
    await submit("Desactivar doctor");
  };

  it("hides the inactive doctors on demand, and shows them by default", async () => {
    await mount();
    const checkbox = () => root().find((node) => node.type === "input" && node.props.type === "checkbox");
    expect(checkbox().props.checked).toBe(true);
    await act(async () => { checkbox().props.onChange({ target: { checked: false } }); });
    expect(text(root())).toContain("Dra. Andrea Salazar");
    expect(text(root())).not.toContain("Dr. Renato Paredes");
    await act(async () => { checkbox().props.onChange({ target: { checked: true } }); });
    expect(text(root())).toContain("Dr. Renato Paredes");
  });

  it("summarises services and schedules per doctor", async () => {
    await mount();
    const row = root().findAll((node) => node.type === "tr").find((tr) => text(tr).includes("Dra. Andrea Salazar"))!;
    const cells = row.findAllByType("td").map(text);
    expect(cells[2]).toBe("1/2");
    expect(cells[3]).toBe("1");
    expect(cells[4]).toBe("2");
  });

  it("creates a doctor with an idempotency key and reads the roster again", async () => {
    mockPost.mockImplementationOnce(async () => {
      doctors = [...doctors, { id: 3, display_name: "Dra. Camila Vega", platform_active: true, membership_active: true, deactivated_at: null, future_confirmed_appointments: 0, capabilities: [], availability_rules: [] }];
      return { data: { id: 3, display_name: "Dra. Camila Vega", is_active: true } };
    });
    await mount();
    expect(rosterReads()).toBe(1);
    await type(form("Nuevo doctor").find((node) => node.type === "input"), "  Dra. Camila Vega ");
    await submit("Nuevo doctor");
    expect(mockPost).toHaveBeenCalledWith("/practitioners", { display_name: "Dra. Camila Vega", is_active: true }, { headers: { "Idempotency-Key": expect.any(String) } });
    expect(rosterReads()).toBe(2);
    expect(text(root())).toContain("Dra. Camila Vega");
    expect(form("Nuevo doctor").find((node) => node.type === "input").props.value).toBe("");
  });

  it("deactivates with the reason, closes the dialog and reads the roster again", async () => {
    mockPost.mockResolvedValueOnce({ data: outcome("practitioner_membership", 1, false, "Fin de contrato") });
    await mount();
    await manage("Dra. Andrea Salazar");
    await deactivateDoctor("  Fin de contrato ");
    expect(mockPost).toHaveBeenCalledWith("/admin/practitioners/1/deactivate", { reason: "Fin de contrato" }, { headers: { "Idempotency-Key": expect.any(String) } });
    expect(rosterReads()).toBe(2);
    expect(root().findAll((node) => node.type === "textarea")).toHaveLength(0);
  });

  it("asks for a reason of at least 3 characters before calling the backend", async () => {
    await mount();
    await manage("Dra. Andrea Salazar");
    await deactivateDoctor(" no ");
    expect(mockPost).not.toHaveBeenCalled();
    expect(text(root())).toContain("Indica el motivo (mínimo 3 caracteres).");
    expect(root().find((node) => node.type === "textarea")).toBeDefined();
  });

  it("keeps the key for an identical retry and starts a new intent when the data changes", async () => {
    mockPost
      .mockRejectedValueOnce(axiosFailure(500, "INTERNAL", "Algo falló"))
      .mockRejectedValueOnce(axiosFailure(500, "INTERNAL", "Algo falló"))
      .mockResolvedValueOnce({ data: outcome("practitioner_membership", 1, false, "Cambio de plan") });
    await mount();
    await manage("Dra. Andrea Salazar");
    await deactivateDoctor("Fin de contrato");
    expect(text(root().find((node) => node.props.role === "alert"))).toContain("Algo falló");
    await submit("Desactivar doctor");
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(keyOf(mockPost.mock.calls[1]!)).toBe(keyOf(mockPost.mock.calls[0]!));
    await type(root().find((node) => node.type === "textarea"), "Cambio de plan");
    await submit("Desactivar doctor");
    expect(mockPost).toHaveBeenCalledTimes(3);
    expect(keyOf(mockPost.mock.calls[2]!)).not.toBe(keyOf(mockPost.mock.calls[0]!));
    expect(root().findAll((node) => node.type === "textarea")).toHaveLength(0);
  });

  it("says 'Sin acceso' when the backend refuses the profile (403)", async () => {
    mockPost.mockRejectedValueOnce(axiosFailure(403, "PERMISSION_DENIED", "The principal is not authorized to perform this action."));
    await mount();
    await manage("Dra. Andrea Salazar");
    await deactivateDoctor("Fin de contrato");
    const alert = root().find((node) => node.props.role === "alert");
    expect(text(alert)).toContain("Sin acceso");
    expect(text(alert)).toContain("Tu sesión sigue activa");
    expect(text(alert)).not.toContain("citas futuras");
    // The roster stays on screen: a 403 refuses one action, it does not end the visit.
    expect(text(root())).toContain("Dr. Renato Paredes");
  });

  it("offers nothing to change to a profile without *.manage, even if it is called Administrador", async () => {
    asIdentity(["Administrador"], ["practitioners.read"]);
    await mount();
    expect(root().findAll((node) => node.type === "form" && node.props["aria-label"] === "Nuevo doctor")).toHaveLength(0);
    expect(text(root())).toContain("Tu perfil puede consultar los doctores, pero no administrarlos.");
    await manage("Dra. Andrea Salazar");
    expect(buttons("Desactivar")).toHaveLength(0);
    expect(buttons("Reactivar")).toHaveLength(0);
    expect(buttons("Guardar nombre")).toHaveLength(0);
    expect(buttons("Añadir servicio")).toHaveLength(0);
    expect(buttons("Añadir horario")).toHaveLength(0);
    expect(buttons("Ver historial")).toHaveLength(0);
    expect(text(root())).toContain("Dra. Andrea Salazar");
    expect(text(root())).toContain("Limpieza dental");
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("offers every change to a profile that holds the grants, whatever its role is called", async () => {
    asIdentity(["Secretaria"], ADMIN_GRANTS);
    await mount();
    expect(form("Nuevo doctor")).toBeDefined();
    await manage("Dra. Andrea Salazar");
    expect(buttons("Desactivar").length).toBeGreaterThan(0);
    expect(buttons("Ver historial")).toHaveLength(1);
  });

  it("offers each section only with its own grant: services with capabilities.manage, nothing else", async () => {
    asIdentity(["Recepción"], ["practitioners.read", "capabilities.manage"]);
    await mount();
    await manage("Dra. Andrea Salazar");
    expect(root().findAll((node) => node.type === "button" && node.props["aria-label"] === `Desactivar Limpieza dental en ${lince}`)).toHaveLength(1);
    expect(buttons("Añadir servicio")).toHaveLength(1);
    expect(root().findAll((node) => node.type === "button" && String(node.props["aria-label"]).startsWith("Desactivar horario"))).toHaveLength(0);
    expect(buttons("Añadir horario")).toHaveLength(0);
    expect(buttons("Guardar nombre")).toHaveLength(0);
    expect(root().findAll((node) => node.type === "section" && node.props["aria-labelledby"] === "doctor-state")
      .flatMap((section) => section.findAll((node) => node.type === "button"))).toHaveLength(0);
  });

  it("links the conflict to the Agenda, lists the appointments and never understates the full count", async () => {
    doctors[0] = { ...doctors[0]!, future_confirmed_appointments: 120 };
    mockPost.mockRejectedValueOnce(axiosFailure(409, "APPOINTMENT_CONFLICT", "x", { reason: "future_appointments", appointment_ids: Array.from({ length: 50 }, (_, index) => index + 1) }));
    await mount();
    await manage("Dra. Andrea Salazar");
    await deactivateDoctor("Fin de contrato");
    const alert = root().find((node) => node.props.role === "alert");
    expect(text(alert)).toContain("Tiene 120 citas futuras confirmadas. Reprográmalas o cancélalas en la Agenda antes de desactivar.");
    expect(text(alert)).toContain("#1, #2, #3");
    expect(alert.find((node) => node.type === "a").props.href).toBe("/agenda");
  });

  it("speaks in the singular for one appointment and says 'al menos' when the list is capped", async () => {
    doctors[0] = { ...doctors[0]!, future_confirmed_appointments: 0 };
    mockPost
      .mockRejectedValueOnce(axiosFailure(409, "APPOINTMENT_CONFLICT", "x", { reason: "future_appointments", appointment_ids: [5] }))
      .mockRejectedValueOnce(axiosFailure(409, "APPOINTMENT_CONFLICT", "x", { reason: "future_appointments", appointment_ids: Array.from({ length: 50 }, (_, index) => index + 1) }));
    await mount();
    await manage("Dra. Andrea Salazar");
    await deactivateDoctor("Fin de contrato");
    expect(text(root().find((node) => node.props.role === "alert"))).toContain("Tiene 1 cita futura confirmada. Reprográmala o cancélala en la Agenda antes de desactivar.");
    await type(root().find((node) => node.type === "textarea"), "Otro motivo");
    await submit("Desactivar doctor");
    expect(text(root().find((node) => node.props.role === "alert"))).toContain("Tiene al menos 50 citas futuras confirmadas.");
  });

  it("reactivates an inactive doctor without asking for a reason", async () => {
    mockPost.mockResolvedValueOnce({ data: { ...outcome("practitioner_membership", 2, true), practitioner_id: 2 } });
    await mount();
    await manage("Dr. Renato Paredes");
    expect(buttons("Desactivar")).toHaveLength(0);
    await click(buttons("Reactivar")[0]!);
    expect(mockPost).toHaveBeenCalledWith("/admin/practitioners/2/reactivate", undefined, { headers: { "Idempotency-Key": expect.any(String) } });
    expect(rosterReads()).toBe(2);
  });

  it("renames a doctor", async () => {
    mockPost.mockResolvedValueOnce({ data: { id: 1, display_name: "Dra. Andrea S." } });
    await mount();
    await manage("Dra. Andrea Salazar");
    const save = () => form("Datos del doctor").findAll((node) => node.type === "button")[0]!;
    expect(save().props.disabled).toBe(true);
    await type(form("Datos del doctor").find((node) => node.type === "input"), "  Dra. Andrea S. ");
    expect(save().props.disabled).toBe(false);
    await submit("Datos del doctor");
    expect(mockPost).toHaveBeenCalledWith("/admin/practitioners/1/profile", { display_name: "Dra. Andrea S." }, { headers: { "Idempotency-Key": expect.any(String) } });
    expect(rosterReads()).toBe(2);
  });

  it("lists the services and schedules a doctor has, active or not", async () => {
    await mount();
    await manage("Dra. Andrea Salazar");
    const content = text(root());
    expect(content).toContain("Limpieza dental");
    expect(content).toContain("Evaluación dental");
    expect(content).toContain("Inactivo desde 05/10/2026");
    expect(content).toContain("Lunes");
    expect(content).toContain("Sábado");
    expect(content).toContain("09:00–13:00");
    expect(content).toContain("Inactivo desde 03/10/2026");
    expect(content).toContain("Para cambiar un horario, desactiva el actual y añade el nuevo; el historial guarda ambos.");
  });

  it("switches a service and a schedule off with a reason, and back on without one", async () => {
    mockPost.mockResolvedValue({ data: outcome("practitioner_capability", 11, false, "Equipo en mantenimiento") });
    await mount();
    await manage("Dra. Andrea Salazar");

    await click(root().find((node) => node.type === "button" && node.props["aria-label"] === `Desactivar Limpieza dental en ${lince}`));
    await type(root().find((node) => node.type === "textarea"), "Equipo en mantenimiento");
    await submit("Desactivar servicio del doctor");
    expect(mockPost).toHaveBeenLastCalledWith("/admin/capabilities/11/deactivate", { reason: "Equipo en mantenimiento" }, { headers: { "Idempotency-Key": expect.any(String) } });

    await click(root().find((node) => node.type === "button" && node.props["aria-label"] === `Desactivar horario del Lunes en ${lince}`));
    await type(root().find((node) => node.type === "textarea"), "Cambia de turno");
    await submit("Desactivar horario");
    expect(mockPost).toHaveBeenLastCalledWith("/admin/availability-rules/21/deactivate", { reason: "Cambia de turno" }, { headers: { "Idempotency-Key": expect.any(String) } });

    await click(root().find((node) => node.type === "button" && node.props["aria-label"] === `Reactivar Evaluación dental en ${lince}`));
    expect(mockPost).toHaveBeenLastCalledWith("/admin/capabilities/12/reactivate", undefined, { headers: { "Idempotency-Key": expect.any(String) } });
    await click(root().find((node) => node.type === "button" && node.props["aria-label"] === `Reactivar horario del Sábado en ${lince}`));
    expect(mockPost).toHaveBeenLastCalledWith("/admin/availability-rules/22/reactivate", undefined, { headers: { "Idempotency-Key": expect.any(String) } });
  });

  it("adds a service from the active catalog only", async () => {
    mockPost.mockResolvedValueOnce({ data: { id: 13, practitioner_id: 1, service_id: 2, location_id: 3, is_active: true } });
    await mount();
    await manage("Dra. Andrea Salazar");
    const [service, site] = form("Añadir servicio").findAll((node) => node.type === "select");
    expect(service!.findAllByType("option").map(text)).toEqual(["Elige un servicio", "Limpieza dental", "Evaluación dental"]);
    expect(site!.findAllByType("option").map(text)).toEqual(["Elige una sede", lince, magdalena]);
    await type(service!, "2");
    await type(site!, "3");
    await submit("Añadir servicio");
    expect(mockPost).toHaveBeenCalledWith("/capabilities", { practitioner_id: 1, service_id: 2, location_id: 3, is_active: true }, { headers: { "Idempotency-Key": expect.any(String) } });
    expect(rosterReads()).toBe(2);
  });

  it("offers to reactivate the service that already exists instead of failing", async () => {
    mockPost
      .mockRejectedValueOnce(axiosFailure(422, "INVALID_INPUT", "This capability already exists.", { capability_id: 12, is_active: false }))
      .mockResolvedValueOnce({ data: outcome("practitioner_capability", 12, true) });
    await mount();
    await manage("Dra. Andrea Salazar");
    const [service, site] = form("Añadir servicio").findAll((node) => node.type === "select");
    await type(service!, "2");
    await type(site!, "1");
    await submit("Añadir servicio");
    const notice = root().find((node) => node.props.role === "alert");
    expect(text(notice)).toContain("Ya lo atiende en esa sede");
    await click(notice.findAll((node) => node.type === "button" && text(node) === "Reactivar")[0]!);
    expect(mockPost).toHaveBeenLastCalledWith("/admin/capabilities/12/reactivate", undefined, { headers: { "Idempotency-Key": expect.any(String) } });
    expect(root().findAll((node) => node.props.role === "alert")).toHaveLength(0);
  });

  it("does not offer to reactivate a service that is already active", async () => {
    mockPost.mockRejectedValueOnce(axiosFailure(422, "INVALID_INPUT", "This capability already exists.", { capability_id: 11, is_active: true }));
    await mount();
    await manage("Dra. Andrea Salazar");
    const [service, site] = form("Añadir servicio").findAll((node) => node.type === "select");
    await type(service!, "1");
    await type(site!, "1");
    await submit("Añadir servicio");
    const notice = root().find((node) => node.props.role === "alert");
    expect(text(notice)).toContain("Ese servicio ya está activo para este doctor.");
    expect(notice.findAll((node) => node.type === "button")).toHaveLength(0);
  });

  it("adds a schedule with the day, the site and the times", async () => {
    mockPost.mockResolvedValueOnce({ data: { id: 23, practitioner_id: 1, location_id: 3, day_of_week: 2, start_local: "14:30:00", end_local: "19:00:00" } });
    await mount();
    await manage("Dra. Andrea Salazar");
    const [day, site] = form("Añadir horario").findAll((node) => node.type === "select");
    const [from, until] = form("Añadir horario").findAll((node) => node.type === "input");
    expect(day!.findAllByType("option").map(text)).toEqual(["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]);
    await type(day!, "2");
    await type(site!, "3");
    await type(from!, "14:30");
    await type(until!, "19:00");
    await submit("Añadir horario");
    expect(mockPost).toHaveBeenCalledWith(
      "/availability-rules",
      { practitioner_id: 1, location_id: 3, day_of_week: 2, start_local: "14:30:00", end_local: "19:00:00" },
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
    expect(rosterReads()).toBe(2);
  });

  it("will not add services or schedules to an inactive doctor", async () => {
    await mount();
    await manage("Dr. Renato Paredes");
    expect(text(root())).toContain("Reactiva al doctor para añadirle servicios.");
    expect(text(root())).toContain("Reactiva al doctor para añadirle horarios.");
    const adds = ["Añadir servicio", "Añadir horario"].map((label) => form(label).findAll((node) => node.type === "button" && node.props.type === "submit")[0]!);
    expect(adds.map((button) => button.props.disabled)).toEqual([true, true]);
  });

  it("shows the history with translated actions, who did it and why", async () => {
    history = [
      { id: 9, occurred_at: "2026-10-09T15:00:00Z", action: "practitioner_membership.deactivated", entity_type: "practitioner_membership", entity_id: "1", actor_type: "human", actor_id: "4", before_state: null, after_state: { practitioner_id: 1, reason: "Fin de contrato" } },
      { id: 8, occurred_at: "2026-10-08T15:00:00Z", action: "practitioner_capability.created", entity_type: "practitioner_capability", entity_id: "11", actor_type: "agent", actor_id: "7", before_state: null, after_state: { practitioner_id: 1 } },
      { id: 7, occurred_at: "2026-10-07T15:00:00Z", action: "practitioner.renamed", entity_type: "practitioner", entity_id: "1", actor_type: "human", actor_id: "4", before_state: { display_name: "Dra. A. Salazar" }, after_state: { display_name: "Dra. Andrea Salazar" } },
      { id: 6, occurred_at: "2026-10-06T15:00:00Z", action: "something.new", entity_type: "other", entity_id: "1", actor_type: "system", actor_id: "system", before_state: null, after_state: null },
    ];
    await mount();
    await manage("Dra. Andrea Salazar");
    expect(root().findAll((node) => node.type === "ol")).toHaveLength(0);
    await click(buttons("Ver historial")[0]!);
    expect(mockGet).toHaveBeenCalledWith("/admin/practitioners/1/history");
    const items = root().findAll((node) => node.type === "li").map(text);
    expect(items).toHaveLength(4);
    expect(items[0]).toContain("Desactivado");
    expect(items[0]).toContain("09/10/2026, 10:00");
    expect(items[0]).toContain("Persona #4");
    expect(items[0]).toContain("Motivo: Fin de contrato");
    expect(items[1]).toContain("Servicio añadido · Limpieza dental · ODONTO SMART Lince");
    expect(items[1]).toContain("Agente #7");
    expect(items[2]).toContain("Cambio de nombre · Dra. A. Salazar → Dra. Andrea Salazar");
    expect(items[3]).toContain("something.new");
    expect(items[3]).toContain("Sistema");
    expect(items[3]).not.toContain("Motivo");
  });

  it("refuses the history with 'Sin acceso' for a profile without audit access", async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === "/admin/practitioners") return { data: doctors };
      if (url === "/services") return { data: catalogServices };
      if (url === "/locations") return { data: catalogSites };
      throw axiosFailure(403, "PERMISSION_DENIED", "The principal is not authorized to perform this action.");
    });
    await mount();
    await manage("Dra. Andrea Salazar");
    await click(buttons("Ver historial")[0]!);
    expect(text(root().find((node) => node.props.role === "alert"))).toContain("Sin acceso");
  });

  it("shows 'Sin acceso' instead of the table when the roster itself is refused", async () => {
    mockGet.mockImplementation(async () => { throw axiosFailure(403, "PERMISSION_DENIED", "The principal is not authorized to perform this action."); });
    await mount();
    expect(text(root().find((node) => node.props.role === "alert"))).toContain("Sin acceso");
    expect(root().findAll((node) => node.type === "table")).toHaveLength(0);
  });
});

// --- Configuración: the doctors come first, Sedes and Servicios get their own actions -----

describe("SettingsPage · administration", () => {
  let view: ReactTestRenderer | undefined;
  let locations: Array<{ id: number; name: string; timezone: string; is_active: boolean }>;
  let services: Array<{ id: number; name: string; duration_minutes: number; is_active: boolean }>;

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false");
    asAdministrador();
    mockGet.mockReset();
    mockPost.mockReset();
    locations = [
      { id: 1, name: lince, timezone: "America/Lima", is_active: true },
      { id: 2, name: "ODONTO SMART Jesús María", timezone: "America/Lima", is_active: false },
    ];
    services = [
      { id: 1, name: "Limpieza dental", duration_minutes: 30, is_active: true },
      { id: 2, name: "Blanqueamiento", duration_minutes: 60, is_active: false },
    ];
    mockGet.mockImplementation(async (url: string) => {
      if (url === "/admin/practitioners") return { data: roster };
      if (url === "/locations") return { data: locations };
      if (url === "/services") return { data: services };
      throw new Error(`Unexpected GET ${url}`);
    });
  });
  afterEach(() => { view?.unmount(); view = undefined; vi.unstubAllEnvs(); });

  const root = () => view!.root;
  const buttonLabelled = (label: string) => root().find((node) => node.type === "button" && node.props["aria-label"] === label);
  const click = (node: ReactTestInstance) => act(async () => { node.props.onClick(); });
  const mount = async () => {
    const { SettingsPage } = await import("../src/views/SettingsPage");
    await act(async () => { view = create(createElement(SettingsPage)); });
  };
  const confirm = async (label: string, reason: string) => {
    await act(async () => { root().find((node) => node.type === "textarea").props.onChange({ target: { value: reason } }); });
    await act(async () => {
      const target = root().find((node) => node.type === "form" && node.props["aria-label"] === label);
      await target.props.onSubmit({ preventDefault() {}, currentTarget: target });
    });
  };

  it("puts the doctors first and an Acciones column on Sedes and Servicios", async () => {
    await mount();
    const headings = root().findAll((node) => node.type === "h2").map((node) => text(node).trim());
    expect(headings.slice(0, 3)).toEqual(["Doctores", "Sedes", "Servicios"]);
    const headers = root().findAll((node) => node.type === "th").map(text);
    expect(headers.filter((header) => header === "Acciones")).toHaveLength(3);
  });

  it("switches a site off with a reason and reads the catalog again", async () => {
    mockPost.mockImplementationOnce(async () => {
      locations[0] = { ...locations[0]!, is_active: false };
      return { data: { entity_type: "location", id: 1, practitioner_id: null, is_active: false, deactivated_at: "2026-10-10T15:00:00Z", reason: "Remodelación" } };
    });
    await mount();
    await click(buttonLabelled(`Desactivar sede ${lince}`));
    await confirm("Desactivar sede", "Remodelación");
    expect(mockPost).toHaveBeenCalledWith("/admin/locations/1/deactivate", { reason: "Remodelación" }, { headers: { "Idempotency-Key": expect.any(String) } });
    expect(root().findAll((node) => node.type === "textarea")).toHaveLength(0);
    expect(buttonLabelled(`Reactivar sede ${lince}`)).toBeDefined();
  });

  it("switches an inactive service back on without a reason", async () => {
    mockPost.mockImplementationOnce(async () => {
      services[1] = { ...services[1]!, is_active: true };
      return { data: { entity_type: "service", id: 2, practitioner_id: null, is_active: true, deactivated_at: null, reason: null } };
    });
    await mount();
    await click(buttonLabelled("Reactivar servicio Blanqueamiento"));
    expect(mockPost).toHaveBeenCalledWith("/admin/services/2/reactivate", undefined, { headers: { "Idempotency-Key": expect.any(String) } });
    expect(buttonLabelled("Desactivar servicio Blanqueamiento")).toBeDefined();
  });

  it("explains the future-appointment conflict of a site or a service the same way", async () => {
    mockPost.mockRejectedValueOnce(axiosFailure(409, "APPOINTMENT_CONFLICT", "x", { reason: "future_appointments", appointment_ids: [31, 32, 33] }));
    await mount();
    await click(buttonLabelled("Desactivar servicio Limpieza dental"));
    await confirm("Desactivar servicio", "Ya no se ofrece");
    const alert = root().find((node) => node.props.role === "alert");
    expect(text(alert)).toContain("Tiene 3 citas futuras confirmadas. Reprográmalas o cancélalas en la Agenda antes de desactivar.");
    expect(text(alert)).toContain("#31, #32, #33");
    expect(mockPost).toHaveBeenCalledWith("/admin/services/1/deactivate", { reason: "Ya no se ofrece" }, { headers: { "Idempotency-Key": expect.any(String) } });
  });

  it("shows no Acciones nor Nueva sede / Nuevo servicio to a profile without locations.manage / services.manage", async () => {
    asIdentity(["Administrador"], ["practitioners.read", "locations.read", "services.read"]);
    await mount();
    expect(root().findAll((node) => node.type === "th").map(text).filter((header) => header === "Acciones")).toHaveLength(1);
    expect(root().findAll((node) => node.type === "form" && ["Nueva sede", "Nuevo servicio"].includes(node.props["aria-label"]))).toHaveLength(0);
    expect(text(root())).toContain(lince);
    expect(text(root())).toContain("Limpieza dental");
  });

  it("gives Sedes and Servicios their actions independently, by grant", async () => {
    asIdentity(["Administrador"], ["practitioners.read", "services.manage"]);
    await mount();
    expect(root().findAll((node) => node.type === "button" && node.props["aria-label"] === `Desactivar sede ${lince}`)).toHaveLength(0);
    expect(buttonLabelled("Desactivar servicio Limpieza dental")).toBeDefined();
    expect(root().findAll((node) => node.type === "form" && node.props["aria-label"] === "Nuevo servicio")).toHaveLength(1);
    expect(root().findAll((node) => node.type === "form" && node.props["aria-label"] === "Nueva sede")).toHaveLength(0);
  });

  it("says 'Sin acceso' when the profile cannot administer sites", async () => {
    mockPost.mockRejectedValueOnce(axiosFailure(403, "PERMISSION_DENIED", "The principal is not authorized to perform this action."));
    await mount();
    await click(buttonLabelled(`Desactivar sede ${lince}`));
    await confirm("Desactivar sede", "Remodelación");
    expect(text(root().find((node) => node.props.role === "alert"))).toContain("Sin acceso");
  });
});
