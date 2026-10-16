import type { InboxItem } from "../contracts/client";
import { CanonicalProposalCard } from "./CanonicalProposalCard";

const labels: Record<InboxItem["status"], string> = {
  pending: "Pendiente de aprobación humana",
  approved: "Aprobada; ejecución aún no confirmada",
  executed: "Aplicada",
  failed: "No se pudo ejecutar",
  declined: "Declinada",
  expired: "Vencida",
  superseded: "Reemplazada",
};

/** A replay can return a proposal already decided by somebody else. */
export function ProposalReceipt({ proposal }: { proposal: InboxItem }) {
  const result = proposal.result_ref;
  const resultName = result?.type === "inventory_movement" ? "Movimiento de inventario"
    : result?.type === "delegation_task" ? "Tarea delegada" : null;
  return <div>
    <p><strong>Estado al recibir el reporte: {labels[proposal.status]}.</strong>{" "}
    {resultName && typeof result?.id === "number" && <span>{resultName} #{result.id}. </span>}
    </p>
    <CanonicalProposalCard proposalId={proposal.id} inboxLink />
  </div>;
}
