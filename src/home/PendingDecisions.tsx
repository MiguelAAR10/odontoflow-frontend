"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toApiError } from "../api";
import { loadInbox, type InboxPageView } from "../approvals";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import "./pending-decisions.css";

/** A read-only preview. Decisions remain in the canonical approvals inbox. */
export function PendingDecisions() {
  const [page, setPage] = useState<InboxPageView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setPage(null);
    void loadInbox({ status: "pending" })
      .then((result) => { if (active) setPage(result); })
      .catch((caught: unknown) => { if (active) setError(toApiError(caught).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  const ready = !loading && !error && page !== null;

  return (
    <section className="home-worklist home-decisions" aria-labelledby="home-decisions-title">
      <header className="home-worklist__header">
        <h2 id="home-decisions-title">Decisiones pendientes</h2>
        {ready && (
          <span className="home-worklist__count" aria-label={`${page.items.length}${page.nextCursor ? " o más" : ""} decisiones pendientes`}>
            {page.items.length}{page.nextCursor ? "+" : ""}
          </span>
        )}
        <Link className="home-text-link home-decisions__all" href="/aprobaciones">Ver todas</Link>
      </header>

      {loading && <div className="home-worklist__state"><p role="status">Cargando decisiones pendientes</p></div>}

      {!loading && error && (
        <div className="home-worklist__state home-worklist__state--error" role="alert">
          <strong>{error}</strong>
          <p>No pudimos cargar las decisiones pendientes.</p>
          <div><Button compact variant="secondary" onClick={() => setAttempt((value) => value + 1)}>Reintentar</Button></div>
        </div>
      )}

      {ready && page.items.length === 0 && (
        <div className="home-worklist__state"><p>No hay decisiones pendientes de aprobación.</p></div>
      )}

      {ready && page.items.length > 0 && (
        <ul className="home-decisions__list">
          {page.items.slice(0, 3).map((item) => (
            <li key={item.key} className="home-decisions__item">
              <div className="home-decisions__meta">
                <span>{item.categoryLabel}</span>
                {item.source === "agent_proposal" && <Badge tone="purple">Propuesto por agente</Badge>}
              </div>
              <h3>{item.headline}</h3>
              {item.detail && <p>{item.detail}</p>}
              {(item.agentLabel || item.locationName) && (
                <p>{[item.agentLabel, item.locationName].filter(Boolean).join(" · ")}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
