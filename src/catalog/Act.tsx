"use client";

import type { z } from "zod";
import type { ActSchema } from "./schema";
import { Layers, Layer } from "./Layers";
import { useAction } from "./useAction";

export interface ActProps extends z.infer<typeof ActSchema> {
  onOpen?: (target: string, action?: string) => void | Promise<void>;
}

export function Act({ label, target, action: intent, onOpen }: ActProps) {
  const action = useAction();
  return <Layers className="catalog-act" busy={action.busy}><Layer stage="data">
    <button type="button" className="catalog-button" disabled={action.busy || !onOpen} onClick={() => void action.run(onOpen ? () => onOpen(target, intent) : undefined)}>Abrir {label} →</button>
    {action.error ? <p role="alert" className="catalog-error">{action.error}</p> : null}
  </Layer></Layers>;
}
