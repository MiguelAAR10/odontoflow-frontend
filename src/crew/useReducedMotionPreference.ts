"use client";

import { useSyncExternalStore } from "react";

const query = "(prefers-reduced-motion: reduce)";
const preference = () => typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query) : null;
const subscribe = (notify: () => void) => {
  const media = preference();
  media?.addEventListener("change", notify);
  return () => media?.removeEventListener("change", notify);
};
const snapshot = () => preference()?.matches ?? true;
const serverSnapshot = () => true;

/** Start quiet during hydration and react to preference changes while mounted. */
export function useReducedMotionPreference() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
