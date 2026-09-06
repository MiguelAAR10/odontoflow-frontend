import type { ElementType, ReactNode } from "react";

export function Surface({ as: Component = "section", children, className = "", id }: { as?: ElementType; children: ReactNode; className?: string; id?: string }) {
  return <Component className={`surface ${className}`} id={id}>{children}</Component>;
}
