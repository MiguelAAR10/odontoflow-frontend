"use client";

import { Activity, Boxes, CalendarDays, ChartColumn, Check, ChevronsUpDown, ClipboardCheck, House, MessageCircleMore, Mic, Settings, Users, WalletCards } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { voiceEnabled } from "../voice";
import { canOpen, useMocks } from "../api";
import { BrandLogo } from "./BrandLogo";
import { usePersona } from "./PersonaContext";

type SidebarEntry = { to: string; label: string; icon: typeof CalendarDays };
const groups: Array<{ label: string; items: SidebarEntry[] }> = [
  { label: "OPERACIÓN", items: [{ to: "/home", label: "Inicio", icon: House }, { to: "/agenda", label: "Agenda", icon: CalendarDays }, { to: "/pacientes", label: "Pacientes", icon: Users }, { to: "/aprobaciones", label: "Bandeja", icon: ClipboardCheck }] },
  { label: "GESTIÓN", items: [{ to: "/caja", label: "Caja", icon: WalletCards }, { to: "/inventario", label: "Inventario", icon: Boxes }, { to: "/productividad", label: "Productividad", icon: ChartColumn }] },
  { label: "IA & CANALES", items: [{ to: "/agente", label: "Actividad", icon: Activity }, { to: "/chat", label: "Chat", icon: MessageCircleMore }, ...(voiceEnabled ? [{ to: "/asistente", label: "Asistente", icon: Mic }] : [])] },
];

export function SidebarSection({ label, children }: { label: string; children: ReactNode }) {
  return <div className="sidebar-section"><p className="sidebar-section__label">{label}</p>{children}</div>;
}

export function SidebarItem({ item, onNavigate }: { item: SidebarEntry; onNavigate: () => void }) {
  const pathname = usePathname();
  const Icon = item.icon;
  const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
  return <Link href={item.to} onClick={onNavigate} className={`sidebar-item ${active ? "sidebar-item--active" : ""}`} aria-current={active ? "page" : undefined}>
    <Icon size={19} strokeWidth={1.9} aria-hidden="true" /><span>{item.label}</span>
  </Link>;
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "?";
const ROLE_LABEL: Record<string, string> = { secretaria: "Secretaria", administrador: "Administrador" };

/** Who is acting, from `GET /me`; the menu switches between the demo staff
 * personas the server has credentials for. */
function PersonaSwitcher() {
  const { identity, personas, current, loading, switching, error, switchTo } = usePersona();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => { document.removeEventListener("mousedown", closeOutside); document.removeEventListener("keydown", closeWithEscape); };
  }, [open]);

  const human = identity?.principalType === "human";
  const name = loading ? "Cargando…" : human ? identity.displayName : "Elegir persona";
  const role = loading ? "" : human ? `${identity.roles.join(" · ") || "Sin rol"}${useMocks ? " · Demo" : ""}` : identity ? "Sin persona: acceso de integración" : "Sin sesión";

  // The trigger stays enabled (and focused) while switching: disabling it
  // would drop keyboard focus to <body>.
  const choose = async (key: string) => {
    setOpen(false);
    triggerRef.current?.focus();
    if (key !== current) await switchTo(key);
  };

  return <div className="persona-switcher" ref={rootRef}>
    {open && <div className="persona-menu" id={menuId} role="group" aria-label="Cambiar de persona">
      <p className="persona-menu__label">Actuar como</p>
      {personas.length === 0
        ? <p className="persona-menu__empty">No hay personas configuradas en el servidor.</p>
        : personas.map((persona) => {
          const selected = persona.key === current;
          return <button key={persona.key} type="button" className="persona-menu__option" aria-pressed={selected} onClick={() => void choose(persona.key)}>
            <span className="sidebar-profile__avatar" aria-hidden="true">{initials(persona.displayName)}</span>
            <span><strong>{persona.displayName}</strong><small>{ROLE_LABEL[persona.role] ?? persona.role}</small></span>
            {selected && <Check size={16} aria-hidden="true" />}
          </button>;
        })}
    </div>}
    <button ref={triggerRef} type="button" className="sidebar-profile persona-switcher__trigger" aria-expanded={open} aria-controls={open ? menuId : undefined} aria-busy={loading || switching} onClick={() => { if (!loading && !switching) setOpen((value) => !value); }}>
      <span className="sidebar-profile__avatar" aria-hidden="true">{human ? initials(identity.displayName) : "?"}</span>
      <span className="persona-switcher__text"><strong>{switching ? "Cambiando…" : name}</strong><small>{role}</small></span>
      <ChevronsUpDown size={16} aria-hidden="true" />
      <span className="sr-only">Cambiar de persona</span>
    </button>
    {error && <p className="persona-switcher__error" role="alert">{error}</p>}
  </div>;
}

export function AppSidebar({ mobileOpen, onNavigate }: { mobileOpen: boolean; onNavigate: () => void }) {
  const { identity } = usePersona();
  // Modules are shown from the backend's permissions (`/me`), never from role names.
  const visibleGroups = groups
    .map((group) => ({ ...group, items: group.items.filter((item) => canOpen(identity, item.to)) }))
    .filter((group) => group.items.length > 0);
  return <aside className={`app-sidebar ${mobileOpen ? "app-sidebar--open" : ""}`} aria-label="Navegación principal">
    <Link className="sidebar-brand" href="/agenda" onClick={onNavigate} aria-label="Ir a la agenda"><BrandLogo variant="horizontal" priority /></Link>
    <nav className="sidebar-nav">
      {visibleGroups.map((group) => <SidebarSection key={group.label} label={group.label}>{group.items.map((item) => <SidebarItem key={item.to} item={item} onNavigate={onNavigate} />)}</SidebarSection>)}
    </nav>
    <div className="sidebar-admin">
      <SidebarItem item={{ to: "/configuracion", label: "Configuración", icon: Settings }} onNavigate={onNavigate} />
      <PersonaSwitcher />
    </div>
  </aside>;
}
