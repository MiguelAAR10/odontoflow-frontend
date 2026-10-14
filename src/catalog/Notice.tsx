"use client";

import type { z } from "zod";
import type { NoticeSchema } from "./schema";
import { Layers, Layer } from "./Layers";

export function Notice({ text, tone = "warning" }: z.infer<typeof NoticeSchema>) {
  return <Layers className={`catalog-notice ${tone}`}><Layer stage="text"><p role={tone === "error" ? "alert" : "status"}>{text}</p></Layer></Layers>;
}
