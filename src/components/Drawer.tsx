"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface DrawerProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: "regular" | "wide";
}

export function Drawer({ title, open, onClose, children, width = "regular" }: DrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", close);
    drawerRef.current?.focus();
    return () => document.removeEventListener("keydown", close);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="drawer-layer" role="presentation">
      <button className="drawer-backdrop" type="button" aria-label="Cerrar detalle" onClick={onClose} />
      <aside
        ref={drawerRef}
        className={`drawer drawer--${width}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        tabIndex={-1}
      >
        <header className="drawer__header">
          <h2 id="drawer-title">{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar detalle">
            <X size={21} aria-hidden="true" />
          </button>
        </header>
        <div className="drawer__body">{children}</div>
      </aside>
    </div>
  );
}
