"use client";

import { useEffect, type RefObject } from "react";

interface Target { gaze: boolean; visible: boolean }

// One controller for mounted characters, created only in effects (never in SSR).
// Pointer positions stay outside React: at most one frame and one global listener.
function createController() {
  const targets = new Map<SVGSVGElement, Target>();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const fine = window.matchMedia("(pointer: fine)");
  let point: { x: number; y: number } | null = null;
  let frame: number | null = null;
  let listening = false;

  const reset = (svg: SVGSVGElement) => {
    svg.style.setProperty("--look-x", "0px");
    svg.style.setProperty("--look-y", "0px");
  };
  const cancel = () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
  };
  function apply() {
    frame = null;
    // Read geometry before writing styles so multiple characters do not thrash layout.
    const positions = [...targets].map(([svg, target]) => {
      if (!point || !target.gaze || !target.visible || document.hidden || reduce.matches || !fine.matches)
        return { svg, x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return { svg, x: 0, y: 0 };
      const dx = point.x - (rect.left + rect.width / 2);
      const dy = point.y - (rect.top + rect.height * .45);
      const distance = Math.hypot(dx, dy) || 1;
      // ±6 in the brand's 512-space = ±12 in these 1024 viewBoxes.
      const factor = Math.min(1, distance / (rect.width * 1.5)) * 12 / distance;
      return { svg, x: dx * factor, y: dy * factor };
    });
    for (const { svg, x, y } of positions) {
      svg.style.setProperty("--look-x", x === 0 ? "0px" : `${x.toFixed(1)}px`);
      svg.style.setProperty("--look-y", y === 0 ? "0px" : `${y.toFixed(1)}px`);
    }
  }
  function schedule() {
    if (frame === null && !document.hidden && listening) frame = window.requestAnimationFrame(apply);
  }
  const move = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    point = { x: event.clientX, y: event.clientY };
    schedule();
  };
  const leave = () => { point = null; schedule(); };
  function preferences() {
    const enabled = !reduce.matches && fine.matches && [...targets.values()].some(target => target.gaze);
    if (enabled === listening) return;
    listening = enabled;
    if (enabled) {
      window.addEventListener("pointermove", move, { passive: true });
      document.documentElement.addEventListener("pointerleave", leave);
    } else {
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      cancel(); point = null;
      targets.forEach((_, svg) => reset(svg));
    }
  }
  function visibility() {
    targets.forEach((target, svg) => {
      svg.setAttribute("data-offscreen", String(!target.visible || document.hidden));
      if (document.hidden) reset(svg);
    });
    if (document.hidden) { cancel(); point = null; }
  }
  const observer = typeof window.IntersectionObserver === "function"
    ? new window.IntersectionObserver(entries => {
      for (const entry of entries) {
        const svg = entry.target as SVGSVGElement;
        const target = targets.get(svg);
        if (!target) continue;
        target.visible = entry.isIntersecting;
        svg.setAttribute("data-offscreen", String(!target.visible || document.hidden));
        if (!target.visible) reset(svg);
      }
      if (point) schedule();
    }) : null;
  reduce.addEventListener("change", preferences);
  fine.addEventListener("change", preferences);
  document.addEventListener("visibilitychange", visibility);

  return {
    add(svg: SVGSVGElement, gaze: boolean) {
      targets.set(svg, { gaze, visible: true });
      reset(svg); observer?.observe(svg); visibility(); preferences();
      return () => {
        observer?.unobserve(svg); targets.delete(svg); reset(svg);
        svg.removeAttribute("data-offscreen");
        preferences();
        if (targets.size === 0) {
          cancel(); observer?.disconnect();
          reduce.removeEventListener("change", preferences);
          fine.removeEventListener("change", preferences);
          document.removeEventListener("visibilitychange", visibility);
          controller = null;
        }
      };
    },
  };
}
let controller: ReturnType<typeof createController> | null = null;

/** Follow the mouse/pen with rAF; no pointer subscription in reduced motion or on touch.
 * Also pauses CSS animations offscreen and when the tab is hidden, even with gaze=false.
 */
export function useGaze(ref: RefObject<SVGSVGElement>, enabled = true) {
  useEffect(() => {
    if (!ref.current) return;
    controller ??= createController();
    return controller.add(ref.current, enabled);
  }, [ref, enabled]);
}
