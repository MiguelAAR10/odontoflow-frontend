import { PageHeader } from "../PageHeader";

/** Route placeholder until the owning view task supplies its content. */
export function EmptyShellPage({ title }: { title: string }) {
  return <section className="page shell-empty-page">
    <PageHeader title={title} />
    <p className="empty-state" role="status">Esta sección estará disponible próximamente.</p>
  </section>;
}
