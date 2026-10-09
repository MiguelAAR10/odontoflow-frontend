"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { MapPin, Plus, Stethoscope } from "lucide-react";
import { ApiError, newIdempotencyKey, toApiError, type LocationRead, type ServiceRead } from "../contracts/client";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { DataTable, type Column } from "../components/DataTable";
import {
  createSettingsLocation, createSettingsService, loadSettingsLocations, loadSettingsServices,
  type LocationCreate, type ServiceCreate,
} from "../settings";

function useSettingsCatalog<T extends { id: number }, Input>(
  load: () => Promise<T[]>,
  create: (input: Input, key: string) => Promise<T>,
) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [mutationError, setMutationError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const intent = useRef<{ input: string; key: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    load().then((data) => {
      if (!cancelled) setRows(data);
    }).catch((caught: unknown) => {
      if (!cancelled) setLoadError(toApiError(caught));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [load]);

  async function save(input: Input, form: HTMLFormElement) {
    if (busyRef.current || loading || loadError) return;
    busyRef.current = true;
    setBusy(true);
    setMutationError(null);
    try {
      const serialized = JSON.stringify(input);
      // An unchanged retry retains its key; changed data starts a new intent.
      if (intent.current?.input !== serialized) {
        intent.current = { input: serialized, key: newIdempotencyKey() };
      }
      const row = await create(input, intent.current.key);
      setRows((current) => [...current.filter((item) => item.id !== row.id), row]);
      intent.current = null;
      form.reset();
    } catch (caught) {
      setMutationError(toApiError(caught));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return { rows, loading, loadError, mutationError, busy, save };
}

function SettingsError({ error }: { error: ApiError }) {
  return <div className="approvals-notice" role="alert">
    <h3>{error.httpStatus === 403 ? "Sin acceso" : "No se pudo completar la solicitud"}</h3>
    <p>{error.message}</p>
  </div>;
}

const locationColumns: Column<LocationRead>[] = [
  { key: "name", header: "Nombre", render: (row) => <strong>{row.name}</strong> },
  { key: "timezone", header: "Zona horaria", render: (row) => row.timezone },
  { key: "active", header: "Activa", render: (row) => <Badge tone={row.is_active ? "green" : "slate"}>{row.is_active ? "Sí" : "No"}</Badge> },
];
const serviceColumns: Column<ServiceRead>[] = [
  { key: "name", header: "Nombre", render: (row) => <strong>{row.name}</strong> },
  { key: "duration", header: "Duración (minutos)", render: (row) => row.duration_minutes },
  { key: "active", header: "Activo", render: (row) => <Badge tone={row.is_active ? "green" : "slate"}>{row.is_active ? "Sí" : "No"}</Badge> },
];

export function SettingsPage() {
  const locations = useSettingsCatalog<LocationRead, LocationCreate>(loadSettingsLocations, createSettingsLocation);
  const services = useSettingsCatalog<ServiceRead, ServiceCreate>(loadSettingsServices, createSettingsService);

  function submitLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void locations.save({ name: String(data.get("name")).trim(), timezone: String(data.get("timezone")).trim() }, form);
  }

  function submitService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void services.save({
      name: String(data.get("name")).trim(), duration_minutes: Number(data.get("duration")),
      is_active: data.get("active") === "true",
    }, form);
  }

  return <div style={{ display: "grid", gap: "var(--space-6)", marginBottom: "var(--space-6)" }}>
    <section className="panel table-panel table-panel--flush" aria-labelledby="settings-locations">
      <div className="panel-header"><h2 id="settings-locations"><MapPin size={20} aria-hidden="true" /> Sedes</h2></div>
      {locations.loadError ? <SettingsError error={locations.loadError} /> : locations.mutationError?.httpStatus === 403 ? <SettingsError error={locations.mutationError} /> : locations.loading ? <p role="status" className="empty-state">Cargando sedes…</p> : <>
        <DataTable columns={locationColumns} rows={locations.rows} rowKey={(row) => String(row.id)} emptyMessage="No hay sedes registradas. Añade la primera sede." />
        <form className="form-grid" onSubmit={submitLocation} style={{ padding: "var(--space-5)" }} aria-label="Nueva sede" aria-busy={locations.busy}>
          <h3 className="field--wide" style={{ margin: 0 }}>Nueva sede</h3>
          {locations.mutationError && <div className="field--wide"><SettingsError error={locations.mutationError} /></div>}
          <label className="field"><span>Nombre de la sede</span><input name="name" required disabled={locations.busy} /></label>
          <label className="field"><span>Zona horaria</span><input name="timezone" placeholder="America/Lima" required disabled={locations.busy} aria-describedby="settings-timezone-help" /><small id="settings-timezone-help">Usa un identificador de zona horaria, como America/Lima.</small></label>
          <div className="form-actions field--wide"><Button type="submit" variant="primary" icon={Plus} disabled={locations.busy}>{locations.busy ? "Guardando…" : "Crear sede"}</Button></div>
        </form>
      </>}
    </section>
    <section className="panel table-panel table-panel--flush" aria-labelledby="settings-services">
      <div className="panel-header"><h2 id="settings-services"><Stethoscope size={20} aria-hidden="true" /> Servicios</h2></div>
      {services.loadError ? <SettingsError error={services.loadError} /> : services.mutationError?.httpStatus === 403 ? <SettingsError error={services.mutationError} /> : services.loading ? <p role="status" className="empty-state">Cargando servicios…</p> : <>
        <DataTable columns={serviceColumns} rows={services.rows} rowKey={(row) => String(row.id)} emptyMessage="No hay servicios registrados. Añade el primer servicio." />
        <form className="form-grid" onSubmit={submitService} style={{ padding: "var(--space-5)" }} aria-label="Nuevo servicio" aria-busy={services.busy}>
          <h3 className="field--wide" style={{ margin: 0 }}>Nuevo servicio</h3>
          {services.mutationError && <div className="field--wide"><SettingsError error={services.mutationError} /></div>}
          <label className="field"><span>Nombre del servicio</span><input name="name" required disabled={services.busy} /></label>
          <label className="field"><span>Duración (minutos)</span><input name="duration" type="number" min="1" step="1" required disabled={services.busy} /></label>
          <label className="field"><span>Activo</span><select name="active" defaultValue="true" disabled={services.busy}><option value="true">Sí</option><option value="false">No</option></select></label>
          <div className="form-actions field--wide"><Button type="submit" variant="primary" icon={Plus} disabled={services.busy}>{services.busy ? "Guardando…" : "Crear servicio"}</Button></div>
        </form>
      </>}
    </section>
  </div>;
}
