"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRightLeft, ArrowUpDown, Boxes, ChevronDown, ClipboardPen, MapPin, PackagePlus, Plus, Search, SlidersHorizontal } from "lucide-react";
import { createProduct, loadInventoryData, loadMovements, loadProductBalance, newIdempotencyKey, registerAdjustment, registerEntry, registerTransfer, sumAvailable, toApiError } from "../api";
import { Badge, statusTone } from "../components/Badge";
import { Button } from "../components/Button";
import { type Column, DataTable } from "../components/DataTable";
import { KpiCard } from "../components/KpiCard";
import { Modal } from "../components/Modal";
import type { InventoryLocation, InventoryMovement, MovementType, Product, Tone } from "../types";

const kindLabel = (kind: Product["kind"]) => (kind === "reventa" ? "Reventa" : "Consumible");
const kindTone = (kind: Product["kind"]): Tone => (kind === "reventa" ? "blue" : "cyan");

const movementLabels: Record<MovementType, string> = {
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  ADJUSTMENT: "Ajuste",
  TRANSFER_OUT: "Salida por transferencia",
  TRANSFER_IN: "Entrada por transferencia",
};

function movementTone(type: MovementType): Tone {
  if (type === "ENTRADA" || type === "TRANSFER_IN") return "green";
  if (type === "ADJUSTMENT") return "red";
  return "amber";
}

function movementSign(type: MovementType, quantity: number): string {
  if (type === "SALIDA" || type === "TRANSFER_OUT") return `-${quantity}`;
  if (type === "ENTRADA" || type === "TRANSFER_IN") return `+${quantity}`;
  return `${quantity > 0 ? "+" : ""}${quantity}`;
}

function formatInstant(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString("es-PE", { day: "numeric", month: "short" })} · ${date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: true })}`;
}

const locationName = (locations: InventoryLocation[], id: string): string =>
  locations.find((location) => location.id === id)?.name ?? "sede";

export function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [kind, setKind] = useState("Todos");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newOpen, setNewOpen] = useState(false);
  const [entryTarget, setEntryTarget] = useState<Product | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);
  const [transferTarget, setTransferTarget] = useState<Product | null>(null);
  const [kardexTarget, setKardexTarget] = useState<Product | null>(null);
  const [kardexRows, setKardexRows] = useState<InventoryMovement[]>([]);
  const [kardexError, setKardexError] = useState("");
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await loadInventoryData();
      setProducts(data.products);
      setLocations(data.locations);
      const active = data.locations.find((location) => location.isActive);
      setSelectedLocationId((current) => current || active?.id || "");
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Balance per product at the selected location.
  useEffect(() => {
    if (!products.length || !selectedLocationId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all(products.map((product) => loadProductBalance(product.id, selectedLocationId)))
      .then((rows) => {
        if (!cancelled) setBalances(new Map(rows.map((row) => [row.productId, row.available])));
      })
      .catch((caught) => {
        if (!cancelled) setError(toApiError(caught).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [products, selectedLocationId]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return products.filter((product) =>
      (kind === "Todos" || product.kind === kind) &&
      (!normalized || product.name.toLowerCase().includes(normalized)),
    );
  }, [products, kind, query]);

  const balanceOf = (productId: string): number => balances.get(productId) ?? 0;
  const unitOf = (productId: string): string => products.find((product) => product.id === productId)?.unit ?? "";
  const balanceRows = useMemo(
    () => products.map((product) => ({ productId: product.id, locationId: selectedLocationId, available: balanceOf(product.id) })),
    [products, selectedLocationId, balances],
  );

  const closeMutationModal = () => {
    setEntryTarget(null);
    setAdjustTarget(null);
    setTransferTarget(null);
    setMutationError("");
  };

  const runMutation = async (action: () => Promise<void>) => {
    setMutationBusy(true);
    setMutationError("");
    try {
      await action();
      closeMutationModal();
      setNewOpen(false);
      await refresh();
    } catch (caught) {
      setMutationError(toApiError(caught).message);
    } finally {
      setMutationBusy(false);
    }
  };

  const submitProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runMutation(async () => {
      await createProduct(
        { name: String(form.get("name")), unit: String(form.get("unit")), kind: String(form.get("kind")) as Product["kind"] },
        newIdempotencyKey(),
      );
    });
  };

  const submitEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!entryTarget) return;
    const form = new FormData(event.currentTarget);
    const unitPrice = String(form.get("unit_price")).trim();
    await runMutation(async () => {
      await registerEntry(
        entryTarget.id,
        {
          location_id: Number(form.get("location")),
          quantity: Number(form.get("quantity")),
          unit_price: unitPrice ? Number(unitPrice) : null,
        },
        newIdempotencyKey(),
      );
    });
  };

  const submitAdjustment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!adjustTarget) return;
    const form = new FormData(event.currentTarget);
    await runMutation(async () => {
      await registerAdjustment(
        adjustTarget.id,
        {
          location_id: Number(form.get("location")),
          quantity: Number(form.get("quantity")),
          reason: String(form.get("reason")),
        },
        newIdempotencyKey(),
      );
    });
  };

  const submitTransfer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!transferTarget) return;
    const form = new FormData(event.currentTarget);
    await runMutation(async () => {
      await registerTransfer(
        transferTarget.id,
        {
          origin_location_id: Number(form.get("origin")),
          destination_location_id: Number(form.get("destination")),
          quantity: Number(form.get("quantity")),
          reason: String(form.get("reason")).trim() || null,
        },
        newIdempotencyKey(),
      );
    });
  };

  const openKardex = async (product: Product) => {
    setKardexTarget(product);
    setKardexRows([]);
    setKardexError("");
    try {
      setKardexRows(await loadMovements(product.id, selectedLocationId));
    } catch (caught) {
      setKardexError(toApiError(caught).message);
    }
  };

  const actionsCell = (product: Product) => (
    <div className="row-actions">
      <Button compact icon={PackagePlus} onClick={() => { setEntryTarget(product); setMutationError(""); }}>Entrada</Button>
      <Button compact icon={SlidersHorizontal} onClick={() => { setAdjustTarget(product); setMutationError(""); }}>Ajuste</Button>
      <Button compact icon={ArrowUpDown} onClick={() => { setTransferTarget(product); setMutationError(""); }}>Transferir</Button>
      <Button compact icon={ClipboardPen} onClick={() => void openKardex(product)}>Kardex</Button>
    </div>
  );

  const columns: Column<Product>[] = [
    { key: "name", header: "Producto", width: "24%", render: (product) => <span className="product-cell"><span className={`product-icon tone-bg--${kindTone(product.kind)}`}>{product.name.slice(0, 1)}</span><strong>{product.name}</strong></span> },
    { key: "kind", header: "Tipo", render: (product) => <Badge tone={kindTone(product.kind)}>{kindLabel(product.kind)}</Badge> },
    { key: "unit", header: "Unidad", render: (product) => product.unit },
    { key: "balance", header: selectedLocationId ? `Stock en ${locationName(locations, selectedLocationId)}` : "Stock", render: (product) => <strong>{balanceOf(product.id)} {product.unit}</strong> },
    { key: "status", header: "Estado", render: (product) => <Badge tone={statusTone(product.status)}>{product.status}</Badge> },
    { key: "actions", header: "", width: "30%", render: actionsCell },
  ];

  const kardexColumns: Column<InventoryMovement>[] = [
    { key: "movedAt", header: "Fecha", render: (row) => formatInstant(row.movedAt) },
    { key: "type", header: "Tipo", render: (row) => <Badge tone={movementTone(row.type)}>{movementLabels[row.type]}</Badge> },
    { key: "quantity", header: "Cantidad", render: (row) => <strong className={row.type === "ADJUSTMENT" && row.quantity < 0 ? "text-danger" : ""}>{movementSign(row.type, row.quantity)} {unitOf(row.productId)}</strong> },
    { key: "unitPrice", header: "Precio unit.", render: (row) => row.unitPrice != null ? `S/ ${row.unitPrice}` : "—" },
    { key: "reason", header: "Motivo", render: (row) => row.reason ?? "—" },
    { key: "transferId", header: "Transferencia", render: (row) => row.transferId ?? "—" },
  ];

  return (
    <section className="page">
      <div className="page-heading"><h1>Gestión de inventario</h1><p>Stock por producto y sede</p></div>
      <div className="kpi-grid">
        <KpiCard icon={Boxes} value={products.length} label="Productos" tone="cyan" />
        <KpiCard icon={MapPin} value={locations.length} label="Sedes" tone="blue" />
        <KpiCard icon={PackagePlus} value={sumAvailable(balanceRows)} label={selectedLocationId ? `Unidades en ${locationName(locations, selectedLocationId)}` : "Unidades en stock"} tone="green" />
        <KpiCard icon={ArrowRightLeft} value={balanceRows.filter((row) => row.available <= 0).length} label="Sin stock en la sede" tone="amber" />
      </div>
      <section className="panel table-panel table-panel--flush">
        <div className="table-toolbar inventory-toolbar">
          <label className="select-control"><select value={selectedLocationId} onChange={(event) => setSelectedLocationId(event.target.value)} aria-label="Sede" disabled={!locations.length}>{locations.length ? locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>) : <option value="">Sin sedes</option>}</select><ChevronDown size={16} /></label>
          <label className="select-control"><select value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Tipo de producto"><option value="Todos">Tipo: Todos</option><option value="consumible">Consumible</option><option value="reventa">Reventa</option></select><ChevronDown size={16} /></label>
          <label className="search-control"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto" aria-label="Buscar producto" /></label>
          <Button variant="primary" icon={Plus} onClick={() => { setNewOpen(true); setMutationError(""); }}>Nuevo producto</Button>
        </div>
        {error && <div className="form-error" role="alert">{error}<Button compact onClick={() => void refresh()}>Reintentar</Button></div>}
        {loading && <div className="table-loading" role="status">Cargando inventario…</div>}
        {!loading && <DataTable columns={columns} rows={filtered} rowKey={(product) => product.id} emptyMessage="No hay productos registrados" />}
        <div className="pagination"><span>{filtered.length} productos · balance por sede</span><div /></div>
      </section>

      <Modal title="Nuevo producto" open={newOpen} onClose={() => setNewOpen(false)}>
        <form className="form-grid" onSubmit={submitProduct}>
          {mutationError && <div className="form-error field--wide" role="alert">{mutationError}</div>}
          <label className="field field--wide"><span>Nombre del producto</span><input name="name" required autoFocus disabled={mutationBusy} /></label>
          <label className="field"><span>Tipo</span><select name="kind" defaultValue="consumible" disabled={mutationBusy}><option value="consumible">Consumible</option><option value="reventa">Reventa</option></select></label>
          <label className="field"><span>Unidad de medida</span><input name="unit" placeholder="cajas, unidades, frascos…" required disabled={mutationBusy} /></label>
          <div className="form-actions field--wide"><Button type="button" onClick={() => setNewOpen(false)} disabled={mutationBusy}>Cancelar</Button><Button type="submit" variant="primary" disabled={mutationBusy}>{mutationBusy ? "Guardando…" : "Guardar producto"}</Button></div>
        </form>
      </Modal>

      <Modal title={entryTarget ? `Entrada de stock · ${entryTarget.name}` : "Entrada de stock"} open={Boolean(entryTarget)} onClose={closeMutationModal}>
        {entryTarget && <form className="form-grid" onSubmit={submitEntry}>
          <div className="detail-list field--wide">
            <div><span>Producto</span><strong>{entryTarget.name}</strong></div>
          </div>
          {mutationError && <div className="form-error field--wide" role="alert">{mutationError}</div>}
          <label className="field"><span>Sede</span><select name="location" defaultValue={selectedLocationId || locations[0]?.id} required disabled={mutationBusy}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
          <label className="field"><span>Cantidad</span><input name="quantity" type="number" min="0.01" step="any" required disabled={mutationBusy} autoFocus /></label>
          <label className="field field--wide"><span>Precio unitario (opcional)</span><input name="unit_price" type="number" min="0" step="any" disabled={mutationBusy} /></label>
          <div className="form-actions field--wide"><Button type="button" onClick={closeMutationModal} disabled={mutationBusy}>Cancelar</Button><Button type="submit" variant="primary" disabled={mutationBusy}>{mutationBusy ? "Registrando…" : "Registrar entrada"}</Button></div>
        </form>}
      </Modal>

      <Modal title={adjustTarget ? `Ajuste de stock · ${adjustTarget.name}` : "Ajuste de stock"} open={Boolean(adjustTarget)} onClose={closeMutationModal}>
        {adjustTarget && <form className="form-grid" onSubmit={submitAdjustment}>
          <div className="detail-list field--wide">
            <div><span>Producto</span><strong>{adjustTarget.name}</strong></div>
            <div><span>Stock actual en la sede</span><strong>{balanceOf(adjustTarget.id)} {adjustTarget.unit}</strong></div>
          </div>
          {mutationError && <div className="form-error field--wide" role="alert">{mutationError}</div>}
          <label className="field"><span>Sede</span><select name="location" defaultValue={selectedLocationId || locations[0]?.id} required disabled={mutationBusy}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
          <label className="field"><span>Cantidad (signo: +agregar / −quitar)</span><input name="quantity" type="number" step="any" required disabled={mutationBusy} autoFocus /></label>
          <label className="field field--wide"><span>Motivo (obligatorio)</span><input name="reason" maxLength={255} required disabled={mutationBusy} /></label>
          <div className="form-actions field--wide"><Button type="button" onClick={closeMutationModal} disabled={mutationBusy}>Cancelar</Button><Button type="submit" variant="primary" disabled={mutationBusy}>{mutationBusy ? "Registrando…" : "Registrar ajuste"}</Button></div>
        </form>}
      </Modal>

      <Modal title={transferTarget ? `Transferir · ${transferTarget.name}` : "Transferir"} open={Boolean(transferTarget)} onClose={closeMutationModal} size="large">
        {transferTarget && <form className="form-grid" onSubmit={submitTransfer}>
          <div className="detail-list field--wide">
            <div><span>Producto</span><strong>{transferTarget.name}</strong></div>
          </div>
          {mutationError && <div className="form-error field--wide" role="alert">{mutationError}</div>}
          <label className="field"><span>Origen</span><select name="origin" defaultValue={selectedLocationId || locations[0]?.id} required disabled={mutationBusy}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
          <label className="field"><span>Destino</span><select name="destination" required disabled={mutationBusy}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
          <label className="field"><span>Cantidad</span><input name="quantity" type="number" min="0.01" step="any" required disabled={mutationBusy} autoFocus /></label>
          <label className="field"><span>Motivo (opcional)</span><input name="reason" maxLength={255} disabled={mutationBusy} /></label>
          <div className="form-actions field--wide"><Button type="button" onClick={closeMutationModal} disabled={mutationBusy}>Cancelar</Button><Button type="submit" variant="primary" disabled={mutationBusy}>{mutationBusy ? "Transfiriendo…" : "Realizar transferencia"}</Button></div>
        </form>}
      </Modal>

      <Modal title={kardexTarget ? `Kardex · ${kardexTarget.name} · ${locationName(locations, selectedLocationId)}` : "Kardex"} open={Boolean(kardexTarget)} onClose={() => setKardexTarget(null)} size="large">
        {kardexTarget && <div>
          {kardexError && <div className="form-error" role="alert">{kardexError}<Button compact onClick={() => void openKardex(kardexTarget)}>Reintentar</Button></div>}
          <DataTable columns={kardexColumns} rows={kardexRows} rowKey={(row) => row.id} emptyMessage="Sin movimientos en esta sede" />
        </div>}
      </Modal>
    </section>
  );
}
