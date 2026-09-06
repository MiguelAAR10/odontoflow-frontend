import { UserRound } from "lucide-react";

export function UserSlot() {
  return <div className="user-slot" role="status" aria-label="Contexto local, sin sesión">
    <span className="user-slot__avatar"><UserRound size={17} aria-hidden="true" /></span>
    <span className="user-slot__copy"><strong>Contexto local</strong><small>Sin sesión</small></span>
  </div>;
}
