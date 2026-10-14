"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Excalidraw, convertToExcalidrawElements, CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, AppState } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { ArrowUpRight, Hand, MousePointer2, Pencil, Square } from "lucide-react";
import { Card } from "../catalog/Card";
import { agentStrokeToken, arrowGeometry, cardPosition, overlayTransform, type CanvasProjection } from "./model";
import "@excalidraw/excalidraw/index.css";

export interface CanvasControls { fit: () => void }
export interface ExcalidrawCanvasProps {
  projection: CanvasProjection;
  theme: "light" | "dark";
  showList: boolean;
  onReady: (controls: CanvasControls) => void;
  onApprove: (id: string) => Promise<void>;
}
const tools = [
  { type: "selection", title: "Seleccionar", Icon: MousePointer2 },
  { type: "hand", title: "Mover lienzo", Icon: Hand },
  { type: "freedraw", title: "Dibujar", Icon: Pencil },
  { type: "rectangle", title: "Rectángulo", Icon: Square },
  { type: "arrow", title: "Flecha", Icon: ArrowUpRight },
] as const;
const shapeId = (id: string) => `airi-card:${id}`;
const ARROW_ID = "airi-relation";
const UIOptions = { canvasActions: { changeViewBackgroundColor: false, clearCanvas: false, loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false, toggleTheme: false } } as const;
const initialData = { appState: { viewBackgroundColor: "#F6F6F3", currentItemFontFamily: 2 }, elements: [] };

export default function ExcalidrawCanvas({ projection, theme, showList, onReady, onApprove }: ExcalidrawCanvasProps) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [scene, setScene] = useState<{ elements: readonly ExcalidrawElement[]; state: AppState } | null>(null);
  const onChange = useCallback((elements: readonly ExcalidrawElement[], state: AppState) => setScene({ elements, state }), []);
  const root = useRef<HTMLDivElement>(null);
  const signature = useRef("");
  const projectionRef = useRef(projection);
  projectionRef.current = projection;
  const fit = useCallback(() => {
    if (!api) return;
    const cards = api.getSceneElements().filter(element => element.id.startsWith("airi-card:"));
    api.scrollToContent(cards.length ? cards : undefined, { fitToContent: true, animate: false, maxZoom: 1, viewportZoomFactor: .85 });
  }, [api]);
  useEffect(() => { if (api) onReady({ fit }); }, [api, fit, onReady]);

  useEffect(() => {
    if (!api || !root.current || !scene || scene.state.isLoading) return;
    const current = api.getSceneElementsIncludingDeleted();
    const ids = projection.cards.map(entry => entry.card.id);
    const nextSignature = JSON.stringify([ids, projection.arrow, projection.agent]);
    if (signature.current === nextSignature) return;
    signature.current = nextSignature;
    const color = getComputedStyle(root.current).getPropertyValue(agentStrokeToken(projection.agent)).trim();
    const skeletons: ExcalidrawElementSkeleton[] = ids.filter(id => !current.some(element => element.id === shapeId(id) && !element.isDeleted)).map(id => ({
      id: shapeId(id), type: "rectangle", ...cardPosition(ids.indexOf(id)), width: 350, height: 470,
      locked: true, strokeColor: "transparent", backgroundColor: "transparent", roughness: 0,
    }));
    const added = convertToExcalidrawElements(skeletons, { regenerateIds: false });
    const elements = [...current.filter(element => element.id !== ARROW_ID && (!element.id.startsWith("airi-card:") || ids.some(id => shapeId(id) === element.id))), ...added];
    const relation = projection.arrow;
    const from = relation && elements.find(element => element.id === shapeId(relation.from) && !element.isDeleted);
    const to = relation && elements.find(element => element.id === shapeId(relation.to) && !element.isDeleted);
    if (from && to) elements.push(...convertToExcalidrawElements([{
      id: ARROW_ID, type: "arrow", ...arrowGeometry(from, to), strokeColor: color, strokeWidth: 2,
      roughness: 0, locked: true, endArrowhead: "arrow",
    }], { regenerateIds: false }));
    api.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
    if (added.length) requestAnimationFrame(fit);
  }, [api, projection, fit, scene?.state.isLoading]);

  useEffect(() => {
    if (!api || !root.current || !scene || scene.state.isLoading) return;
    const css = getComputedStyle(root.current);
    const color = css.getPropertyValue(agentStrokeToken(projection.agent)).trim();
    api.updateScene({ appState: { viewBackgroundColor: css.getPropertyValue("--bg").trim(), currentItemStrokeColor: color },
      elements: api.getSceneElementsIncludingDeleted().map(element => element.id === ARROW_ID ? newElementWith(element, { strokeColor: color }) : element),
      captureUpdate: CaptureUpdateAction.NEVER });
  }, [api, theme, projection.agent, scene?.state.isLoading]);

  // Measure the actual catalog card, rather than treating its prose as a fixed
  // height. The connecting arrow must meet the visible card's edge.
  useEffect(() => {
    if (!api || !root.current || !projection.cards.length || showList) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        let changed = false;
        const heights = new Map(Array.from(root.current?.querySelectorAll<HTMLElement>("[data-canvas-card]") ?? []).map(node => [shapeId(node.dataset.canvasCard!), node.offsetHeight]));
        let elements = api.getSceneElementsIncludingDeleted().map(element => {
          const height = heights.get(element.id);
          if (!height || Math.abs(element.height - height) < 1) return element;
          changed = true;
          return newElementWith(element, { height });
        });
        const relation = projectionRef.current.arrow;
        const from = relation && elements.find(element => element.id === shapeId(relation.from));
        const to = relation && elements.find(element => element.id === shapeId(relation.to));
        if (changed && from && to) elements = elements.map(element => element.id === ARROW_ID && element.type === "arrow" ? newElementWith(element, arrowGeometry(from, to)) : element);
        if (changed) { api.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER }); fit(); }
      });
    });
    root.current.querySelectorAll("[data-canvas-card]").forEach(node => observer.observe(node));
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [api, projection.cards, showList, scene?.elements.length, fit]);

  // The HTML handle moves its scene rectangle; controls inside Card retain
  // normal pointer behavior and never turn a human approval into a canvas drag.
  const drag = useRef<{ id: string; startX: number; startY: number; x: number; y: number } | null>(null);
  function startDrag(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (!api || event.button !== 0) return;
    const element = api.getSceneElements().find(element => element.id === shapeId(id));
    if (!element) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: element.id, startX: event.clientX, startY: event.clientY, x: element.x, y: element.y };
  }
  function moveCard(id: string, x: number, y: number) {
    if (!api) return;
    let elements = api.getSceneElementsIncludingDeleted().map(element => element.id === id ? newElementWith(element, { x, y }) : element);
    const relation = projectionRef.current.arrow;
    const from = relation && elements.find(element => element.id === shapeId(relation.from));
    const to = relation && elements.find(element => element.id === shapeId(relation.to));
    if (from && to) elements = elements.map(element => element.id === ARROW_ID && element.type === "arrow" ? newElementWith(element, arrowGeometry(from, to)) : element);
    api.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current;
    if (!api || !start) return;
    const zoom = api.getAppState().zoom.value;
    moveCard(start.id, start.x + (event.clientX - start.startX) / zoom, start.y + (event.clientY - start.startY) / zoom);
  }
  function moveWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    if (!api || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    const element = api.getSceneElements().find(element => element.id === shapeId(id));
    if (!element) return;
    event.preventDefault();
    const step = event.shiftKey ? 40 : 10;
    moveCard(element.id, element.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
      element.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0));
  }
  const activeTool = scene?.state.activeTool.type ?? "selection";
  const rectangles = new Map(scene?.elements.filter(element => !element.isDeleted).map(element => [element.id, element]));
  return <div ref={root} className="canvas-editor" data-canvas-ready={api ? "true" : "false"} data-theme={theme}
    data-scene-elements={scene?.elements.filter(element => !element.isDeleted).length ?? 0} data-agent-arrows={scene?.elements.filter(element => element.id === ARROW_ID && !element.isDeleted).length ?? 0}>
    <Excalidraw excalidrawAPI={setApi} theme={theme} langCode="es-ES" handleKeyboardGlobally={false}
      initialData={initialData}
      onChange={onChange}
      UIOptions={UIOptions} />
    {!showList ? <>
      <div className="canvas-tools" role="group" aria-label="Herramientas del lienzo">
        {tools.map(({ type, title, Icon }) => <button key={type} type="button" title={title} aria-label={title} aria-pressed={activeTool === type}
          onClick={() => api?.setActiveTool({ type })}><Icon size={19} aria-hidden="true" /></button>)}
      </div>
      <div className="canvas-overlays">
        {projection.cards.map(entry => {
          const element = rectangles.get(shapeId(entry.card.id));
          if (!element || !scene) return null;
          return <div className="canvas-card" key={entry.card.id} data-canvas-card={entry.card.id} style={{ width: element.width, transform: overlayTransform(element, scene.state) }}>
            <button className="canvas-drag" type="button" aria-label={`Mover tarjeta: ${entry.card.title}`} title="Arrastra para mover la tarjeta"
              onKeyDown={event => moveWithKeyboard(event, entry.card.id)} onPointerDown={event => startDrag(event, entry.card.id)} onPointerMove={moveDrag}
              onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>⠿ <span>Mover tarjeta</span></button>
            <Card card={entry.card} status={entry.status} error={entry.error} loadingReason={entry.loadingReason} onApprove={card => onApprove(card.id)} />
          </div>;
        })}
        {projection.arrow && scene ? (() => {
          const arrow = rectangles.get(ARROW_ID);
          return arrow ? <span className="canvas-arrow-label" data-arrow-agent={projection.agent} style={{ transform: overlayTransform({ ...arrow, y: arrow.y - 32, angle: 0 }, scene.state) }}>{projection.arrow.label}</span> : null;
        })() : null}
      </div>
    </> : null}
  </div>;
}
