"use client";

import { useRef, useState } from "react";
import { toApiError } from "../contracts/client";

/** The ref closes the gap before React renders disabled=true. Transport stays injected. */
export function useAction() {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(callback: (() => void | Promise<void>) | undefined) {
    if (!callback || locked.current) return false;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      await callback();
      return true;
    } catch (caught) {
      setError(toApiError(caught).message);
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run };
}
