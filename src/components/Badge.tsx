import type { ReactNode } from "react";
import type { Tone } from "../types";

export function Badge({ tone = "slate", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function statusTone(status: string): Tone {
  if (["Confirmada", "Completado", "Pagado", "Disponible", "Activo"].includes(status)) return "green";
  if (["Por confirmar", "Esperando", "Pendiente", "Stock bajo"].includes(status)) return "amber";
  if (["No respondió", "Crítico", "Egreso", "Cancelada"].includes(status)) return "red";
  if (["Requiere atención", "Plin", "Yape"].includes(status)) return "purple";
  if (["Inactivo"].includes(status)) return "slate";
  return "cyan";
}
