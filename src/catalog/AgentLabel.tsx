import type { AgentId } from "../agui/card";

const names: Record<AgentId, string> = { airi: "AIRI", cepillo: "Cepillo", pasta: "Pasta", hilo: "Hilo", enjuague: "Enjuague", espejo: "Espejo", escudo: "Escudo" };

export function AgentLabel({ agent }: { agent: AgentId }) {
  return <span className="catalog-agent"><span className="catalog-agent-dot" data-agent={agent} aria-hidden="true" />{names[agent]}</span>;
}
