import type { ReactNode } from "react";

export function PageHeader({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children?: ReactNode }) {
  return <div className={`page-heading ${actions || children ? "page-heading--with-actions" : ""}`}>
    <div><h1>{title}</h1>{description && <p className="sr-only">{description}</p>}</div>
    {(actions || children) && <div className="heading-actions">{actions}{children}</div>}
  </div>;
}
