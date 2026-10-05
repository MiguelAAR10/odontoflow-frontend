"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, Boxes, Building2, CalendarDays, ChartNoAxesCombined, ClipboardCheck, FlaskConical, LayoutDashboard, Landmark, ListChecks, MessageCircle, Mic, Stethoscope, Users, WalletCards } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDemoRole, type ProductRole } from "../roles";
import { useOdontoRepository } from "../api";
import { voiceEnabled } from "../voice";
import { BrandLogo } from "./BrandLogo";

type SidebarEntry = { to: string; label: string; icon: typeof CalendarDays; roles: ProductRole[] };
const groups: Array<{ label: string; items: SidebarEntry[] }> = [
  { label: "HOY", items: [{ to: "/", label: "Inicio", icon: LayoutDashboard, roles: ["owner", "admin", "collaborator"] }] },
  {
    label: "OPERACIÓN",
    items: [
      { to: "/agenda", label: "Agenda", icon: CalendarDays, roles: ["admin"] },
      { to: "/pacientes", label: "Pacientes", icon: Users, roles: ["admin"] },
      { to: "/chat", label: "Conversaciones", icon: MessageCircle, roles: ["owner", "admin"] },
      { to: "/solicitudes", label: "Solicitudes", icon: ClipboardCheck, roles: ["admin", "collaborator"] },
    ],
  },
  {
    label: "GESTIÓN",
    items: [
      { to: "/caja", label: "Caja", icon: WalletCards, roles: ["owner", "admin"] },
      { to: "/finanzas", label: "Finanzas", icon: Landmark, roles: ["owner"] },
      { to: "/inventario", label: "Inventario", icon: Boxes, roles: ["owner", "admin"] },
      { to: "/sedes", label: "Sedes", icon: Building2, roles: ["owner"] },
      { to: "/comercial", label: "Comercial", icon: ChartNoAxesCombined, roles: ["owner"] },
      { to: "/produccion", label: "Producción", icon: BarChart3, roles: ["owner"] },
    ],
  },
  {
    label: "CLÍNICA",
    items: [
      { to: "/mis-pacientes", label: "Mis pacientes", icon: Stethoscope, roles: ["collaborator"] },
    ],
  },
];

export function SidebarSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="sidebar-section">
      <p className="sidebar-section__label">{label}</p>
      {children}
    </div>
  );
}

export function SidebarItem({ item, onNavigate }: { item: SidebarEntry; onNavigate: () => void }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const Icon = item.icon;
  const active = ready && (item.to === "/" ? pathname === "/" : pathname === item.to || pathname.startsWith(`${item.to}/`));
  return (
    <Link href={item.to} onClick={onNavigate} className={`sidebar-item ${active ? "sidebar-item--active" : ""}`} aria-current={active ? "page" : undefined}>
      <Icon size={19} strokeWidth={1.9} aria-hidden="true" /><span>{item.label}</span>
    </Link>
  );
}

export function AppSidebar({ mobileOpen, onNavigate }: { mobileOpen: boolean; onNavigate: () => void }) {
  const [showVoice, setShowVoice] = useState(false);
  const [role, , ready] = useDemoRole();
  const { snapshot } = useOdontoRepository();
  const footerLabel = role === "owner"
    ? "Todas las sedes"
    : role === "admin"
      ? snapshot.locations.find((location) => location.id === snapshot.actor.locationId)?.name ?? "Sede asignada"
      : snapshot.practitioners.find((practitioner) => practitioner.id === snapshot.actor.practitionerId)?.name ?? "Doctor";
  useEffect(() => { setShowVoice(voiceEnabled); }, []);
  return (
    <aside className={`app-sidebar ${mobileOpen ? "app-sidebar--open" : ""}`} aria-label="Navegación principal">
      <Link className="sidebar-brand" href="/" onClick={onNavigate} aria-label="Ir al inicio">
        <BrandLogo variant="horizontal" priority />
      </Link>
      <nav className="sidebar-nav">
        {ready && groups.map((group) => {
          const items = group.items.filter((item) => item.roles.includes(role));
          if (items.length === 0) return null;
          return (
          <SidebarSection key={group.label} label={group.label}>
            {items.map((item) => <SidebarItem key={item.to} item={item.to === "/" && role === "collaborator" ? { ...item, to: "/mi-dia", label: "Mi día" } : item} onNavigate={onNavigate} />)}
          </SidebarSection>
          );
        })}
        {ready && showVoice && role === "collaborator" && (
          <SidebarSection label="VOZ">
            <SidebarItem item={{ to: "/asistente", label: "Dictado", icon: Mic, roles: ["collaborator"] }} onNavigate={onNavigate} />
          </SidebarSection>
        )}
      </nav>
      <div className="sidebar-footer"><span className="sidebar-footer__dot" />{footerLabel}</div>
    </aside>
  );
}
