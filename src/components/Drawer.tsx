"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

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

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const node = drawerRef.current;
    // Keep an already-focused inner control (e.g. a search input opened with
    // the drawer); otherwise move focus into the dialog.
    if (node && !node.contains(document.activeElement)) node.focus();
    const trapTab = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const focusable = Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null || element === document.activeElement);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trapTab);
    return () => {
      document.removeEventListener("keydown", trapTab);
      previouslyFocused?.focus?.();
    };
  }, [onClose, open]);

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
