"use client";

import { Bot, Boxes, CalendarDays, MessageCircleMore, Mic, Users, WalletCards } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { voiceEnabled } from "../voice";
import { BrandLogo } from "./BrandLogo";

type SidebarEntry = { to: string; label: string; icon: typeof CalendarDays };
const groups: Array<{ label: string; items: SidebarEntry[] }> = [
  { label: "OPERACIÓN", items: [{ to: "/agenda", label: "Agenda", icon: CalendarDays }, { to: "/pacientes", label: "Pacientes", icon: Users }] },
  { label: "GESTIÓN", items: [{ to: "/caja", label: "Caja", icon: WalletCards }, { to: "/inventario", label: "Inventario", icon: Boxes }] },
  { label: "IA & CANALES", items: [{ to: "/agente", label: "Agente IA", icon: Bot }, { to: "/chat", label: "Chat", icon: MessageCircleMore }, ...(voiceEnabled ? [{ to: "/asistente", label: "Asistente", icon: Mic }] : [])] },
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

export function AppSidebar({ mobileOpen, onNavigate }: { mobileOpen: boolean; onNavigate: () => void }) {
  return <aside className={`app-sidebar ${mobileOpen ? "app-sidebar--open" : ""}`} aria-label="Navegación principal">
    <Link className="sidebar-brand" href="/agenda" onClick={onNavigate} aria-label="Ir a la agenda"><BrandLogo variant="horizontal" priority /></Link>
    <nav className="sidebar-nav">
      {groups.map((group) => <SidebarSection key={group.label} label={group.label}>{group.items.map((item) => <SidebarItem key={item.to} item={item} onNavigate={onNavigate} />)}</SidebarSection>)}
    </nav>
    <div className="sidebar-footer"><span className="sidebar-footer__dot" />OdontoFlow workspace</div>
  </aside>;
}
