"use client";
import { ArrowUp, MessageCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
export interface InteractionBarProps {
  onSubmit: (intent: string) => void;
  onOpenPanel?: () => void;
  disabled?: boolean;
}
/** One input seam; wiring to an AgentSource belongs to C1-INICIO. */
export function InteractionBar({ onSubmit, onOpenPanel, disabled = false }: InteractionBarProps) {
  const [value, setValue] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const intent = value.trim();
    if (!intent || disabled) return;
    onSubmit(intent);
    setValue("");
  };
  return <div className="interaction-bar" role="region" aria-label="Conversación con AIRI">
    {onOpenPanel && <button className="interaction-bar__thread shell-icon-button" type="button" aria-label="Abrir conversación" onClick={onOpenPanel}><MessageCircle size={20} aria-hidden="true" /></button>}
    <form onSubmit={submit}>
      <input aria-label="Pregúntale a AIRI" placeholder="Pregúntale a AIRI…" autoComplete="off" value={value} disabled={disabled} onChange={event => setValue(event.target.value)} />
      <button type="submit" className="interaction-bar__send" aria-label="Enviar" disabled={disabled || !value.trim()}><ArrowUp size={20} aria-hidden="true" /></button>
    </form>
  </div>;
}
