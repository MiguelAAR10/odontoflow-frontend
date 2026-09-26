import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it("updates a demo appointment's date and removes it from all agenda reads", async () => {
  vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "true"); vi.resetModules();
  const api = await import("../src/api.js");
  const input = { patient: "Paciente edición", treatment: "Evaluación", doctor: "Dra. Valeria Ruiz", branch: "Lince", date: "2030-10-06", time: "10:30" };
  const created = await api.createAppointment(input);
  const edited = await api.editDemoAppointment(created.id, { ...input, time: "11:45" });
  expect(edited.time).toBe("11:45");
  expect(edited.startUtc).toBe("2030-10-06T16:45:00.000Z");
  expect((await api.getAppointments()).find((item) => item.id === created.id)?.time).toBe("11:45");
  await api.deleteDemoAppointment(created.id);
  expect((await api.loadAgenda()).some((item) => item.id === created.id)).toBe(false);
});

it("rejects an overlapping edit without changing the original appointment", async () => {
  vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "true"); vi.resetModules();
  const api = await import("../src/api.js");
  const rows = await api.getAppointments();
  const first = rows[0]; const second = rows[1];
  const date = api.currentWeekWindow().from.slice(0, 10);
  await expect(api.editDemoAppointment(second.id, { patient: second.patient, treatment: second.treatment, doctor: first.doctor, branch: first.branch, date, time: "09:30" })).rejects.toThrow("ya tiene una cita");
  expect((await api.getAppointments()).find((item) => item.id === second.id)).toEqual(second);
});

it("never mutates design fixtures through edit/delete in real mode", async () => {
  vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false"); vi.resetModules();
  const api = await import("../src/api.js");
  const { appointments } = await import("../src/mockData.js");
  const before = structuredClone(appointments);
  await expect(api.deleteDemoAppointment("apt-1")).rejects.toThrow("cancelar");
  await expect(api.editDemoAppointment("apt-1", { patient: "Cambio", treatment: "Evaluación", doctor: "Prueba", branch: "Lince", date: "2030-01-01", time: "09:00" })).rejects.toThrow("reprogramar");
  expect(appointments).toEqual(before);
});
