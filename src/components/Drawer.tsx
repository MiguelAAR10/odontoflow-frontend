"use client";

import { useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useFocusTrap } from "./useFocusTrap";

interface DrawerProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: "regular" | "wide";
  /** Optional extra class on the overlay layer, so a caller can restyle the
   *  panel (e.g. a mobile bottom sheet) without changing drawer behaviour. */
  layerClassName?: string;
}

export function Drawer({ title, open, onClose, children, width = "regular", layerClassName = "" }: DrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);

  useFocusTrap(drawerRef, open, onClose);

  if (!open) return null;

  return (
    <div className={`drawer-layer${layerClassName ? ` ${layerClassName}` : ""}`} role="presentation">
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
