import { canApproveCard, type AgentId } from "../agui/card";
import type { RunState } from "../agui/reducer";

/** Thread-local evidence, never a projection of the whole clinic or shift. */
export function agentActivity(state: RunState, agent: AgentId) {
  const entries = Object.values(state.cards).filter(entry => entry.card.agent === agent);
  const latest = entries.at(-1);
  const pending = entries.find(entry => canApproveCard(entry));
  const approving = entries.find(entry => entry.loadingReason === "approval" && entry.status === "loading");
  const approved = [...state.trace].reverse().find(event => event.agent === agent && event.type === "CARD_APPROVED" && event.cardId);
  const recorded = approved?.cardId ? state.cards[approved.cardId] : undefined;
  const result = recorded?.card.state === "approved" && recorded.card.result ? recorded
    : [...entries].reverse().find(entry => entry.card.state === "approved" && entry.card.result);
  return {
    latest, pending, result, resultOrdered: Boolean(recorded && result === recorded),
    decision: approving ? "Esperando la respuesta de tu aprobación."
      : pending ? `Revisar «${pending.card.title}» y decidir en su tarjeta.`
      : entries.some(entry => entry.status === "error") ? "Revisar el error en la tarjeta antes de continuar."
      : state.run.agent === agent && state.run.status === "working" ? "Esperar el resultado del trabajo en curso."
      : "No hay una decisión pendiente registrada para este personaje en el hilo.",
  };
}

export const responsibilities: Record<AgentId, string> = {
  airi: "Organiza tu intención, reúne contexto y presenta el siguiente paso.",
  cepillo: "Consulta agenda y cupos para preparar propuestas de citas.",
  pasta: "Revisa deudas y prepara seguimientos de cobranza.",
  hilo: "Ayuda a revisar confirmaciones de citas y sus excepciones.",
  enjuague: "Reúne pagos y comprobantes para revisar caja.",
  espejo: "Prepara información clínica disponible; la revisión y firma corresponden al profesional.",
  escudo: "Ayuda a revisar identidad y permisos antes de actuar.",
};
