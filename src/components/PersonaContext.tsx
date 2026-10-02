"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { choosePersona, loadIdentity, loadPersonas, toApiError, useMocks } from "../api";
import type { PersonaOption, StaffIdentity } from "../types";
import { BrandLogo } from "./BrandLogo";

/**
 * The signed-in staff person for the whole shell. `identity` is the backend's
 * `GET /me` — read once per persona (it spends the credential's read budget),
 * not per page. `version` changes on every switch so pages remount and refetch
 * with the new person's credential.
 *
 * In real mode nothing reaches the backend without a persona (the BFF answers
 * 401 `PERSONA_REQUIRED`), so until one is chosen the shell shows the persona
 * picker instead of the pages. The server's access code is asked once and
 * kept in memory only.
 */
interface PersonaState {
  identity: StaffIdentity | null;
  personas: PersonaOption[];
  current: string | null;
  loading: boolean;
  switching: boolean;
  error: string;
  version: number;
  /** The picker must ask for the access code before the next switch. */
  needsCode: boolean;
  switchTo: (key: string | null, code?: string) => Promise<void>;
}

const PersonaContext = createContext<PersonaState | null>(null);

const WRONG_CODE = "Código de acceso incorrecto. Escríbelo de nuevo.";

export function PersonaProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<StaffIdentity | null>(null);
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [requiresCode, setRequiresCode] = useState(false);
  const [hasCode, setHasCode] = useState(false);
  const codeRef = useRef("");

  const readIdentity = useCallback(async () => {
    try {
      setIdentity(await loadIdentity());
      setError("");
    } catch (caught) {
      const apiError = toApiError(caught);
      setIdentity(null);
      // 401 = no usable persona yet: the picker asks for one, not an error.
      setError(apiError.httpStatus === 401 ? "" : apiError.message);
      if (apiError.code === "PERSONA_REQUIRED") setCurrent(null);
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
        setRequiresCode(session.value.requiresCode === true);
      } else {
        setError(toApiError(session.reason).message);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [readIdentity]);

  const switchTo = useCallback(async (key: string | null, code?: string) => {
    if (code !== undefined) codeRef.current = code;
    setSwitching(true);
    try {
      const session = await choosePersona(key, codeRef.current || undefined);
      setPersonas(session.personas);
      setCurrent(session.current);
      setHasCode(codeRef.current !== "");
      await readIdentity();
      setVersion((value) => value + 1);
    } catch (caught) {
      const apiError = toApiError(caught);
      if (apiError.code === "ACCESS_CODE_INVALID") {
        codeRef.current = "";
        setHasCode(false);
        setRequiresCode(true);
        setError(WRONG_CODE);
      } else {
        setError(apiError.message);
      }
    } finally {
      setSwitching(false);
    }
  }, [readIdentity]);

  const needsCode = requiresCode && !hasCode;
  const value = useMemo<PersonaState>(
    () => ({ identity, personas, current, loading, switching, error, version, needsCode, switchTo }),
    [identity, personas, current, loading, switching, error, version, needsCode, switchTo],
  );
  const gated = !useMocks && (loading || current === null);
  return <PersonaContext.Provider value={value}>{gated ? <PersonaGate /> : children}</PersonaContext.Provider>;
}

export function usePersona(): PersonaState {
  const state = useContext(PersonaContext);
  if (!state) throw new Error("usePersona must be used inside <PersonaProvider>.");
  return state;
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "?";
const ROLE_LABEL: Record<string, string> = { secretaria: "Secretaria", administrador: "Administrador" };

/** The access code (when the server asks for one) and the staff personas.
 *  `onChoose` runs when a choice is actually sent. */
export function PersonaPicker({ onChoose, autoFocus = false }: { onChoose?: () => void; autoFocus?: boolean }) {
  const { personas, current, switching, needsCode, switchTo } = usePersona();
  const [code, setCode] = useState("");
  const [hint, setHint] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);
  const codeId = useId();
  const hintId = useId();

  const choose = (key: string) => {
    if (switching) return;
    if (needsCode && !code) {
      setHint("Escribe el código de acceso antes de elegir.");
      codeRef.current?.focus();
      return;
    }
    setHint("");
    onChoose?.();
    if (needsCode) {
      void switchTo(key, code);
      setCode("");
    } else if (key !== current) {
      void switchTo(key);
    }
  };

  return <>
    {needsCode && <label className="field" htmlFor={codeId} style={{ display: "grid", gap: 4, margin: "0 6px 8px", color: "#c9d8e4", fontSize: 12 }}>
      <span>Código de acceso</span>
      <input ref={codeRef} id={codeId} name="access-code" type="password" autoComplete="off" value={code} autoFocus={autoFocus}
        aria-describedby={hint ? hintId : undefined} onChange={(event) => { setCode(event.target.value); setHint(""); }} />
      {hint && <small id={hintId} role="alert" style={{ color: "#ffb4c0" }}>{hint}</small>}
    </label>}
    {personas.length === 0
      ? <p className="persona-menu__empty">No hay personas configuradas en el servidor.</p>
      : personas.map((persona) => {
        const selected = persona.key === current;
        return <button key={persona.key} type="button" className="persona-menu__option" aria-pressed={selected} onClick={() => choose(persona.key)}>
          <span className="sidebar-profile__avatar" aria-hidden="true">{initials(persona.displayName)}</span>
          <span><strong>{persona.displayName}</strong><small>{ROLE_LABEL[persona.role] ?? persona.role}</small></span>
          {selected && <Check size={16} aria-hidden="true" />}
        </button>;
      })}
  </>;
}

/** Real mode without a persona: the picker in place of the pages. */
function PersonaGate() {
  const { loading, switching, error } = usePersona();
  const headingId = useId();
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16, background: "var(--shell)" }}>
    <div className="persona-menu" role="group" aria-labelledby={headingId} aria-busy={loading || switching} style={{ position: "static", width: "min(100%, 360px)", gap: 6, padding: 16 }}>
      <BrandLogo variant="horizontal" priority />
      <h1 id={headingId} style={{ margin: "8px 6px 0", color: "#e8f2fa", fontSize: 18 }}>Elige quién eres</h1>
      <p className="persona-menu__label">Actuar como</p>
      {loading ? <p className="persona-menu__empty">Cargando…</p> : <PersonaPicker autoFocus />}
      {switching && <p className="persona-menu__empty" role="status">Cambiando…</p>}
      {error && <p className="persona-switcher__error" role="alert">{error}</p>}
    </div>
  </main>;
}
