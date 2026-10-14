"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAgent } from "../../agui/useAgent";
import { agentStore } from "../../agui/store";
import { toApiError } from "../../api";
import { useShellContext } from "./ShellContext";
import { Thread, moveThread } from "./Thread";
import { X } from "lucide-react";
export interface AgentPanelProps { open: boolean; viewing: string; onClose: () => void; children?: ReactNode }
/** Nonmodal thread: keep visible shell controls reachable, excluding the covered view. */
export function AgentPanel({ open, viewing, onClose, children }: AgentPanelProps) {
  const agent = useAgent();
  const [panelError, setPanelError] = useState("");
  const body = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const previousQueries = useRef(agent.queries);
  useEffect(() => {
    if (previousQueries.current !== agent.queries) { follow.current = true; previousQueries.current = agent.queries; }
    if (open && follow.current && body.current) body.current.scrollTop = body.current.scrollHeight;
  }, [agent.thread, agent.run.what, agent.queries, open]);
  const router = useRouter();
  const pathname = usePathname();
  const { role } = useShellContext();
  const previousOpen = useRef(false);
  useEffect(() => {
    if (previousOpen.current !== open) {
      previousOpen.current = open;
      agentStore.setPanelOpen(open);
      if (open) agentStore.setDocked(true);
    } else if (open && !agent.panelOpen) onClose();
  }, [open, agent.panelOpen, onClose]);
  const closePanel = () => { agent.closePanel(); onClose(); };
  const center = () => moveThread(() => { agent.toCenter(); onClose(); router.push("/home"); });
  const root = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  close.current = closePanel;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Focus changes only on explicit panel opening, never on stream updates.
    const composer = document.querySelector<HTMLInputElement>(".airi-interaction input");
    if (previous?.matches("[data-airi-input]") || !previous || previous === document.body) composer?.focus({ preventScroll: true });
    else closeButton.current?.focus({ preventScroll: true });
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
    <header className="agent-panel__header"><strong>AIRI <span>· asistente</span></strong><button ref={closeButton} type="button" className="shell-icon-button" aria-label="Cerrar asistente" onClick={closePanel}><X size={18} aria-hidden="true" /></button></header>
    <p className="agent-panel__context">Viendo: <strong>{viewing}</strong></p>
    <div ref={body} className="agent-panel__body" onScroll={event => { const el = event.currentTarget; follow.current = el.scrollHeight - el.clientHeight - el.scrollTop < 72; }}>
      {open && agent.docked ? <Thread location="panel" /> : null}
      {!agent.queries ? <p>¿Qué necesitas resolver? La conversación te acompaña entre vistas.</p> : null}
      {children}
    </div>
    <footer className="airi-panel-footer">
      {agent.docked && agent.queries ? <button type="button" className="airi-panel-center" onClick={center}>Traer al centro</button> : null}
      <button type="button" className="airi-panel-suggestion" disabled={agent.working} onClick={() => {
        void agent.send("Resume esta vista", { role, view: pathname.replace(/^\//, ""), viewing }).catch(error => { setPanelError(toApiError(error).message); });
      }}>Resume esta vista</button>
      {panelError ? <p role="alert">{panelError}</p> : null}
    </footer>
    <style>{`
      .airi-panel-footer{display:flex;flex-wrap:wrap;gap:8px;padding:12px 16px;border-top:1px solid var(--line);background:var(--surface)}
      .airi-panel-footer button{min-height:38px;padding:7px 10px;border:1px solid var(--line-2);border-radius:10px;background:var(--surface);color:var(--ink-2);font-size:13px}
      @media(max-width:760px){.airi-panel-footer{padding-bottom:90px}.airi-shell .agent-panel__body{padding-bottom:16px}}
    `}</style>
  </aside>;
}
