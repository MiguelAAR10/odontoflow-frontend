"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { choosePersona, loadIdentity, loadPersonas, toApiError } from "../api";
import type { PersonaOption, StaffIdentity } from "../types";

/**
 * The signed-in staff person for the whole shell. `identity` is the backend's
 * `GET /me` — read once per persona (it spends the credential's read budget),
 * not per page. `version` changes on every switch so pages remount and refetch
 * with the new person's credential.
 */
interface PersonaState {
  identity: StaffIdentity | null;
  personas: PersonaOption[];
  current: string | null;
  loading: boolean;
  switching: boolean;
  error: string;
  version: number;
  switchTo: (key: string | null) => Promise<void>;
}

const PersonaContext = createContext<PersonaState | null>(null);

export function PersonaProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<StaffIdentity | null>(null);
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  const readIdentity = useCallback(async () => {
    try {
      setIdentity(await loadIdentity());
      setError("");
    } catch (caught) {
      const apiError = toApiError(caught);
      setIdentity(null);
      // 401 = no usable persona yet: the switcher asks for one, not an error.
      setError(apiError.httpStatus === 401 ? "" : apiError.message);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [session] = await Promise.allSettled([loadPersonas(), readIdentity()]);
      if (!active) return;
      if (session.status === "fulfilled") {
        setPersonas(session.value.personas);
        setCurrent(session.value.current);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [readIdentity]);

  const switchTo = useCallback(async (key: string | null) => {
    setSwitching(true);
    try {
      const session = await choosePersona(key);
      setPersonas(session.personas);
      setCurrent(session.current);
      await readIdentity();
      setVersion((value) => value + 1);
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      setSwitching(false);
    }
  }, [readIdentity]);

  const value = useMemo<PersonaState>(
    () => ({ identity, personas, current, loading, switching, error, version, switchTo }),
    [identity, personas, current, loading, switching, error, version, switchTo],
  );
  return <PersonaContext.Provider value={value}>{children}</PersonaContext.Provider>;
}

export function usePersona(): PersonaState {
  const state = useContext(PersonaContext);
  if (!state) throw new Error("usePersona must be used inside <PersonaProvider>.");
  return state;
}
