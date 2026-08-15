import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  icon?: LucideIcon;
  compact?: boolean;
}

export function Button({ variant = "secondary", icon: Icon, compact, className = "", children, ...props }: ButtonProps) {
  return (
    <button className={`button button--${variant} ${compact ? "button--compact" : ""} ${className}`} {...props}>
      {Icon && <Icon size={18} strokeWidth={2} aria-hidden="true" />}
      {children}
    </button>
  );
}
