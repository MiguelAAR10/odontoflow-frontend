"use client";

import { MotionConfig, motion } from "motion/react";
import type { ReactNode } from "react";
import { useReducedMotionPreference } from "../crew/useReducedMotionPreference";
import "./catalog.css";

/** One bounded reveal: frame → title → prose → data. Never animates layout. */
export function Layers({ children, as = "section", className = "", labelledBy, busy, cardId }: {
  children: ReactNode; as?: "section" | "article" | "div"; className?: string;
  labelledBy?: string; busy?: boolean; cardId?: string;
}) {
  const reduced = useReducedMotionPreference();
  const Frame = motion[as];
  return <MotionConfig reducedMotion="user">
    <Frame className={`airi-catalog ${className}`} aria-labelledby={labelledBy} aria-busy={busy} data-card={cardId}
      initial="hidden" animate="visible"
      variants={{ hidden: { opacity: 0, ...(reduced ? {} : { y: 5 }) }, visible: { opacity: 1, ...(reduced ? {} : { y: 0 }), transition: { duration: reduced ? .15 : .25, staggerChildren: reduced ? 0 : .05 } } }}>
      {children}
    </Frame>
  </MotionConfig>;
}

export function Layer({ children, stage, className = "" }: { children: ReactNode; stage: "title" | "text" | "data"; className?: string }) {
  const reduced = useReducedMotionPreference();
  return <motion.div data-layer={stage} className={className}
    variants={{ hidden: { opacity: 0, ...(reduced ? {} : { y: 4 }) }, visible: { opacity: 1, ...(reduced ? {} : { y: 0 }), transition: { duration: reduced ? .15 : .25 } } }}>
    {children}
  </motion.div>;
}
