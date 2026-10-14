export type ShellRole = "dueno" | "doctor" | "admin";
export type NavigationIcon = "home" | "trail" | "agenda" | "cash" | "inbox" | "canvas" | "patient";
export interface NavigationEntry { to: string; label: string; icon: NavigationIcon }
export const SHELL_ROLES: ReadonlyArray<{ value: ShellRole; label: string }> = [
  { value: "dueno", label: "Dueño" }, { value: "doctor", label: "Doctor" }, { value: "admin", label: "Administrativo" },
];
const home: NavigationEntry = { to: "/home", label: "Inicio", icon: "home" };
const agenda: NavigationEntry = { to: "/agenda", label: "Agenda", icon: "agenda" };
const cash: NavigationEntry = { to: "/caja", label: "Caja", icon: "cash" };
const inbox: NavigationEntry = { to: "/aprobaciones", label: "Bandeja", icon: "inbox" };
const canvas: NavigationEntry = { to: "/lienzo", label: "Lienzo", icon: "canvas" };
const trail: NavigationEntry = { to: "/agente", label: "Rastro", icon: "trail" };
const NAVIGATION: Record<ShellRole, readonly NavigationEntry[]> = {
  dueno: [home, { to: "/direccion", label: "Dirección", icon: "trail" }, agenda, cash, inbox, canvas, trail],
  doctor: [home, { to: "/jornada", label: "Mi jornada", icon: "agenda" }, { to: "/atencion", label: "Atención", icon: "patient" }, { ...agenda, label: "Mi agenda" }, canvas, trail],
  admin: [home, { to: "/mi-turno", label: "Mi turno", icon: "agenda" }, inbox, agenda, cash, canvas, trail],
};
export function getNavigation(role: ShellRole): readonly NavigationEntry[] { return NAVIGATION[role]; }
export function navigationTitle(path: string, role: ShellRole): string {
  return NAVIGATION[role].find(item => path === item.to || path.startsWith(`${item.to}/`))?.label
    ?? ({ "/pacientes": "Pacientes", "/inventario": "Inventario", "/productividad": "Productividad", "/chat": "Chat", "/asistente": "Asistente", "/configuracion": "Configuración" } as Record<string, string>)[path] ?? "Inicio";
}
