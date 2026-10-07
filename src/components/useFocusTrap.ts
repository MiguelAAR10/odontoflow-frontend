"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Dialog focus contract shared by Drawer and Modal: while `open`, Escape
 * closes, Tab/Shift+Tab wrap inside `ref`, focus moves into the dialog unless
 * an inner control already holds it (e.g. `autoFocus`), and on close focus
 * returns to whatever was focused before the dialog opened.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void): void {
  // Latest onClose without re-running the effect: callers often pass inline
  // closures, and a re-run would bounce focus out of the dialog.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Captured during the render that opens the dialog, before an inner
  // `autoFocus` control moves focus during commit.
  const restoreRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current && typeof document !== "undefined") {
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  wasOpen.current = open;

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    if (node && !node.contains(document.activeElement)) node.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (!node.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const restore = restoreRef.current;
      restoreRef.current = null;
      if (restore?.isConnected) restore.focus();
    };
  }, [open, ref]);
}
