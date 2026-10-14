"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import { loadCanonicalLocations, toApiError, useMocks } from "../../../src/api";
import { usePersona } from "../../../src/components/PersonaContext";
import { useShellContext } from "../../../src/components/shell/ShellContext";
import { doctorDay, type DoctorAppointment } from "./doctor";

interface DoctorDayData { rows: DoctorAppointment[]; cut: string; doctor: string }
export function useDoctorDay() {
  const { role, locationId } = useShellContext();
  const { current, version } = usePersona();
  const noteScope = `${role}:${current ?? ""}:${version}`;
  const scope = `${noteScope}:${locationId}`;
  const [read, setRead] = useState<{ scope: string; data: DoctorDayData | null; error: string }>({ scope, data: null, error: "" });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setRead({ scope, data: null, error: "" });
    if (role !== "doctor" || !useMocks) return;
    void Promise.all([
      import("../../../src/agui/sim/fixtures/agenda.json"),
      import("../../../src/agui/sim/fixtures/clinic.json"),
      import("../../../src/agui/sim/fixtures/roles.json"),
      import("../../../src/agui/sim/fixtures/state.json"),
      loadCanonicalLocations(),
    ]).then(([agenda, clinic, roles, snapshots, locations]) => {
      const profile = roles.default.find(item => item.role === "doctor");
      const doctor = clinic.default.doctors.find(item => item.name === profile?.name);
      const cut = z.iso.datetime({ offset: true }).parse(snapshots.default[0]?.cut_at);
      const sede = locationId ? locations.find(item => String(item.id) === locationId)?.name : "";
      const rows = sede === undefined ? [] : doctorDay(agenda.default, doctor?.id ?? "", sede, cut);
      if (active) setRead({ scope, data: { rows, cut, doctor: doctor?.name ?? "" }, error: "" });
    }).catch(caught => { if (active) setRead({ scope, data: null, error: toApiError(caught).message }); });
    return () => { active = false; };
  }, [scope, role, locationId, retry]);
  const result = read.scope === scope ? read : null;
  return { data: role === "doctor" && useMocks ? result?.data ?? null : null, error: result?.error ?? "", retry: () => setRetry(value => value + 1), role, scope, noteScope };
}
