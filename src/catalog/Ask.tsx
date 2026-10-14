"use client";

import { useRef, useState } from "react";
import type { z } from "zod";
import type { AskSchema } from "./schema";
import { Layers, Layer } from "./Layers";
import { useAction } from "./useAction";

export interface AskProps extends z.infer<typeof AskSchema> {
  onChoose?: (optionId: string) => void | Promise<void>;
}

export function Ask({ text, options = [], onChoose }: AskProps) {
  const action = useAction();
  const picked = useRef(false);
  const [selected, setSelected] = useState<string | null>(null);
  async function choose(id: string) {
    if (picked.current || !onChoose) return;
    picked.current = true;
    if (await action.run(() => onChoose(id))) setSelected(id);
    else picked.current = false;
  }
  return <Layers className="catalog-ask" busy={action.busy}>
    <Layer stage="text"><p>{text}</p></Layer>
    {options.length ? <Layer stage="data"><div className="catalog-options" role="group" aria-label={text}>{options.map(option => <button key={option.id} type="button" className="catalog-button" aria-pressed={selected === option.id} disabled={action.busy || selected !== null || !onChoose} onClick={() => void choose(option.id)}>{option.label}</button>)}</div></Layer> : null}
    {action.error ? <p role="alert" className="catalog-error">{action.error}</p> : null}
  </Layers>;
}
