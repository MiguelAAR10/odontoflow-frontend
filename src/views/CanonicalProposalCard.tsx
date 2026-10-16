"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { loadProposalCard, loadProposalRecord, toApiError } from "../api";
import type { InboxItem } from "../contracts/client";
import type { Card as CardDto } from "../agui/card";
import { Card } from "../catalog/Card";
import { Button } from "../components/Button";
import { usePersona } from "../components/PersonaContext";
import { createLatestRequest } from "../session";

export function CanonicalProposalCard({ proposalId, inboxLink = false }: { proposalId: number; inboxLink?: boolean }) {
  const { version } = usePersona();
  return <CardRead key={`${version}:${proposalId}`} proposalId={proposalId} inboxLink={inboxLink} />;
}

function CardRead({ proposalId, inboxLink }: { proposalId: number; inboxLink: boolean }) {
  const { identity } = usePersona();
  const canReadInbox = inboxLink && identity?.permissions.includes("proposals.read") === true;
  const [card, setCard] = useState<CardDto | null>(null);
  const [record, setRecord] = useState<InboxItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const reads = useRef(createLatestRequest());
  useEffect(() => {
    const current = reads.current.begin();
    setLoading(true); setError(""); setCard(null); setRecord(null);
    void Promise.all([
      loadProposalCard(proposalId),
      canReadInbox ? loadProposalRecord(proposalId).catch(() => null) : Promise.resolve(null),
    ]).then(([value, item]) => {
      if (!current()) return;
      setCard(value);
      if (item?.payload_hash === value.payload_hash) setRecord(item);
    })
      .catch(caught => { if (current()) setError(toApiError(caught).message); })
      .finally(() => { if (current()) setLoading(false); });
    return () => reads.current.invalidate();
  }, [proposalId, revision, canReadInbox]);
  return <section aria-label={`Tarjeta de la propuesta ${proposalId}`} aria-busy={loading}>
    {loading && <p role="status">Consultando tarjeta…</p>}
    {error && <p role="alert">{error}</p>}
    {card && <Card card={card} readOnly />}
    {record && card && card.state !== "undone" && String(record.status) !== "undone" && <p><Link href={`/aprobaciones?proposal=${encodeURIComponent(`agent_proposal:${proposalId}`)}&status=${record.status}`}>{record.result_ref ? "Ver resultado de la propuesta en Bandeja" : "Revisar propuesta en Bandeja"}</Link></p>}
    <Button compact type="button" disabled={loading} onClick={() => setRevision(value => value + 1)}>{error ? "Reintentar tarjeta" : "Actualizar tarjeta"}</Button>
  </section>;
}
