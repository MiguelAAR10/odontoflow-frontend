"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "../components/Button";
import { reminderDate, reminderReason, REMINDER_TYPE_LABEL } from "../reminders";
import type { ApprovalItem, ProposalDecision } from "../types";

/** Approval authorizes future sends; provider acceptance lives in coverage. */
export function ReminderBatchCard({ item, now, busy = false, error, onDecide }: {
  item: ApprovalItem; now: number; busy?: boolean; error?: string | null;
  onDecide: (item: ApprovalItem, decision: ProposalDecision) => Promise<void>;
}) {
  const latch = useRef(false);
  const [working, setWorking] = useState(false);
  const data = item.reminderBatch;
  const replaced = item.status === "superseded";
  const stale = Boolean(error);
  const expired = Date.parse(item.expiresAt) <= now || (data?.firstDueAt ? Date.parse(data.firstDueAt) - 60_000 <= now : true);
  const decide = async (decision: ProposalDecision) => {
    if (latch.current || busy || item.status !== "pending" || !item.actions.includes(decision) || (decision === "approve" && (expired || replaced || stale || !data?.items.length))) return;
    latch.current = true;
    setWorking(true);
    try { await onDecide(item, decision); } catch { /* Parent renders the shared error envelope. */ }
    finally { latch.current = false; setWorking(false); }
  };
  return <article aria-label="Lote de recordatorios" className="approval-card reminder-batch-card">
    <style>{`
      .reminder-batch-card{padding:20px;background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:var(--radius);font:400 14px/1.6 var(--font-text);overflow-wrap:anywhere}
      .reminder-batch-card h3{margin:0 0 12px;font-size:18px;line-height:1.4;font-weight:600}
      .reminder-batch-card h4{margin:24px 0 8px;font-size:14px;font-weight:600}
      .reminder-batch-card p{margin:8px 0}.reminder-batch-card ol,.reminder-batch-card ul{padding-inline-start:20px}
      .reminder-batch-card ol>li+li{border-top:1px solid var(--line);padding-top:16px}
      .reminder-batch-card blockquote{margin:12px 0;padding:12px;background:var(--surface-2);border-inline-start:3px solid var(--line-2);white-space:pre-wrap}
      .reminder-batch-card .form-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:20px}
      .reminder-batch-card button{min-height:44px;white-space:normal}
      @media(max-width:480px){.reminder-batch-card{padding:16px}.reminder-batch-card .form-actions>*{width:100%}}
    `}</style>
    <h3>{item.headline}</h3>
    <p>{item.detail}</p>
    {replaced && <p role="status">Reemplazada: la cita o los avisos cambiaron. Prepara y revisa un lote nuevo.</p>}
    {expired && item.status === "pending" && <p role="status">Pasó el plazo de autorización. Prepara otro lote con los avisos aún futuros.</p>}
    {data ? <>
      <h4>Avisos a decidir</h4>
      {data.firstDueAt && <p>Primer envío <time dateTime={data.firstDueAt}>{reminderDate(data.firstDueAt)} (Lima)</time></p>}
      <ol>{data.items.map(row => <li key={row.item_id} style={{ marginBlock: "1rem", overflowWrap: "anywhere" }}>
        <strong>{row.patient_name ?? `Cita #${row.appointment_id}`}</strong>
        <p>Cita #{row.appointment_id} · Versión {row.appointment_version} · {REMINDER_TYPE_LABEL[row.type]}</p>
        <Link href={`/agenda?appointment=${row.appointment_id}`}>Revisar cita en Agenda</Link>
        <p><time dateTime={row.due_at}>{reminderDate(row.due_at)} (Lima)</time></p>
        <blockquote>{row.text}</blockquote>
        <p>Botones: {row.buttons.join(" · ")}</p>
      </li>)}</ol>
      <h4>Omisiones y fusiones ({data.omissions.length})</h4>
      {data.omissions.length ? <ul>{data.omissions.map((row, index) => <li key={`${row.appointment_id}:${row.type}:${index}`}>Cita #{row.appointment_id} · {REMINDER_TYPE_LABEL[row.type]}: {reminderReason(row.reason)}</li>)}</ul> : <p>Sin omisiones.</p>}
    </> : <p role="alert">Falta el detalle de los avisos. Vuelve a cargar la bandeja.</p>}
    {["approved", "executed"].includes(item.status) && <p role="status">Envíos futuros autorizados. Consulta la cobertura en Agenda para ver cuáles aceptó Telegram.</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {item.status === "pending" && <div className="form-actions">
      {item.actions.includes("approve") && <Button variant="primary" disabled={!data?.items.length || expired || stale || busy || working} onClick={() => void decide("approve")}>{busy || working ? "Autorizando…" : "Autorizar envíos futuros"}</Button>}
      {item.actions.includes("decline") && <Button disabled={busy || working} onClick={() => void decide("decline")}>Rechazar lote</Button>}
    </div>}
    <p><Link href="/agenda">Ver cobertura en Agenda</Link> · <Link href="/agente">Ver decisiones en Rastro</Link></p>
  </article>;
}
