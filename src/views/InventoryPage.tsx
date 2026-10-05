"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowRightLeft, ArrowUpDown, Boxes, ChevronDown, ClipboardPen, MapPin, MessageCircle, Mic, PackagePlus, Plus, Search, SlidersHorizontal, Square } from "lucide-react";
import styles from "./InventoryPage.module.css";
import { createProduct, DEMO_TIME_ZONE, loadInventoryData, loadMovements, loadProductBalance, newIdempotencyKey, registerAdjustment, registerEntry, registerTransfer, toApiError, useMocks, useOdontoRepository, type OdontoSnapshot } from "../api";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { type Column, DataTable } from "../components/DataTable";
import { KpiCard } from "../components/KpiCard";
import { Modal } from "../components/Modal";
import { parseInventoryCountCommand } from "../inventory-count";
import { transcribeInventoryAudioDraft, VoiceDraftEmptyError, VoiceDraftUnavailableError, voiceDraftEnabled } from "../voice-draft";
import type { InventoryLocation, InventoryMovement, MovementType, Product, Tone } from "../types";

type VoiceDraftState = "idle" | "recording" | "transcribing";
type TelegramDraft = { messageId: string; sender: string; locationId: string; text: string; receivedAt: string };

const TELEGRAM_DEMO_DRAFTS: TelegramDraft[] = [
  { messageId: "tg-demo-1042", sender: "Rosa · Lince", locationId: "lince", text: "Guantes de nitrilo: 176 cajas", receivedAt: "08:42" },
  { messageId: "tg-demo-1043", sender: "Rosa · Lince", locationId: "lince", text: "Resina compuesta A2: 9 unidades", receivedAt: "08:46" },
];

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
  return `${date.toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: DEMO_TIME_ZONE })} · ${date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: DEMO_TIME_ZONE })}`;
}

const locationName = (locations: InventoryLocation[], id: string): string =>
  locations.find((location) => location.id === id)?.name ?? "sede";

function demoInventoryData(snapshot: OdontoSnapshot): { products: Product[]; locations: InventoryLocation[] } {
  const visibleLocations = snapshot.actor.role === "admin" && snapshot.actor.locationId
    ? snapshot.locations.filter((location) => location.id === snapshot.actor.locationId)
    : snapshot.locations;
  return {
    products: snapshot.products.map((product) => ({ ...product, status: "Activo" })),
    locations: visibleLocations.map((location) => ({ id: location.id, name: location.name, timezone: location.timezone, isActive: true })),
  };
}

function demoInventoryMovements(snapshot: OdontoSnapshot, productId: string, locationId: string): InventoryMovement[] {
  return snapshot.stockMovements.filter((movement) => movement.productId === productId && movement.locationId === locationId).map((movement) => ({
    id: movement.id,
    productId: movement.productId,
    locationId: movement.locationId,
    type: movement.type === "entry" ? "ENTRADA" : movement.type === "adjustment" ? "ADJUSTMENT" : movement.type === "transfer_in" ? "TRANSFER_IN" : "TRANSFER_OUT",
    quantity: movement.quantity,
    unitPrice: null,
    reason: movement.reason,
    transferId: movement.transferId,
    movedAt: movement.createdAt,
  }));
}

export function InventoryPage() {
  const { snapshot, dispatch } = useOdontoRepository();
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
  const [transferOriginId, setTransferOriginId] = useState("");
  const [transferDestinationId, setTransferDestinationId] = useState("");
  const [kardexTarget, setKardexTarget] = useState<Product | null>(null);
  const [kardexRows, setKardexRows] = useState<InventoryMovement[]>([]);
  const [kardexError, setKardexError] = useState("");
  const [countOpen, setCountOpen] = useState(false);
  const [countText, setCountText] = useState("");
  const [countProductId, setCountProductId] = useState("");
  const [countQuantity, setCountQuantity] = useState("");
  const [countLocationId, setCountLocationId] = useState("");
  const [countReason, setCountReason] = useState("");
  const [countBalance, setCountBalance] = useState<number | null>(null);
  const [countBalanceLoading, setCountBalanceLoading] = useState(false);
  const [countError, setCountError] = useState("");
  const [voiceDraftState, setVoiceDraftState] = useState<VoiceDraftState>("idle");
  const [voiceDraftError, setVoiceDraftError] = useState("");
  const [voiceDraftSummary, setVoiceDraftSummary] = useState("");
  const [telegramDraftId, setTelegramDraftId] = useState("");
  const [telegramDraftSummary, setTelegramDraftSummary] = useState("");
  const [telegramDraftError, setTelegramDraftError] = useState("");
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const pendingIdempotencyKeys = useRef(new Map<string, string>());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const discardRecordingRef = useRef(false);
  const voiceAbortRef = useRef<AbortController | null>(null);
  const demoData = useMemo(() => demoInventoryData(snapshot), [snapshot]);

  const idempotencyKeyFor = (intent: string) => {
    const existing = pendingIdempotencyKeys.current.get(intent);
    if (existing) return existing;
    const key = newIdempotencyKey();
    pendingIdempotencyKeys.current.set(intent, key);
    return key;
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = useMocks ? demoData : await loadInventoryData();
      setProducts(data.products);
      setLocations(data.locations);
      const active = data.locations.find((location) => location.isActive);
      setSelectedLocationId((current) => current || active?.id || "");
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      setLoading(false);
    }
  }, [demoData]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Balance per product at the selected location.
  useEffect(() => {
    if (!products.length || !selectedLocationId) return;
    if (useMocks) {
      setBalances(new Map(products.map((product) => [product.id, snapshot.balances[`${product.id}:${selectedLocationId}`] ?? 0])));
      setLoading(false);
      return;
    }
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
  }, [products, selectedLocationId, snapshot.balances]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return products.filter((product) =>
      (kind === "Todos" || product.kind === kind) &&
      (!normalized || product.name.toLowerCase().includes(normalized)),
    );
  }, [products, kind, query]);

  const balanceOf = (productId: string): number => balances.get(productId) ?? 0;
  const unitOf = (productId: string): string => products.find((product) => product.id === productId)?.unit ?? "";
  const countProduct = products.find((product) => product.id === countProductId) ?? null;
  const balanceRows = useMemo(
    () => products.map((product) => ({ productId: product.id, locationId: selectedLocationId, available: balanceOf(product.id) })),
    [products, selectedLocationId, balances],
  );

  const closeMutationModal = () => {
    setEntryTarget(null);
    setAdjustTarget(null);
    setTransferTarget(null);
    setTransferOriginId("");
    setTransferDestinationId("");
    setMutationError("");
  };

  const openCountDraft = () => {
    setCountText("");
    setCountProductId("");
    setCountQuantity("");
    setCountLocationId(selectedLocationId || locations[0]?.id || "");
    setCountReason("");
    setCountBalance(null);
    setCountError("");
    setMutationError("");
    setVoiceDraftState("idle");
    setVoiceDraftError("");
    setVoiceDraftSummary("");
    setTelegramDraftId("");
    setTelegramDraftSummary("");
    setTelegramDraftError("");
    setCountOpen(true);
  };

  const releaseVoiceCapture = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  };

  const voiceErrorMessage = (caught: unknown) => {
    if (caught instanceof VoiceDraftUnavailableError || caught instanceof VoiceDraftEmptyError) return caught.message;
    return "El servicio de transcripción no respondió. Puedes escribir el conteo en el mismo campo.";
  };

  const transcribeRecording = async (blob: Blob, mimeType: string) => {
    if (blob.size === 0) {
      setVoiceDraftError("La grabación está vacía. Intenta grabar de nuevo o escribe el conteo.");
      setVoiceDraftState("idle");
      return;
    }
    setVoiceDraftState("transcribing");
    setVoiceDraftError("");
    const controller = new AbortController();
    voiceAbortRef.current = controller;
    const extension = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
    try {
      const transcript = await transcribeInventoryAudioDraft(blob, `conteo.${extension}`, controller.signal);
      setCountText(transcript.texto);
      setCountProductId("");
      setCountQuantity("");
      setCountBalance(null);
      setCountError("");
      setMutationError("");
      setTelegramDraftId("");
      setTelegramDraftSummary("");
      setTelegramDraftError("");
      setVoiceDraftSummary(`Transcripción ${transcript.modelo} · ${transcript.segundos_proceso.toFixed(1)} s`);
    } catch (caught) {
      if (!controller.signal.aborted) setVoiceDraftError(voiceErrorMessage(caught));
    } finally {
      if (voiceAbortRef.current === controller) voiceAbortRef.current = null;
      setVoiceDraftState("idle");
    }
  };

  const startVoiceRecording = async () => {
    setVoiceDraftError("");
    setVoiceDraftSummary("");
    setTelegramDraftId("");
    setTelegramDraftSummary("");
    setTelegramDraftError("");
    setCountProductId("");
    setCountQuantity("");
    setCountBalance(null);
    setCountError("");
    setMutationError("");
    if (!voiceDraftEnabled) {
      setVoiceDraftError("La transcripción de borrador no está habilitada en este escenario.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceDraftError("Este navegador no permite grabar audio. Puedes escribir el conteo en el mismo campo.");
      return;
    }
    discardRecordingRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (discardRecordingRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
      recorder.onerror = () => {
        discardRecordingRef.current = true;
        setVoiceDraftError("No se pudo grabar el audio. Puedes escribir el conteo en el mismo campo.");
        setVoiceDraftState("idle");
        if (mediaRecorderRef.current === recorder) mediaRecorderRef.current = null;
        releaseVoiceCapture();
      };
      recorder.onstop = () => {
        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];
        if (mediaRecorderRef.current === recorder) mediaRecorderRef.current = null;
        releaseVoiceCapture();
        if (discardRecordingRef.current) {
          discardRecordingRef.current = false;
          setVoiceDraftState("idle");
          return;
        }
        const blob = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || "audio/webm" });
        void transcribeRecording(blob, blob.type);
      };
      recorder.start();
      setVoiceDraftState("recording");
    } catch (caught) {
      releaseVoiceCapture();
      setVoiceDraftState("idle");
      const name = caught instanceof DOMException ? caught.name : "";
      setVoiceDraftError(name === "NotAllowedError" || name === "SecurityError"
        ? "No se permitió el micrófono. Escribe el conteo en el mismo campo si prefieres."
        : name === "NotFoundError"
          ? "No se encontró un micrófono. Puedes escribir el conteo en el mismo campo."
          : "No se pudo abrir el micrófono. Puedes escribir el conteo en el mismo campo.");
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
  };

  const closeCountDraft = () => {
    discardRecordingRef.current = true;
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    voiceAbortRef.current?.abort();
    releaseVoiceCapture();
    setVoiceDraftState("idle");
    setCountOpen(false);
  };

  useEffect(() => () => {
    discardRecordingRef.current = true;
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    voiceAbortRef.current?.abort();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const interpretCount = () => {
    setVoiceDraftError("");
    setTelegramDraftError("");
    const parsed = parseInventoryCountCommand(countText, products);
    if (!parsed.ok) {
      const messages = {
        empty: "Escribe un producto y una cantidad para revisar el conteo.",
        not_found: "No identifiqué un producto exacto. Conservé el texto para que lo corrijas.",
        invalid: "No pude leer una cantidad o unidad válida. Usa “Producto: cantidad unidad”.",
        ambiguous: "Hay más de un producto con ese nombre. Corrige el nombre antes de continuar.",
      };
      setCountProductId("");
      setCountQuantity("");
      setCountError(messages[parsed.code]);
      return;
    }
    setCountProductId(parsed.productId);
    setCountQuantity(String(parsed.quantity));
    setCountLocationId(selectedLocationId || locations[0]?.id || "");
    setCountBalance(null);
    setCountError("");
    setMutationError("");
  };

  const applyTelegramDraft = (draft: TelegramDraft) => {
    if (!useMocks) {
      setTelegramDraftError("Telegram real necesita identidad, allowlist y sede del servidor.");
      return;
    }
    if (telegramDraftId === draft.messageId) {
      setTelegramDraftError("Ese mensaje ya está cargado como borrador. No se duplica.");
      return;
    }
    setCountText(draft.text);
    setCountProductId("");
    setCountQuantity("");
    setCountLocationId(locations.some((location) => location.id === draft.locationId) ? draft.locationId : selectedLocationId || locations[0]?.id || "");
    setCountBalance(null);
    setCountError("");
    setMutationError("");
    setVoiceDraftError("");
    setVoiceDraftSummary("");
    setTelegramDraftError("");
    setTelegramDraftId(draft.messageId);
    setTelegramDraftSummary(`${draft.sender} · ${draft.receivedAt}`);
  };

  useEffect(() => {
    if (!countOpen || !countProductId || !countLocationId) {
      setCountBalance(null);
      setCountBalanceLoading(false);
      return;
    }
    if (useMocks) {
      setCountBalance(snapshot.balances[`${countProductId}:${countLocationId}`] ?? 0);
      setCountBalanceLoading(false);
      return;
    }
    let cancelled = false;
    setCountBalance(null);
    setCountBalanceLoading(true);
    loadProductBalance(countProductId, countLocationId)
      .then((balance) => { if (!cancelled) setCountBalance(balance.available); })
      .catch((caught) => { if (!cancelled) setCountError(toApiError(caught).message); })
      .finally(() => { if (!cancelled) setCountBalanceLoading(false); });
    return () => { cancelled = true; };
  }, [countOpen, countProductId, countLocationId, snapshot.balances]);

  const submitCount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!countProduct || countBalance == null || voiceDraftState !== "idle") return;
    if (!useMocks) {
      setCountError("El ajuste de conteo está disponible solo en el escenario demo hasta completar identidad y permisos de servidor.");
      return;
    }
    const counted = Number(countQuantity);
    const reason = countReason.trim();
    if (!Number.isFinite(counted) || counted < 0) {
      setCountError("La cantidad contada debe ser cero o un número positivo.");
      return;
    }
    if (!reason) {
      setCountError("Escribe el motivo del ajuste antes de confirmar.");
      return;
    }
    const delta = counted - countBalance;
    if (delta === 0) {
      setCountError("El conteo coincide con el saldo actual; no hace falta registrar un ajuste.");
      return;
    }
    const intent = JSON.stringify(["written-count", countProduct.id, countLocationId, counted, countBalance, reason]);
    await runMutation(async () => {
      await dispatch({ type: "moveStock", kind: "adjustment", productId: countProduct.id, locationId: countLocationId, quantity: delta, reason });
    }, intent);
  };

  const runMutation = async (action: () => Promise<void>, intent?: string) => {
    setMutationBusy(true);
    setMutationError("");
    try {
      await action();
      if (intent) pendingIdempotencyKeys.current.delete(intent);
      closeMutationModal();
      setNewOpen(false);
      setCountOpen(false);
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
    const name = String(form.get("name"));
    const unit = String(form.get("unit"));
    const productKind = String(form.get("kind")) as Product["kind"];
    const intent = JSON.stringify(["product", name, unit, productKind]);
    await runMutation(async () => {
      if (useMocks) await dispatch({ type: "createProduct", name, unit, kind: productKind });
      else await createProduct({ name, unit, kind: productKind }, idempotencyKeyFor(intent));
    }, intent);
  };

  const submitEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!entryTarget) return;
    const form = new FormData(event.currentTarget);
    const unitPrice = String(form.get("unit_price")).trim();
    const locationId = String(form.get("location"));
    const quantity = Number(form.get("quantity"));
    const intent = JSON.stringify(["entry", entryTarget.id, locationId, quantity, unitPrice]);
    await runMutation(async () => {
      if (useMocks) await dispatch({ type: "moveStock", kind: "entry", productId: entryTarget.id, locationId, quantity });
      else await registerEntry(entryTarget.id, { location_id: Number(locationId), quantity, unit_price: unitPrice ? Number(unitPrice) : null }, idempotencyKeyFor(intent));
    }, intent);
  };

  const submitAdjustment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!adjustTarget) return;
    const form = new FormData(event.currentTarget);
    const locationId = String(form.get("location"));
    const quantity = Number(form.get("quantity"));
    const reason = String(form.get("reason"));
    const intent = JSON.stringify(["adjustment", adjustTarget.id, locationId, quantity, reason]);
    await runMutation(async () => {
      if (useMocks) await dispatch({ type: "moveStock", kind: "adjustment", productId: adjustTarget.id, locationId, quantity, reason });
      else await registerAdjustment(adjustTarget.id, { location_id: Number(locationId), quantity, reason }, idempotencyKeyFor(intent));
    }, intent);
  };

  const submitTransfer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!transferTarget) return;
    const form = new FormData(event.currentTarget);
    const originId = String(form.get("origin"));
    const destinationId = String(form.get("destination"));
    const quantity = Number(form.get("quantity"));
    const reason = String(form.get("reason")).trim();
    const intent = JSON.stringify(["transfer", transferTarget.id, originId, destinationId, quantity, reason]);
    await runMutation(async () => {
      if (useMocks) await dispatch({ type: "moveStock", kind: "transfer", productId: transferTarget.id, locationId: originId, destinationLocationId: destinationId, quantity, reason: reason || undefined });
      else await registerTransfer(transferTarget.id, { origin_location_id: Number(originId), destination_location_id: Number(destinationId), quantity, reason: reason || null }, idempotencyKeyFor(intent));
    }, intent);
  };

  const openKardex = async (product: Product) => {
    setKardexTarget(product);
    setKardexRows([]);
    setKardexError("");
    try {
      setKardexRows(useMocks ? demoInventoryMovements(snapshot, product.id, selectedLocationId) : await loadMovements(product.id, selectedLocationId));
    } catch (caught) {
      setKardexError(toApiError(caught).message);
    }
  };

  const openTransfer = (product: Product) => {
    const origin = selectedLocationId || locations[0]?.id || "";
    setTransferOriginId(origin);
    setTransferDestinationId(locations.find((location) => location.id !== origin)?.id ?? "");
    setTransferTarget(product);
    setMutationError("");
  };

  const actionsCell = (product: Product) => (
    <div className="row-actions">
      <Button compact icon={PackagePlus} aria-label="Entrada" title={`Registrar entrada para ${product.name}`} onClick={() => { setEntryTarget(product); setMutationError(""); }} />
      <Button compact icon={SlidersHorizontal} aria-label={`Ajustar stock de ${product.name}`} title="Ajustar stock" onClick={() => { setAdjustTarget(product); setMutationError(""); }} />
      <Button compact icon={ArrowUpDown} aria-label={`Transferir ${product.name}`} title={locations.length < 2 ? "La transferencia requiere acceso a otra sede" : "Transferir"} disabled={locations.length < 2} onClick={() => openTransfer(product)} />
      <Button compact icon={ClipboardPen} aria-label={`Ver kardex de ${product.name}`} title="Ver kardex" onClick={() => void openKardex(product)} />
    </div>
  );

  const columns: Column<Product>[] = [
    { key: "name", header: "Producto", width: "24%", render: (product) => <span className="product-cell"><span className={`product-icon tone-bg--${kindTone(product.kind)}`}>{product.name.slice(0, 1)}</span><strong>{product.name}</strong></span> },
    { key: "kind", header: "Tipo", render: (product) => <Badge tone={kindTone(product.kind)}>{kindLabel(product.kind)}</Badge> },
    { key: "unit", header: "Unidad", render: (product) => product.unit },
    { key: "balance", header: selectedLocationId ? `Stock en ${locationName(locations, selectedLocationId)}` : "Stock", render: (product) => <strong>{balanceOf(product.id)} {product.unit}</strong> },
    { key: "status", header: "Disponibilidad", render: (product) => balanceOf(product.id) <= 0
      ? <Badge tone="red">Agotado</Badge>
      : <Badge tone="green">Con stock</Badge> },
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
    <section className={`page ${styles.page}`}>
      <div className="page-heading"><span className="page-kicker">Control de abastecimiento</span><h1>Inventario</h1></div>
      <div className="kpi-grid inventory-kpi-grid">
        <KpiCard icon={Boxes} value={products.length} label="Productos" tone="cyan" />
        <KpiCard icon={MapPin} value={locations.length} label="Sedes" tone="blue" />
        <KpiCard icon={ArrowRightLeft} value={balanceRows.filter((row) => row.available <= 0).length} label="Sin stock en la sede" tone="amber" />
      </div>
      <section className="panel table-panel table-panel--flush">
        <div className="table-toolbar inventory-toolbar">
          <label className="select-control"><select value={selectedLocationId} onChange={(event) => setSelectedLocationId(event.target.value)} aria-label="Sede" disabled={!locations.length}>{locations.length ? locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>) : <option value="">Sin sedes</option>}</select><ChevronDown size={16} /></label>
          <label className="select-control"><select value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Tipo de producto"><option value="Todos">Tipo: Todos</option><option value="consumible">Consumible</option><option value="reventa">Reventa</option></select><ChevronDown size={16} /></label>
          <label className="search-control"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto" aria-label="Buscar producto" /></label>
          <Button variant="secondary" icon={ClipboardPen} onClick={openCountDraft}>Revisar conteo</Button>
          {voiceDraftEnabled && <Button variant="secondary" icon={Mic} onClick={openCountDraft}>Conteo por voz</Button>}
          <Button variant="primary" icon={Plus} onClick={() => { setNewOpen(true); setMutationError(""); }}>Nuevo producto</Button>
        </div>
        {error && <div className="form-error" role="alert">{error}<Button compact onClick={() => void refresh()}>Reintentar</Button></div>}
        {loading && <div className="table-loading" role="status">Cargando inventario…</div>}
        {!loading && <DataTable className={`inventory-table ${styles.inventoryTable}`} columns={columns} rows={filtered} rowKey={(product) => product.id} helpLabel={(product) => product.name} helpHref={() => "/inventario"} helpLocation={() => selectedLocationId} emptyMessage="No hay productos registrados" />}
        <div className="pagination"><span>{filtered.length} productos · balance por sede</span><div /></div>
      </section>

      <Modal title="Revisar conteo escrito" open={countOpen} onClose={closeCountDraft} portal>
        <form className="form-grid inventory-count-form" onSubmit={submitCount}>
          <p className="modal-intro field--wide">Voz y mensajes solo completan este borrador. No cambian el stock: interpreta el texto, revisa producto, sede y diferencia, y confirma el ajuste manualmente.</p>
          <div className="inventory-count-telegram field--wide">
            <div className="inventory-count-source-title"><MessageCircle size={15} /><span>Telegram demo</span>{telegramDraftSummary && <strong>{telegramDraftSummary}</strong>}</div>
            <div className="telegram-draft-list">
              {TELEGRAM_DEMO_DRAFTS.map((draft) => (
                <button key={draft.messageId} type="button" onClick={() => applyTelegramDraft(draft)} disabled={!useMocks || mutationBusy} aria-pressed={telegramDraftId === draft.messageId}>
                  <span>{draft.sender}</span>
                  <strong>{draft.text}</strong>
                  <small>{draft.receivedAt}</small>
                </button>
              ))}
            </div>
            {telegramDraftError && <div className="form-error" role="alert">{telegramDraftError}</div>}
          </div>
          {voiceDraftEnabled && <div className="inventory-count-voice field--wide">
            <p>El audio solo llena este texto. Se ignoran las filas y códigos del catálogo del servicio.</p>
            <div className="form-actions">
              {voiceDraftState === "recording"
                ? <Button type="button" variant="danger" icon={Square} onClick={stopVoiceRecording}>Detener y transcribir</Button>
                : <Button type="button" variant="secondary" icon={Mic} onClick={() => void startVoiceRecording()} disabled={voiceDraftState === "transcribing" || !useMocks}>{voiceDraftState === "transcribing" ? "Transcribiendo…" : "Grabar conteo"}</Button>}
              {voiceDraftState === "recording" && <span role="status">Grabando · detén para revisar el texto</span>}
              {voiceDraftState === "transcribing" && <span role="status">Transcripción con Whisper en curso…</span>}
              {voiceDraftSummary && <span role="status">{voiceDraftSummary}</span>}
            </div>
            {voiceDraftError && <div className="form-error" role="alert">{voiceDraftError}</div>}
          </div>}
          <label className="field field--wide"><span>Texto del conteo</span><textarea aria-label="Texto del conteo" rows={2} autoFocus value={countText} onChange={(event) => { setCountText(event.target.value); setCountProductId(""); setCountQuantity(""); setCountBalance(null); setCountError(""); setMutationError(""); setVoiceDraftError(""); setTelegramDraftError(""); setTelegramDraftId(""); setTelegramDraftSummary(""); }} placeholder="Guantes de nitrilo: 175 cajas" /></label>
          <div className="form-actions field--wide"><Button type="button" onClick={interpretCount}>Interpretar texto</Button></div>
          {countError && <div className="form-error field--wide" role="status">{countError}</div>}
          {countProduct && <>
            <div className="inventory-count-product field--wide"><span>Producto detectado</span><strong>{countProduct.name}</strong></div>
            <label className="field"><span>Sede del conteo</span><select aria-label="Sede del conteo" value={countLocationId} onChange={(event) => { setCountLocationId(event.target.value); setCountError(""); setMutationError(""); }} required disabled={mutationBusy}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
            <label className="field"><span>Cantidad contada</span><input aria-label="Cantidad contada" type="number" min="0" step="any" value={countQuantity} onChange={(event) => { setCountQuantity(event.target.value); setCountError(""); setMutationError(""); }} required disabled={mutationBusy} /></label>
            <div className="detail-list inventory-count-summary field--wide" aria-live="polite">
              <div><span>Saldo actual</span><strong>{countBalanceLoading ? "Cargando saldo…" : countBalance == null ? "No disponible" : `${countBalance} ${countProduct.unit}`}</strong></div>
              <div><span>Diferencia</span><strong>{countBalanceLoading || countBalance == null || !countQuantity ? "—" : `${Number(countQuantity) - countBalance > 0 ? "+" : ""}${Number(countQuantity) - countBalance} ${countProduct.unit}`}</strong></div>
            </div>
            <label className="field field--wide"><span>Motivo del ajuste</span><input aria-label="Motivo del ajuste" maxLength={255} value={countReason} onChange={(event) => { setCountReason(event.target.value); setMutationError(""); }} required disabled={mutationBusy} /></label>
          </>}
          {mutationError && <div className="form-error field--wide" role="alert">{mutationError}</div>}
          {!useMocks && <p className="modal-intro field--wide">El conteo se puede revisar, pero no se guarda en API hasta que haya identidad y permisos de servidor.</p>}
          <div className="form-actions field--wide"><Button type="button" onClick={closeCountDraft} disabled={mutationBusy}>Cerrar</Button><Button type="submit" variant="primary" disabled={!countProduct || countBalance == null || countBalanceLoading || !countReason.trim() || mutationBusy || voiceDraftState !== "idle" || !useMocks}>{mutationBusy ? "Registrando…" : "Confirmar ajuste demo"}</Button></div>
        </form>
      </Modal>

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
          <label className="field"><span>Origen</span><select name="origin" value={transferOriginId} onChange={(event) => { setTransferOriginId(event.target.value); if (event.target.value === transferDestinationId) setTransferDestinationId(locations.find((location) => location.id !== event.target.value)?.id ?? ""); }} required disabled={mutationBusy}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
          <label className="field"><span>Destino</span><select name="destination" value={transferDestinationId} onChange={(event) => setTransferDestinationId(event.target.value)} required disabled={mutationBusy}>{locations.filter((location) => location.id !== transferOriginId).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
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
