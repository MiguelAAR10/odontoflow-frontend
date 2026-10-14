"use client";

import type { z } from "zod";
import type { FallbackSchema } from "./schema";
import { Layers, Layer } from "./Layers";

export function Fallback({ message = "No puedo mostrar este contenido. Prueba a consultar de nuevo." }: z.infer<typeof FallbackSchema>) {
  return <Layers className="catalog-notice warning"><Layer stage="text"><p role="status">{message}</p></Layer></Layers>;
}
