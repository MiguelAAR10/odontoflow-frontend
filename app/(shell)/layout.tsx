"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { AppShell } from "../../src/components/AppShell";
import { ShellProvider } from "../../src/components/shell/ShellContext";
import "../../src/components/shell/shell.css";
import { PersonaProvider } from "../../src/components/PersonaContext";

export default function ShellLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <PersonaProvider><ShellProvider><MotionConfig reducedMotion="user"><AppShell>{children}</AppShell></MotionConfig></ShellProvider></PersonaProvider>;
}
