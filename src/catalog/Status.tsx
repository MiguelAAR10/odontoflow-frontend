"use client";

import { useId, useRef, useState } from "react";
import type { z } from "zod";
import type { StatusSchema } from "./schema";
import { AgentLabel } from "./AgentLabel";
import { Layers, Layer } from "./Layers";
import { useAction } from "./useAction";

export interface StatusProps extends z.infer<typeof StatusSchema> {
  onStop?: () => void | Promise<void>;
}

export function Status(props: StatusProps) {
  return <StatusView key={props.state} {...props} />;
}

function StatusView({ text, state, agent = "airi", plan = [], onStop }: StatusProps) {
  const planId = useId();
  const [open, setOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const submitted = useRef(false);
  const action = useAction();
  const step = plan.filter(item => item.status !== "pending").length;
  async function stop() {
    if (state !== "working" || !onStop || submitted.current) return;
    submitted.current = true;
    if (await action.run(onStop)) setStopping(true);
    else submitted.current = false;
  }
  return <Layers className={`catalog-status ${state}`} busy={action.busy}>
    <Layer stage="text"><div className="catalog-status-line"><span className="catalog-status-dot" aria-hidden="true" /><AgentLabel agent={agent} /><span role={state === "error" ? "alert" : "status"}>{text}</span>
      {plan.length ? <button type="button" className="catalog-button catalog-plan-toggle" aria-expanded={open} aria-controls={planId} onClick={() => setOpen(value => !value)}>Plan {step}/{plan.length}</button> : null}
      {state === "working" ? <button type="button" className="catalog-button" disabled={action.busy || stopping || !onStop} onClick={() => void stop()}>{stopping ? "Deteniendo…" : "Detener"}</button> : null}
    </div></Layer>
    {open && plan.length ? <Layer stage="data"><ol id={planId} className="catalog-plan">{plan.map((item, index) => <li key={index} className={item.status} aria-current={item.status === "working" ? "step" : undefined}><span aria-hidden="true">{item.status === "done" ? "✓" : item.status === "working" ? "•" : "○"}</span>{item.label}</li>)}</ol></Layer> : null}
    {action.error ? <p role="alert" className="catalog-error">{action.error}</p> : null}
  </Layers>;
}
