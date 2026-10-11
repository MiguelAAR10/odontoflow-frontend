// TODO(B7): reemplazar por tipos generados de openapi
/**
 * ADMIN-01 contract for the `/admin/*` routes (plan §2.6, backend tasks B6–B7).
 *
 * Temporary, deliberate exception to "contracts are generated, never
 * handwritten": the backend `/admin` router is still being written, so
 * `src/contracts/api.ts` does not know these schemas yet. They mirror the
 * plan's schemas field for field (`app/administration/schemas.py`) so the
 * client, the adapter and the panel can be built in parallel.
 *
 * When B7 is integrated: run `npm run openapi:generate`, point every type
 * below at `components["schemas"][...]` in `client.ts`, and delete this file.
 */

export type AdminEntityType =
  | "practitioner_membership"
  | "practitioner_capability"
  | "availability_rule"
  | "location"
  | "service";

/** Body of every `.../deactivate`: the reason is mandatory (3–250 characters). */
export interface DeactivationRequest {
  reason: string;
}

export interface PractitionerProfileUpdate {
  display_name: string;
}

/** Stable, typed outcome of every activate/deactivate command (replayed by PF4). */
export interface AdminToggleRead {
  entity_type: AdminEntityType;
  id: number;
  practitioner_id: number | null;
  is_active: boolean;
  /** ISO instant; null while the entity is active. */
  deactivated_at: string | null;
  reason?: string | null;
}

export interface PractitionerProfileRead {
  id: number;
  display_name: string;
}

export interface AdminCapabilityRead {
  id: number;
  service_id: number;
  service_name: string;
  location_id: number;
  location_name: string;
  is_active: boolean;
  deactivated_at: string | null;
}

export interface AdminAvailabilityRuleRead {
  id: number;
  location_id: number;
  location_name: string;
  /** 0 = Monday … 6 = Sunday. */
  day_of_week: number;
  /** Wall-clock time in the location's timezone, `HH:MM:SS`. */
  start_local: string;
  end_local: string;
  is_active: boolean;
  deactivated_at: string | null;
}

export interface PractitionerRosterRead {
  id: number;
  display_name: string;
  /** Platform-wide kill switch: read-only for a clinic. */
  platform_active: boolean;
  /** Whether the doctor works for this organization. */
  membership_active: boolean;
  deactivated_at: string | null;
  future_confirmed_appointments: number;
  capabilities: AdminCapabilityRead[];
  availability_rules: AdminAvailabilityRuleRead[];
}

export interface AdminAuditEventRead {
  id: number;
  occurred_at: string;
  action: string;
  entity_type: string;
  entity_id: string;
  actor_type: string;
  actor_id: string;
  before_state: { [key: string]: unknown } | null;
  after_state: { [key: string]: unknown } | null;
}
