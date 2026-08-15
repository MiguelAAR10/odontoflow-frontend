import { Bot, Boxes, CalendarDays, MessageCircleMore, Users, WalletCards } from "lucide-react";
import { NavLink } from "react-router-dom";

const items = [
  { to: "/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/agente", label: "Agente IA", icon: Bot },
  { to: "/pacientes", label: "Pacientes", icon: Users },
  { to: "/caja", label: "Caja", icon: WalletCards },
  { to: "/inventario", label: "Inventario", icon: Boxes },
  { to: "/chat", label: "Chat", icon: MessageCircleMore },
];

export function Navbar({ mobileOpen, onNavigate }: { mobileOpen: boolean; onNavigate: () => void }) {
  return (
    <nav className={`main-nav ${mobileOpen ? "main-nav--open" : ""}`} aria-label="Navegación principal">
      <div className="main-nav__links">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} onClick={onNavigate} className={({ isActive }) => `nav-link ${isActive ? "nav-link--active" : ""}`}>
            <Icon size={23} strokeWidth={1.9} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
