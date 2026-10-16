"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { loadCountContext, proposeInventoryCount, newIdempotencyKey, toApiError } from "../api";
import type { CountContext, InventoryCountCreate, InventoryCountReceipt } from "../contracts/client";
import { Button } from "../components/Button";
import { usePersona } from "../components/PersonaContext";
import { createLatestRequest } from "../session";
import { ProposalReceipt } from "./ProposalReceipt";
import { CanonicalProposalCard } from "./CanonicalProposalCard";

export function InventoryCountDraft({ productId, locationId }: { productId: number; locationId: number }) {
  const { version } = usePersona();
  return <CountDraft key={`${version}:${productId}:${locationId}`} productId={productId} locationId={locationId} />;
}

function CountDraft({ productId, locationId }: { productId: number; locationId: number }) {
  const { identity } = usePersona();
  const [context, setContext] = useState<CountContext | null>(null);
  const [receipt, setReceipt] = useState<InventoryCountReceipt | null>(null);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [mustRefresh, setMustRefresh] = useState(false);
  const requests = useRef(createLatestRequest());
  const writes = useRef(createLatestRequest());
  const intent = useRef<{ fingerprint: string; key: string } | null>(null);
  useEffect(() => {
    const isCurrent = requests.current.begin();
    writes.current.invalidate(); intent.current = null;
    setContext(null); setReceipt(null); setLoading(true); setBusy(false); setError(""); setMustRefresh(false);
    void loadCountContext(productId, locationId).then(data => { if (isCurrent()) setContext(data); })
      .catch(caught => { if (isCurrent()) setError(toApiError(caught).message); })
      .finally(() => { if (isCurrent()) setLoading(false); });
    return () => { requests.current.invalidate(); writes.current.invalidate(); };
  }, [productId, locationId, revision]);
  // /me lists org-wide grants only. The endpoint checks this person's sede grants.
  const canPropose = identity?.principalType === "human";
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!context || busy || mustRefresh || !canPropose || !quantity.trim() || !reason.trim()) return;
    const payload: InventoryCountCreate = {
      product_id: context.product.id, location_id: context.location.id,
      counted_quantity: quantity, unit: context.product.unit, reason: reason.trim(), expected_ledger_version: context.ledger_version,
    };
    const fingerprint = JSON.stringify(payload);
    if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, key: newIdempotencyKey() };
    const isCurrent = writes.current.begin();
    setBusy(true); setError("");
    try {
      const result = await proposeInventoryCount(payload, intent.current.key);
      if (isCurrent()) { setReceipt(result); intent.current = null; }
    } catch (caught) {
      if (!isCurrent()) return;
      const problem = toApiError(caught);
      setError(problem.message);
      setMustRefresh(problem.code === "INVENTORY_LEDGER_STALE" || problem.code === "INVENTORY_COUNT_PENDING");
    } finally { if (isCurrent()) setBusy(false); }
  };
  return <div className="airi-catalog">
    <p>Reporta lo que contaste físicamente. AIRI preparará una propuesta; el stock solo cambia tras la aprobación humana.</p>
    <p className="field-note">Conteo absoluto. Para ingresos o consumo clínico usa su operación correspondiente.</p>
    {loading && <p role="status">Consultando producto, unidad y saldo…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && (!context || mustRefresh) && <Button compact disabled={busy} onClick={() => setRevision(value => value + 1)}>Volver a consultar saldo</Button>}
    {receipt ? <div>
      <ProposalReceipt proposal={receipt.proposal} />
      <p>Reportar un conteo por sí solo no aplica movimientos. El estado mostrado corresponde a la respuesta del backend.</p>
      <dl className="detail-list"><div><dt>Saldo consultado</dt><dd>{receipt.balance_before} {receipt.product.unit}</dd></div><div><dt>Conteo reportado</dt><dd>{receipt.counted_quantity} {receipt.product.unit}</dd></div><div><dt>Diferencia calculada por AIRI</dt><dd>{receipt.delta} {receipt.product.unit}</dd></div></dl>
    </div> : context && <form className="form-grid" onSubmit={submit}>
      <dl className="detail-list field--wide"><div><dt>Producto</dt><dd>{context.product.name}</dd></div><div><dt>Sede</dt><dd>{context.location.name}</dd></div><div><dt>Unidad del catálogo</dt><dd>{context.product.unit}</dd></div><div><dt>Saldo actual consultado</dt><dd>{context.balance} {context.product.unit}</dd></div></dl>
      {context.open_count_proposal_id ? <div className="field--wide"><p>Ya hay una propuesta de conteo abierta.</p><CanonicalProposalCard proposalId={context.open_count_proposal_id} inboxLink /></div> : <>
        <label className="field"><span>Cantidad total contada ({context.product.unit})</span><input type="number" min="0" step="0.01" required autoFocus value={quantity} disabled={busy || mustRefresh} onChange={event => setQuantity(event.target.value)} /></label>
        <label className="field field--wide"><span>Motivo del conteo</span><textarea required maxLength={300} value={reason} disabled={busy || mustRefresh} onChange={event => setReason(event.target.value)} /></label>
        <p className="field-note field--wide">La diferencia se mostrará al recibir la propuesta del backend.</p>
        {!canPropose && <p className="field--wide">Tu usuario no tiene permiso para proponer este conteo.</p>}
        <div className="form-actions field--wide"><Button type="submit" variant="primary" disabled={busy || mustRefresh || !canPropose || !quantity.trim() || !reason.trim()}>{busy ? "Preparando propuesta…" : "Preparar propuesta de conteo"}</Button></div>
      </>}
    </form>}
  </div>;
}
