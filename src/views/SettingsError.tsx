import type { ApiError } from "../contracts/client";

/** Shared by every Configuración section: a 403 says "Sin acceso", anything else a failed request. */
export function SettingsError({ error }: { error: ApiError }) {
  return <div className="approvals-notice" role="alert">
    <h3>{error.httpStatus === 403 ? "Sin acceso" : "No se pudo completar la solicitud"}</h3>
    <p>{error.message}</p>
  </div>;
}
