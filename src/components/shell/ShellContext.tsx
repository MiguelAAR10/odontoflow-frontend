"use client";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { ShellRole } from "../../nav";

interface ShellContextValue {
  role: ShellRole;
  setRole: (role: ShellRole) => void;
  locationId: string;
  setLocationId: (id: string) => void;
}
const ShellContext = createContext<ShellContextValue | null>(null);
/** Presentation context only. Credentials and grants remain in PersonaProvider. */
export function ShellProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<ShellRole>("admin");
  const [locationId, setLocationId] = useState("");
  const value = useMemo(() => ({ role, setRole, locationId, setLocationId }), [role, locationId]);
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}
export function useShellContext() {
  const context = useContext(ShellContext);
  if (!context) throw new Error("useShellContext requires ShellProvider");
  return context;
}
