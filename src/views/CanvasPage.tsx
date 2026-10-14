"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Focus, LayoutList, MessageCircle, Network } from "lucide-react";
import { useAgent } from "../agui/useAgent";
import { toApiError } from "../api";
import { Card } from "../catalog/Card";
import { Status } from "../catalog/Status";
import { Modal } from "../components/Modal";
import { CanvasThread } from "../canvas/CanvasThread";
import { useShellContext } from "../components/shell/ShellContext";
import { CanvasBoundary } from "../canvas/CanvasBoundary";
import { canvasProjection } from "../canvas/model";
import { useCanvasTheme } from "../canvas/useCanvasTheme";
import type { CanvasControls } from "../canvas/ExcalidrawCanvas";
import "../canvas/canvas.css";

const Canvas = dynamic(() => import("../canvas/ExcalidrawCanvas"), {
  ssr: false,
  loading: () => <p className="canvas-loading" role="status">Preparando el lienzo…</p>,
});

export function CanvasPage() {
  const agent = useAgent();
  const { role } = useShellContext();
  const theme = useCanvasTheme();
  const [threadOpen, setThreadOpen] = useState(false);
  const [showList, setShowList] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const controls = useRef<CanvasControls | null>(null);
  const onReady = useCallback((next: CanvasControls) => { controls.current = next; }, []);
  const projection = useMemo(() => canvasProjection(agent), [agent.thread, agent.cards]);
  const context = { role, view: "lienzo", viewing: "Lienzo" };
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((!event.metaKey && !event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "k") return;
      if (document.querySelector('[aria-modal="true"]') && !document.querySelector(".canvas-thread")) return;
      event.preventDefault();
      event.stopPropagation();
      setThreadOpen(open => !open);
    };
    window.addEventListener("keydown", shortcut, true);
    return () => window.removeEventListener("keydown", shortcut, true);
  }, []);
  async function send(text: string) {
    setError("");
    try { await agent.send(text, context); }
    catch (caught) { setError(toApiError(caught).message); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!input.trim() || agent.working) return;
    void send(input);
    setInput("");
  }
  const choices = role === "admin" ? [
    { label: "Relacionar huecos", text: "Relaciona los huecos de la tarde con pacientes en espera" },
    { label: "Traer cobranza", text: "Trae la cobranza al lienzo" },
  ] : role === "dueno" ? [{ label: "Comparar sedes", text: "Compara las sedes" }] : [];
  return <section className="airi-canvas" aria-label="Lienzo libre">
    <header className="canvas-header">
      <Link href="/home" className="canvas-back" aria-label="Volver a Inicio"><ArrowLeft size={18} aria-hidden="true" /></Link>
      <div className="canvas-heading"><h1>Lienzo libre</h1><p>Relaciona evidencia y decide en las tarjetas.</p></div>
      <div className="canvas-header-actions">
        <button type="button" onClick={() => controls.current?.fit()} aria-label="Encuadrar tarjetas"><Focus size={17} aria-hidden="true" /><span>Encuadrar</span></button>
        <button type="button" aria-pressed={showList} onClick={() => setShowList(value => !value)}><LayoutList size={17} aria-hidden="true" />{showList ? "Ver lienzo" : "Ver lista"}</button>
        <button type="button" className="canvas-thread-toggle" aria-haspopup="dialog" onClick={() => setThreadOpen(true)}><MessageCircle size={17} aria-hidden="true" />Abrir hilo <kbd>⌘K</kbd></button>
      </div>
    </header>
    {agent.run.status !== "idle" ? <div className="canvas-progress"><Status text={agent.run.what || "Preparando el caso…"} state={agent.run.status} agent={agent.run.agent} plan={agent.run.plan} onStop={agent.stop} /></div> : null}
    {error ? <p className="canvas-error" role="alert">{error}</p> : null}
    <div className="canvas-stage" data-list-open={showList}>
      <CanvasBoundary onList={() => setShowList(true)}><Canvas projection={projection} theme={theme} showList={showList} onReady={onReady} onApprove={agent.approve} /></CanvasBoundary>
      {showList ? <div className="canvas-list" aria-label="Tarjetas del lienzo">
        {projection.cards.length ? projection.cards.map(entry => <Card key={entry.card.id} card={entry.card} status={entry.status} error={entry.error} loadingReason={entry.loadingReason} onApprove={card => agent.approve(card.id)} />)
          : <p>Aún no hay tarjetas. Abre el hilo y pide a AIRI que traiga un caso.</p>}
        {projection.arrow ? <p className="canvas-list-relation">{projection.cards.find(entry => entry.card.id === projection.arrow?.from)?.card.title} → {projection.arrow.label} → {projection.cards.find(entry => entry.card.id === projection.arrow?.to)?.card.title}</p> : null}
      </div> : null}
      {!projection.cards.length && !showList ? <div className="canvas-empty"><div>
        <Network size={54} strokeWidth={1.3} aria-hidden="true" /><h2>Un espacio para pensar con AIRI</h2>
        <p>Trae un caso. El agente coloca la evidencia, conecta las tarjetas y espera tu decisión.</p>
        <div className="canvas-choices">{choices.map(choice => <button type="button" disabled={agent.working} key={choice.label} onClick={() => void send(choice.text)}>{choice.label}</button>)}
          {!choices.length ? <button type="button" onClick={() => setThreadOpen(true)}>Abrir hilo</button> : null}</div>
      </div></div> : null}
    </div>
    <Modal title="Hilo de AIRI" open={threadOpen} onClose={() => setThreadOpen(false)} size="large">
      <div className="canvas-thread">
        <p className="canvas-thread-context">Viendo: <strong>Lienzo</strong></p>
        {!agent.queries ? <p>Pide a AIRI que traiga un caso al lienzo.</p> : null}
        <CanvasThread />
        <form onSubmit={submit} className="canvas-composer"><label htmlFor="canvas-intent">Tu intención</label>
          <div><input autoFocus id="canvas-intent" data-airi-input value={input} onChange={event => setInput(event.target.value)} placeholder="¿Qué quieres relacionar?" />
            <button type="submit" disabled={agent.working || !input.trim()}>Enviar</button></div></form>
        {error ? <p role="alert" className="canvas-error">{error}</p> : null}
      </div>
    </Modal>
  </section>;
}
