import { roleOptions, useDemoRole } from "../roles";

export function LocationContext() {
  const [role, , ready] = useDemoRole();
  if (!ready) return null;
  const current = roleOptions.find((option) => option.id === role) ?? roleOptions[1];

  return <div className="location-context" aria-label="Contexto de sede">
    <span className="location-context__eyebrow">{current.label}</span>
    <strong>{current.scope}</strong>
  </div>;
}
