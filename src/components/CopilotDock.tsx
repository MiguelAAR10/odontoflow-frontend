"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Mic, Send } from "lucide-react";
import Link from "next/link";
import { voiceEnabled } from "../voice";
import { Button } from "./Button";

const starters = [
  "Quién falta confirmar hoy",
  "Cobra el saldo pendiente",
  "Manda el recordatorio de WhatsApp",
];

type Line = { from: "user" | "copilot"; text: string };

export function CopilotDock() {
  const [canDictate, setCanDictate] = useState(false);
  const [draft, setDraft] = useState("");
  useEffect(() => { setCanDictate(voiceEnabled); }, []);
  const [lines, setLines] = useState<Line[]>([
    {
      from: "copilot",
      text: "Soy el copiloto de la clínica. Todavía no ejecuto citas ni cobros: eso lo decide FastAPI. CopilotKit es el marco para enchufarme.",
    },
  ]);

  const ask = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setLines((current) => [
      ...current,
      { from: "user", text: trimmed },
      {
        from: "copilot",
        text: "Anotado. Cuando CopilotKit hable con /agent-tools del backend, esto va a disparar una acción. Hoy no toco precios, cupos ni caja.",
      },
    ]);
    setDraft("");
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    ask(draft);
  };

  return (
    <aside className="copilot-dock" id="copiloto" aria-labelledby="copilot-title">
      <div className="copilot-dock__head">
        <div>
          <p className="copilot-dock__eyebrow">CopilotKit</p>
          <h2 id="copilot-title">Copiloto</h2>
        </div>
        {canDictate ? (
          <Link className="button button--ghost button--compact" href="/asistente">
            <Mic size={16} aria-hidden="true" /> Dictar
          </Link>
        ) : (
          <span className="copilot-dock__muted">Dictado apagado</span>
        )}
      </div>
      <p className="copilot-dock__hint">Memoria del día. No inventa pagos ni agenda.</p>
      <div className="copilot-dock__log" role="log" aria-live="polite">
        {lines.map((line, index) => (
          <p key={`${line.from}-${index}`} className={`copilot-line copilot-line--${line.from}`}>
            {line.text}
          </p>
        ))}
      </div>
      <div className="copilot-dock__starters">
        {starters.map((starter) => (
          <button key={starter} type="button" className="copilot-chip" onClick={() => ask(starter)}>
            {starter}
          </button>
        ))}
      </div>
      <form className="copilot-dock__form" onSubmit={submit}>
        <label className="sr-only" htmlFor="copilot-input">Mensaje al copiloto</label>
        <input
          id="copilot-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Pregunta o pide una acción"
          autoComplete="off"
        />
        <Button variant="primary" compact type="submit" icon={Send} aria-label="Enviar">
          Enviar
        </Button>
      </form>
    </aside>
  );
}
