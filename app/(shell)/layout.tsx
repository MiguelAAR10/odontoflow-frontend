"use client";

import type { ReactNode } from "react";
import { AppShell } from "../../src/components/AppShell";
import { PersonaProvider } from "../../src/components/PersonaContext";

export default function ShellLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <PersonaProvider><AppShell>{children}</AppShell></PersonaProvider>;
}
