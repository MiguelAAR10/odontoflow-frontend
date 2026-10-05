"use client";

import { useEffect, useState } from "react";

export type ProductRole = "owner" | "admin" | "collaborator";

export type CapabilityCode =
  | "appointments.read" | "appointments.create" | "appointments.cancel" | "appointments.reschedule"
  | "patients.read" | "patients.create" | "leads.read" | "leads.create" | "leads.assign_location"
  | "visits.read" | "visits.create" | "executions.read" | "executions.create"
  | "clinical_records.read" | "clinical_records.update" | "charges.read" | "payments.read" | "payments.create"
  | "products.read" | "products.create" | "movements.read" | "movements.create"
  | "locations.read" | "locations.manage" | "analytics.read" | "requests.read" | "requests.create"
  | "requests.update" | "labs.read" | "labs.create" | "users.read" | "users.manage";

export const roleOptions: Array<{ id: ProductRole; label: string; scope: string }> = [
  { id: "owner", label: "Owner", scope: "Todas las sedes" },
  { id: "admin", label: "Administrativo", scope: "Sede asignada" },
  { id: "collaborator", label: "Doctor", scope: "Mi día clínico" },
];

const roleRoutes: Record<ProductRole, string[]> = {
  owner: ["/", "/sedes", "/agenda", "/pacientes", "/caja", "/finanzas", "/inventario", "/comercial", "/produccion", "/agente", "/chat"],
  admin: ["/", "/agenda", "/pacientes", "/atencion", "/visitas", "/caja", "/inventario", "/solicitudes", "/agente", "/chat"],
  collaborator: ["/", "/mi-dia", "/mis-pacientes", "/visitas", "/solicitudes", "/asistente"],
};

const roleCapabilities: Record<ProductRole, CapabilityCode[]> = {
  owner: [
    "appointments.read", "patients.read", "leads.read", "visits.read", "executions.read",
    "charges.read", "payments.read", "products.read", "products.create", "movements.read", "movements.create", "locations.read", "locations.manage",
    "analytics.read", "labs.read", "requests.read", "users.read", "users.manage",
  ],
  admin: [
    "appointments.read", "appointments.create", "appointments.cancel", "appointments.reschedule", "patients.read", "patients.create",
    "leads.read", "leads.create", "leads.assign_location", "visits.read", "visits.create", "executions.read", "charges.read",
    "payments.read", "payments.create", "products.read", "products.create", "movements.read", "movements.create", "locations.read",
    "requests.read", "requests.create", "requests.update", "labs.read", "labs.create",
  ],
  collaborator: [
    "appointments.read", "patients.read", "leads.read", "visits.read", "visits.create", "executions.read", "executions.create",
    "clinical_records.read", "clinical_records.update", "requests.read", "requests.create", "labs.read",
  ],
};

export function canAccessPath(role: ProductRole, pathname: string): boolean {
  return roleRoutes[role].some((route) => route === "/" ? pathname === "/" : pathname === route || pathname.startsWith(`${route}/`));
}

export function hasCapability(role: ProductRole, capability: CapabilityCode): boolean {
  return roleCapabilities[role].includes(capability);
}

export function canAccessClinicalVisit(role: ProductRole, actorPractitionerId: string | null, visitPractitionerId: string): boolean {
  return role !== "collaborator" || (actorPractitionerId !== null && actorPractitionerId === visitPractitionerId);
}

export function canReadClinicalRecord(role: ProductRole, actorPractitionerId: string | null, visitPractitionerId: string): boolean {
  return role === "collaborator" && actorPractitionerId !== null && actorPractitionerId === visitPractitionerId;
}

export function capabilitiesForRole(role: ProductRole): CapabilityCode[] {
  return [...roleCapabilities[role]];
}

const storageKey = "odontoflow-demo-role";
const eventName = "odontoflow-role-change";

function normalizeRole(value: string | null): ProductRole | null {
  if (value === "doctor") return "collaborator";
  if (value === "owner" || value === "admin" || value === "collaborator") return value;
  return null;
}

export function readDemoRole(): ProductRole {
  if (typeof window === "undefined") return "admin";
  const stored = window.localStorage.getItem(storageKey);
  return normalizeRole(stored) ?? "admin";
}

export function writeDemoRole(role: ProductRole) {
  window.localStorage.setItem(storageKey, role);
  window.dispatchEvent(new CustomEvent(eventName, { detail: role }));
}

export function useDemoRole() {
  const [role, setRoleState] = useState<ProductRole>("admin");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setRoleState(readDemoRole());
    setReady(true);
    const sync = () => setRoleState(readDemoRole());
    window.addEventListener(eventName, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(eventName, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setRole = (nextRole: ProductRole) => {
    setRoleState(nextRole);
    writeDemoRole(nextRole);
  };

  return [role, setRole, ready] as const;
}
