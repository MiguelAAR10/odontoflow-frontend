type InsightFact = { label: string; value: string };

export function InsightBar({
  eyebrow = "Lectura del sistema",
  title,
  body,
  facts,
  source,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  facts: InsightFact[];
  source?: string;
}) {
  return (
    <section className="insight-bar" aria-label={eyebrow}>
      <div className="insight-bar__main">
        <h2>{title}</h2>
        {(body || source) && <span className="sr-only">{body} {source}</span>}
      </div>
      <div className="insight-bar__facts" data-fact-count={facts.length} aria-label="Evidencia del insight">
        {facts.map((fact) => (
          <div key={fact.label}>
            <span>{fact.label}</span>
            <strong>{fact.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
