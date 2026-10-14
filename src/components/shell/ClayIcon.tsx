import { Activity, CalendarDays, ClipboardCheck, House, PencilRuler, Users, WalletCards } from "lucide-react";
import type { NavigationIcon } from "../../nav";
const ICONS = { home: House, trail: Activity, agenda: CalendarDays, cash: WalletCards, inbox: ClipboardCheck, canvas: PencilRuler, patient: Users };
export function ClayIcon({ name }: { name: NavigationIcon }) {
  const Icon = ICONS[name];
  return <span className={`shell-clay shell-clay--${name}`} aria-hidden="true"><Icon size={19} strokeWidth={2} /></span>;
}
