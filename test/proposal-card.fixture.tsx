import type { Card } from "../src/agui/card";

export const cardFixture = (id: number): Card => ({
  id: String(id), proposal_id: id, payload_hash: "a".repeat(64), version: 1,
  agent: "airi", level: "aprobar", state: "pending", title: "Propuesta canónica",
  body: "Contenido del backend", approve: "Aprobar", alt: "Descartar", edit: true,
});
