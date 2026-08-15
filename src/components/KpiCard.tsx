import type { LucideIcon } from "lucide-react";
import type { Tone } from "../types";

interface KpiCardProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  tone: Tone;
}

export function KpiCard({ icon: Icon, value, label, tone }: KpiCardProps) {
  return (
    <article className="kpi-card">
      <span className={`kpi-card__icon tone-bg--${tone}`}><Icon size={31} strokeWidth={2} aria-hidden="true" /></span>
      <span className="kpi-card__copy"><strong>{value}</strong><small>{label}</small></span>
    </article>
  );
}
