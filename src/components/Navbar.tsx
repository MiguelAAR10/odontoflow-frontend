import { Bot, Boxes, CalendarDays, MessageCircleMore, Mic, Users, WalletCards } from "lucide-react";
import { NavLink } from "react-router-dom";
import { voiceEnabled } from "../voice";

const baseItems = [
  { to: "/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/agente", label: "Agente IA", icon: Bot },
  { to: "/pacientes", label: "Pacientes", icon: Users },
  { to: "/caja", label: "Caja", icon: WalletCards },
  { to: "/inventario", label: "Inventario", icon: Boxes },
  { to: "/chat", label: "Chat", icon: MessageCircleMore },
];

// Contributed by Alejandro Marcelo (donor c0f418d).
const voiceItem = { to: "/asistente", label: "Asistente", icon: Mic };

const items = voiceEnabled ? [...baseItems, voiceItem] : baseItems;

export function Navbar({ mobileOpen, onNavigate }: { mobileOpen: boolean; onNavigate: () => void }) {
  return (
    <nav className={`main-nav ${mobileOpen ? "main-nav--open" : ""}`} aria-label="Navegación principal">
      {/* The donor tightened .nav-link globally so a 7th item would fit below
          1600px (verified at 1280 and 1440). Applied as a modifier instead of
          globally, so the default 6-item layout is untouched when voice is off. */}
      <div className={`main-nav__links ${voiceEnabled ? "main-nav__links--dense" : ""}`}>
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
