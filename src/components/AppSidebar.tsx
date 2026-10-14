"use client";

import { Boxes, ChartColumn, ChevronsUpDown, MessageCircleMore, Mic, PanelLeftClose, PanelLeftOpen, Settings, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { voiceEnabled } from "../voice";
import { canOpen, useMocks } from "../api";
import { PersonaPicker, usePersona } from "./PersonaContext";

import { getNavigation, type NavigationEntry } from "../nav";
import { useShellContext } from "./shell/ShellContext";
import { ClayIcon } from "./shell/ClayIcon";
import { useFocusTrap } from "./useFocusTrap";

export function SidebarSection({ label, children }: { label: string; children: ReactNode }) {
  return <div className="sidebar-section"><p className="sidebar-section__label">{label}</p>{children}</div>;
}
export function SidebarItem({ item, onNavigate }: { item: NavigationEntry; onNavigate: () => void }) {
  const pathname = usePathname();
  const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
  return <Link href={item.to} title={item.label} onClick={onNavigate} className={`sidebar-item ${active ? "sidebar-item--active" : ""}`} aria-current={active ? "page" : undefined}>
    <ClayIcon name={item.icon} /><span>{item.label}</span>
  </Link>;
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "?";

/** Who is acting, from `GET /me`; the menu switches between the demo staff
 * personas the server has credentials for (asking the access code once). */
function PersonaSwitcher() {
  const { identity, loading, switching, error } = usePersona();
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
  const role = loading ? "" : human ? `${identity.roles.join(" · ") || "Sin rol"}${useMocks ? " · Demo" : ""}` : "Sin sesión";

  // The trigger stays enabled (and focused) while switching: disabling it
  // would drop keyboard focus to <body>.
  const chosen = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return <div className="persona-switcher" ref={rootRef}>
    {open && <div className="persona-menu" id={menuId} role="group" aria-label="Cambiar de persona">
      <p className="persona-menu__label">Actuar como</p>
      <PersonaPicker onChoose={chosen} />
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

export function AppSidebar({ mobileOpen, collapsed, onNavigate, onToggleCollapse }: { mobileOpen: boolean; collapsed: boolean; onNavigate: () => void; onToggleCollapse: () => void }) {
  const { identity } = usePersona();
  const { role } = useShellContext();
  const sidebar = useRef<HTMLElement>(null);
  useFocusTrap(sidebar, mobileOpen, onNavigate);
  const items = getNavigation(role).filter(item => canOpen(identity, item.to));
  return <aside ref={sidebar} tabIndex={-1} id="app-sidebar" className={`app-sidebar ${mobileOpen ? "app-sidebar--open" : ""}`} aria-label="Navegación principal" role={mobileOpen ? "dialog" : undefined} aria-modal={mobileOpen || undefined}>
    <div className="sidebar-heading"><span>{({ dueno: "Dirección", doctor: "Consulta", admin: "Operación" })[role]}</span>
      <button className="shell-icon-button sidebar-collapse" type="button" onClick={onToggleCollapse} aria-label={collapsed ? "Expandir navegación" : "Plegar navegación"} aria-expanded={!collapsed} title="Plegar navegación (⌘B)">{collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button>
      <button className="shell-icon-button sidebar-mobile-close" type="button" onClick={onNavigate} aria-label="Cerrar navegación"><X size={18} /></button>
    </div>
    <nav className="sidebar-nav">{items.map(item => <SidebarItem key={item.to} item={item} onNavigate={onNavigate} />)}</nav>
    <div className="sidebar-admin">
      <details className="shell-more"><summary title="Más secciones"><span aria-hidden="true">•••</span><span>Más secciones</span></summary><nav aria-label="Más secciones">{[
        { to: "/pacientes", label: "Pacientes", icon: Users }, { to: "/inventario", label: "Inventario", icon: Boxes },
        { to: "/productividad", label: "Productividad", icon: ChartColumn }, { to: "/chat", label: "Chat", icon: MessageCircleMore },
        ...(voiceEnabled ? [{ to: "/asistente", label: "Asistente de voz", icon: Mic }] : []),
      ].filter(item => canOpen(identity, item.to)).map(item => <Link key={item.to} href={item.to} title={item.label} onClick={onNavigate} className="sidebar-item"><span className="shell-clay" aria-hidden="true"><item.icon size={19} /></span><span>{item.label}</span></Link>)}</nav></details>
      <Link className="sidebar-item" href="/configuracion" title="Configuración" onClick={onNavigate}><span className="shell-clay" aria-hidden="true"><Settings size={19} /></span><span>Configuración</span></Link>
      <PersonaSwitcher />
    </div>
  </aside>;
}
