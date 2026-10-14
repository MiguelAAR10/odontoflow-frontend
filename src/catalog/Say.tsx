"use client";

import type { z } from "zod";
import type { SaySchema } from "./schema";
import { AgentLabel } from "./AgentLabel";
import { Layers, Layer } from "./Layers";

export function Say({ text, agent = "airi" }: z.infer<typeof SaySchema>) {
  return <Layers className="catalog-say"><Layer stage="text"><p><AgentLabel agent={agent} /> <span>{text}</span></p></Layer></Layers>;
}
