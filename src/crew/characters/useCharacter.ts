"use client";

import { useId, useRef, type SVGProps } from "react";
import { useGaze } from "../useGaze";
import type { Agent, CharacterProps, CharacterState } from "./types";
import "../crew.css";

const names: Record<Agent, string> = {
  airi: "AIRI", cepillo: "Cepillo", pasta: "Pasta", hilo: "Hilo",
  enjuague: "Enjuague", espejo: "Espejo", escudo: "Escudo",
};
const states: Record<CharacterState, string> = {
  idle: "en reposo", thinking: "pensando", working: "trabajando",
  handoff: "pasa el caso", done: "listo", "needs-you": "te necesita",
};

export function useCharacter(agent: Agent, {
  state = "idle", size = 96, gaze = true, className = "", label, decorative = false,
}: CharacterProps) {
  const prefix = `pj-${useId().replace(/:/g, "_")}`;
  const id = (part: string) => `${prefix}-${part}`;
  const ref = useRef<SVGSVGElement>(null);
  useGaze(ref, gaze);
  const svgProps: SVGProps<SVGSVGElement> = {
    ref, xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 1024 1024",
    width: size, height: size, focusable: "false",
    className: `personaje pj-${agent === "airi" ? "diente" : agent} is-${state}${size <= 24 ? " no-grain" : ""}${className ? ` ${className}` : ""}`,
    ...(decorative ? { "aria-hidden": true } : { role: "img", "aria-labelledby": id("title") }),
  };
  return { id, svgProps, title: label ?? `${names[agent]} · ${states[state]}` };
}
