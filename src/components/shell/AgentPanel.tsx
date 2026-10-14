"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export interface AgentPanelProps { open: boolean; viewing: string; onClose: () => void; children?: ReactNode }
/** Nonmodal thread: keep visible shell controls reachable, excluding the covered view. */
export function AgentPanel({ open, viewing, onClose, children }: AgentPanelProps) {
  const root = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus();
    // Match shell.css: below 1181px the panel overlays the view. Native inert
    // excludes its controls from keyboard, pointer and assistive-tech traversal.
    const view = document.getElementById("main-content");
    const wasInert = view?.inert ?? false;
    const overlay = window.matchMedia("(max-width: 1180px)");
    const syncCoveredView = () => {
      if (!view) return;
      if (overlay.matches && view.contains(document.activeElement)) closeButton.current?.focus();
      view.inert = wasInert || overlay.matches;
    };
    syncCoveredView();
    overlay.addEventListener("change", syncCoveredView);
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // A stacked Modal/Drawer or persona menu owns its own Escape.
      if (document.querySelector('[aria-modal="true"], .persona-menu, .global-search--open')) return;
      event.preventDefault();
      close.current();
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
      overlay.removeEventListener("change", syncCoveredView);
      if (view) view.inert = wasInert;
      if (previous?.isConnected && (root.current?.contains(document.activeElement) || document.activeElement === document.body)) previous.focus();
    };
  }, [open]);
  return <aside ref={root} id="agent-panel" className="agent-panel" aria-label="Asistente AIRI" hidden={!open}>
    <header className="agent-panel__header"><strong>AIRI <span>· asistente</span></strong><button ref={closeButton} type="button" className="shell-icon-button" aria-label="Cerrar asistente" onClick={onClose}><X size={18} aria-hidden="true" /></button></header>
    <p className="agent-panel__context">Viendo: <strong>{viewing}</strong></p>
    <div className="agent-panel__body" aria-live="polite">{children}</div>
  </aside>;
}
