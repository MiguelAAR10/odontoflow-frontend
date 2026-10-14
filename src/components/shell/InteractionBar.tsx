"use client";
import { ArrowUp, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { useAgent } from "../../agui/useAgent";
import { navigationTitle } from "../../nav";
import { toApiError } from "../../api";
import { useShellContext } from "./ShellContext";
import { usePersona } from "../PersonaContext";

export interface InteractionBarProps {
  onSubmit: (intent: string) => void;
  onOpenPanel?: () => void;
  disabled?: boolean;
}
export function InteractionBar({ onSubmit, onOpenPanel, disabled = false }: InteractionBarProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const agent = useAgent();
  const pathname = usePathname();
  const { role } = useShellContext();
  const { version, current } = usePersona();
  useEffect(() => { setValue(""); setError(""); }, [role, version, current]);
  // The shell supplies inline callbacks. Only a store transition requests an
  // opening; a parent rerender after closing must never reopen the panel.
  const openPanel = useRef(onOpenPanel);
  openPanel.current = onOpenPanel;
  useEffect(() => { if (agent.panelOpen) openPanel.current?.(); }, [agent.panelOpen]);
  const home = pathname === "/home" || pathname === "/";
  const viewing = navigationTitle(pathname, role);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const intent = value.trim();
    if (!intent || disabled || agent.working) return;
    setValue(""); setError("");
    onSubmit(intent);
    void agent.send(intent, { role, view: pathname.replace(/^\//, ""), viewing }).catch(caught => setError(toApiError(caught).message));
  };
  return <div className={`interaction-bar airi-interaction ${home && !agent.panelOpen ? "airi-interaction--home" : ""}`} role="region" aria-label="Conversación con AIRI">
    <button className="interaction-bar__thread shell-icon-button" type="button" aria-label={`Ver hilo ${agent.queries}`} onClick={() => { agent.openPanel(); onOpenPanel?.(); }}><MessageCircle size={20} aria-hidden="true" /></button>
    <form onSubmit={submit}>
      <input data-airi-input aria-label="Pregúntale a AIRI" placeholder={agent.working ? "AIRI está trabajando…" : `Pregunta sobre ${viewing}…`} autoComplete="off" value={value} disabled={disabled} onChange={event => setValue(event.target.value)} />
      <button type="submit" className="interaction-bar__send" aria-label="Enviar" disabled={disabled || agent.working || !value.trim()}><ArrowUp size={20} aria-hidden="true" /></button>
    </form>
    {!agent.panelOpen && agent.queries > 0 ? <button className="airi-bar-label" type="button" onClick={() => { agent.openPanel(); onOpenPanel?.(); }}>Ver hilo {agent.queries}</button> : null}
    {agent.working && !agent.panelOpen ? <button className="airi-bar-label" type="button" onClick={agent.stop}>Detener</button> : null}
    {error ? <p role="alert">{error}</p> : null}
    <style>{`
      .airi-interaction--home{display:none}
      .airi-bar-label{flex:none;border:1px solid var(--line);border-radius:24px;min-height:38px;padding:4px 10px;background:var(--surface);color:var(--ink-2);font-size:13px}
      .airi-interaction>p{position:absolute;bottom:100%;background:var(--surface);color:var(--red-ink);padding:10px;border:1px solid var(--line);border-radius:10px}
      @media(max-width:760px){.airi-bar-label{font-size:12px;padding-inline:7px}}
    `}</style>
  </div>;
}
