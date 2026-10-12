import type { ApiError } from "../contracts/client";

/** Spanish for the backend's stable codes; anything else shows the backend's own message. */
const MESSAGES: Record<string, string> = {
  ENTITY_INACTIVE: "Ya estaba inactivo. Vuelve a cargar la página para ver el estado actual.",
  IDEMPOTENCY_KEY_REUSED: "Ese intento ya se registró con otros datos. Vuelve a intentarlo.",
  NOT_FOUND: "No se encontró el registro. Vuelve a cargar la página.",
};

/** Shared by every Configuración section: a 403 says "Sin acceso" (the session stays), anything else a failed request. */
export function SettingsError({ error }: { error: ApiError }) {
  if (error.httpStatus === 403) {
    return <div className="approvals-notice" role="alert">
      <h3>Sin acceso</h3>
      <p>Tu perfil no tiene permiso para esta acción. Tu sesión sigue activa.</p>
    </div>;
  }
  return <div className="approvals-notice" role="alert">
    <h3>No se pudo completar la solicitud</h3>
    <p>{MESSAGES[error.code] ?? error.message}</p>
  </div>;
}
