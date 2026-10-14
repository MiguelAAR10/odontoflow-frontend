"use client";

import { useId, useRef, useState } from "react";
import { canApproveCard, type Card as CardDto, type CardStatus } from "../agui/card";
import { AgentLabel } from "./AgentLabel";
import { Layers, Layer } from "./Layers";
import { useAction } from "./useAction";
import { Body } from "./Body";
import { formatMoney } from "./format";

export interface CardActions {
  onApprove?: (card: CardDto) => void | Promise<void>;
  onAlternative?: (card: CardDto) => void | Promise<void>;
  onEdit?: (card: CardDto) => void | Promise<void>;
  onUndo?: (card: CardDto) => void | Promise<void>;
  onSource?: (source: string, card: CardDto) => void | Promise<void>;
}
export interface CardProps extends CardActions {
  card: CardDto;
  status?: CardStatus;
  error?: string | null;
  loadingReason?: "tool" | "approval" | null;
  /** Supplied by the owner of the decision; never invent an undo deadline here. */
  undoRemainingSeconds?: number;
}

export function Card(props: CardProps) {
  return <CardView key={`${props.card.id}:${props.card.revision ?? 0}:${props.card.state}`} {...props} />;
}

function CardView({ card, status, error, loadingReason, undoRemainingSeconds, ...actions }: CardProps) {
  const titleId = useId();
  const action = useAction();
  const submitted = useRef(false);
  const [awaitingUpdate, setAwaitingUpdate] = useState(false);
  const runtimeStatus = status ?? (card.state === "declined" ? "rejected" : card.level !== "auto" && (card.state === "ready" || card.state === "pending") ? "pending" : "done");
  const processing = action.busy || runtimeStatus === "loading";
  const pending = canApproveCard({ card, status: runtimeStatus, runId: null, error: error ?? null, loadingReason });
  const showActions = pending || (runtimeStatus === "loading" && loadingReason === "approval" && card.level !== "auto" && (card.state === "ready" || card.state === "pending"));
  const done = runtimeStatus === "approved" || runtimeStatus === "done";
  const windowOpen = card.reversible !== "window" || (undoRemainingSeconds !== undefined && undoRemainingSeconds > 0);
  const canUndo = done && (card.state === "approved" || card.state === "delegated") && card.undo === true && card.reversible !== "none" && windowOpen;
  const disabled = processing || awaitingUpdate;
  const amounts = card.amounts?.filter(amount => !(card.body.includes(amount.label) && card.body.includes(formatMoney(amount.amount_cents))));

  async function decide(callback: CardActions["onApprove"], allowed: boolean) {
    if (!allowed || submitted.current || disabled || !callback) return;
    submitted.current = true;
    const success = await action.run(() => callback(card));
    if (success) setAwaitingUpdate(true);
    else submitted.current = false;
  }

  return <Layers as="article" className={`catalog-card catalog-level-${card.level} ${pending ? "catalog-pending" : ""}`} labelledBy={titleId} busy={processing} cardId={card.id}>
    <Layer stage="title">
      <div className="catalog-card-head"><AgentLabel agent={card.agent} /><span className={`catalog-level ${card.level}`}>
        {card.level === "auto" ? "Automático · solo lee" : card.level === "borrador" ? "Borrador · tú decides" : "Requiere tu aprobación"}
      </span></div>
      <h3 id={titleId}>{card.title}</h3>
    </Layer>
    <Layer stage="text"><Body body={card.body} />
      {card.why ? <p className="catalog-why"><b>Porque:</b> {card.why}</p> : null}
      {card.srcs?.length ? <div className="catalog-sources" aria-label="Fuentes">{card.srcs.map((source, index) => actions.onSource
        ? <button key={index} className="catalog-source" type="button" disabled={disabled} onClick={() => void action.run(() => actions.onSource!(source, card))}>↗ {source}</button>
        : <span key={index} className="catalog-source">{source}</span>)}</div> : null}
    </Layer>
    <Layer stage="data">
      {amounts?.length ? <dl className="catalog-amounts">{amounts.map((amount, index) => <div key={index}><dt>{amount.label}</dt><dd>{formatMoney(amount.amount_cents)}</dd></div>)}</dl> : null}
      {card.scope?.length ? <div className="catalog-scope" aria-label="Alcance">{card.scope.map((item, index) => <span key={index} className={item.reversible === "none" ? "catalog-irreversible" : ""}>{item.label === "rev" ? item.value : <>{item.label}: <b>{item.value}</b></>}</span>)}</div> : null}
      {showActions ? <div className="catalog-actions">
        {card.edit || actions.onEdit ? <button type="button" className="catalog-button" disabled={disabled || !actions.onEdit} onClick={() => { if (!disabled) void action.run(() => actions.onEdit!(card)); }}>Editar</button> : null}
        <button type="button" className="catalog-button" disabled={disabled || !actions.onAlternative} onClick={() => void decide(actions.onAlternative, pending)}>{card.alt ?? "Descartar"}</button>
        <button type="button" className="catalog-button catalog-primary" disabled={disabled || !actions.onApprove || !card.approve} onClick={() => void decide(actions.onApprove, pending)}>{processing ? "Procesando…" : card.approve ?? "Aprobar"}</button>
      </div> : null}
      {processing ? <p role="status" className="catalog-muted">{loadingReason === "tool" ? "Preparando…" : "Procesando…"}</p> : null}
      {awaitingUpdate && !done ? <p role="status" className="catalog-muted">Esperando actualización…</p> : null}
      {done && card.state !== "undone" ? <div role="status" className="catalog-completion"><p className="catalog-stamp">{card.state === "delegated" ? "Delegado" : card.level === "auto" ? "Hecho" : "Aprobado"}</p>{card.result ? <p className="catalog-result">✓ {card.result}</p> : null}</div> : null}
      {canUndo ? <div className="catalog-undo">{card.reversible === "window" ? <span>Se puede deshacer durante {undoRemainingSeconds} s</span> : null}<button type="button" className="catalog-button" disabled={disabled || !actions.onUndo} onClick={() => void decide(actions.onUndo, canUndo)}>Deshacer</button></div> : null}
      {runtimeStatus === "rejected" ? <p className="catalog-muted">Descartado · queda en el rastro.</p> : null}
      {runtimeStatus === "stopped" ? <p className="catalog-muted">Detenido por ti · lo hecho hasta aquí queda en el rastro.</p> : null}
      {card.state === "undone" ? <p className="catalog-muted">Deshecho · queda en el rastro.</p> : null}
      {action.error || error ? <p role="alert" className="catalog-error">{action.error ?? error}</p> : null}
    </Layer>
  </Layers>;
}
