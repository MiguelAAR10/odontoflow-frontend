"use client";

import type { ReactNode } from "react";
import { AppShell } from "../../src/components/AppShell";

export default function ShellLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
