"use client";

import { Diente } from "./Diente";
import { Cepillo } from "./Cepillo";
import { Pasta } from "./Pasta";
import { Hilo } from "./Hilo";
import { Enjuague } from "./Enjuague";
import { Espejo } from "./Espejo";
import { Escudo } from "./Escudo";
import type { Agent, CharacterProps } from "./types";

const characters = { airi: Diente, cepillo: Cepillo, pasta: Pasta, hilo: Hilo, enjuague: Enjuague, espejo: Espejo, escudo: Escudo };

export function Character({ agent, ...props }: CharacterProps & { agent: Agent }) {
  const Component = characters[agent];
  return <Component {...props} />;
}

export type { Agent, CharacterProps, CharacterState } from "./types";
