"use client";
import { useEffect, useState } from "react";

export function useCanvasTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setTheme(document.documentElement.dataset.theme === "dark" ? "dark"
      : document.documentElement.dataset.theme === "light" ? "light" : media.matches ? "dark" : "light");
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    media.addEventListener("change", sync);
    sync();
    return () => { observer.disconnect(); media.removeEventListener("change", sync); };
  }, []);
  return theme;
}
