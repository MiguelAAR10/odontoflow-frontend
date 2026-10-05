"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, CircleHelp, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { DEMO_NOW, toMoneyCents, useOdontoRepository, useMocks } from "../api";
import { Button } from "./Button";

type Selection = { id: string; label: string; href: string; locationId?: string };

const topics: Array<{ path: string; title: string; description: string }> = [
  { path: "/pacientes", title: "Pacientes", description: "Ficha y próximo hito de la fila seleccionada." },
  { path: "/caja", title: "Caja", description: "Importe del cargo, pagos asociados y saldo." },
  { path: "/inventario", title: "Inventario", description: "Producto, sede y saldo del escenario demo." },
  { path: "/mi-dia", title: "Mi día", description: "Siguiente cita y visita de tu jornada." },
  { path: "/mis-pacientes", title: "Mis pacientes", description: "Tratamiento y próximos hitos asignados." },
  { path: "/solicitudes", title: "Solicitudes", description: "Estado de la solicitud visible." },
  { path: "/comercial", title: "Comercial", description: "Leads y trazabilidad de la fila seleccionada." },
  { path: "/produccion", title: "Producción", description: "Servicios ejecutados y su cargo asociado." },
];

function topicFor(pathname: string) {
  return topics.find((topic) => pathname === topic.path || pathname.startsWith(`${topic.path}/`)) ?? null;
}

const money = (amount: number) => new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount).replace("PEN", "S/").replace(/\u00a0/g, " ");
const moneyCents = (cents: number) => money(cents / 100);
const localDateTime = (value: string) => new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" }).format(new Date(value));

export function ContextualHelpDock({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const pathname = usePathname();
  const { snapshot } = useOdontoRepository();
  const topic = topicFor(pathname);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [answer, setAnswer] = useState("");
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setSelection(null);
    setAnswer("");
    setDraft("");
    const selectElement = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return;
      const row = target.closest<HTMLElement>("[data-help-id]");
      if (!row) return;
      const firstCell = row.querySelector("td, h2, strong");
      const label = row.dataset.helpLabel ?? firstCell?.textContent?.trim() ?? row.textContent?.trim() ?? "Fila seleccionada";
      const existingLink = row.querySelector<HTMLAnchorElement>("a[href]")?.getAttribute("href");
      setSelection({ id: row.dataset.helpId ?? "", label: label.replace(/\s+/g, " ").slice(0, 110), href: row.dataset.helpHref ?? existingLink ?? pathname, locationId: row.dataset.helpLocation });
      setAnswer("");
      setDraft("");
    };
    const selectRow = (event: MouseEvent) => selectElement(event.target);
    const focusRow = (event: FocusEvent) => selectElement(event.target);
    document.addEventListener("click", selectRow);
    document.addEventListener("focusin", focusRow);
    return () => {
      document.removeEventListener("click", selectRow);
      document.removeEventListener("focusin", focusRow);
    };
  }, [pathname]);

  const resolved = useMemo(() => {
    if (!selection) return null;
    const appointment = snapshot.appointments.find((item) => item.id === selection.id);
    if (appointment) {
      const patient = snapshot.patients.find((item) => item.id === appointment.patientId);
      const location = snapshot.locations.find((item) => item.id === appointment.locationId);
      return { kind: "appointment", appointment, patient, label: patient?.name ?? selection.label, summary: `${patient?.name ?? "Paciente"} · ${appointment.serviceName} · ${location?.name ?? "Sede"} · ${localDateTime(appointment.startAt)}` };
    }
    const patient = snapshot.patients.find((item) => item.id === selection.id);
    if (patient) {
      const next = snapshot.appointments.filter((item) => item.patientId === patient.id && item.state === "confirmed" && item.startAt >= DEMO_NOW).sort((left, right) => left.startAt.localeCompare(right.startAt))[0];
      const location = snapshot.locations.find((item) => item.id === patient.locationId);
      return { kind: "patient", patient, next, label: patient.name, summary: `${patient.treatment} · ${location?.name ?? "Sede"}${next ? ` · Próximo hito: ${next.serviceName} · ${localDateTime(next.startAt)}` : " · Sin próximo hito confirmado"}` };
    }
    const lead = snapshot.leads.find((item) => item.id === selection.id);
    if (lead) {
      const location = snapshot.locations.find((item) => item.id === lead.locationId);
      return { kind: "lead", lead, label: lead.name, summary: `${lead.need} · ${lead.source} · ${location?.name ?? "Sede sin asignar"} · ${lead.status === "patient" ? "Vinculado a paciente" : lead.status}` };
    }
    const charge = snapshot.charges.find((item) => item.id === selection.id);
    if (charge) {
      const paidCents = snapshot.payments.filter((item) => item.chargeId === charge.id).reduce((sum, item) => sum + toMoneyCents(item.amount), 0);
      const amountCents = toMoneyCents(charge.amount);
      const patientName = snapshot.patients.find((item) => item.id === charge.patientId)?.name ?? "Paciente";
      return { kind: "charge", charge, label: patientName, summary: `${patientName} · Cargo ${moneyCents(amountCents)} · Pagado ${moneyCents(paidCents)} · Pendiente ${moneyCents(Math.max(0, amountCents - paidCents))}` };
    }
    const movement = snapshot.stockMovements.find((item) => item.id === selection.id);
    const product = snapshot.products.find((item) => item.id === (movement?.productId ?? selection.id));
    if (product) {
      const locationId = movement?.locationId ?? selection.locationId ?? snapshot.actor.locationId ?? snapshot.locations[0]?.id;
      const location = snapshot.locations.find((item) => item.id === locationId);
      const balance = snapshot.balances[`${product.id}:${locationId}`] ?? 0;
      return { kind: "product", product, locationId, label: product.name, summary: `${product.name} · ${location?.name ?? "Sede"} · Saldo demo ${balance} ${product.unit}` };
    }
    const execution = snapshot.executions.find((item) => item.id === selection.id);
    if (execution) {
      const visit = snapshot.visits.find((item) => item.id === execution.visitId);
      const patientName = snapshot.patients.find((item) => item.id === visit?.patientId)?.name ?? "Paciente";
      return { kind: "execution", execution, label: execution.serviceName, summary: `${patientName} · ${execution.serviceName} · ${money(execution.price)} · ${execution.chargeId ? "Cargo creado" : "Cargo pendiente"}` };
    }
    const request = snapshot.requests.find((item) => item.id === selection.id);
    if (request) {
      return { kind: "request", request, label: request.title, summary: `${request.title} · Estado ${request.status}` };
    }
    return { kind: "row", label: selection.label, summary: "La fila se seleccionó desde esta vista. No hay un detalle tipado disponible para este tipo de registro." };
  }, [selection, snapshot]);

  const prepare = () => {
    if (!resolved || !useMocks) return;
    let next = "";
    if (resolved.kind === "appointment" && resolved.appointment) {
      next = `Hola ${resolved.patient?.name ?? ""}, te recordamos tu cita de ${resolved.appointment.serviceName} el ${localDateTime(resolved.appointment.startAt)} en ${snapshot.locations.find((item) => item.id === resolved.appointment.locationId)?.name ?? "tu sede"}.`;
    } else if (resolved.kind === "patient" && resolved.patient) {
      next = `Hola ${resolved.patient.name}, te escribimos para hacer seguimiento a tu tratamiento de ${resolved.patient.treatment}.`;
    } else if (resolved.kind === "lead" && resolved.lead) {
      next = `Hola ${resolved.lead.name}, te escribimos para dar seguimiento a tu interés en ${resolved.lead.need}.`;
    } else if (resolved.kind === "charge" && resolved.charge) {
      const paidCents = snapshot.payments.filter((item) => item.chargeId === resolved.charge.id).reduce((sum, item) => sum + toMoneyCents(item.amount), 0);
      const balanceCents = Math.max(0, toMoneyCents(resolved.charge.amount) - paidCents);
      if (!balanceCents) { setAnswer("Este cargo no tiene saldo pendiente; no preparé un recordatorio."); return; }
      next = `Hola ${resolved.label}, figura un saldo pendiente de ${moneyCents(balanceCents)} asociado a tu cargo. Si ya realizaste el pago, puedes ignorar este mensaje.`;
    } else if (resolved.kind === "product" && resolved.product && resolved.locationId) {
      next = `${resolved.product.name}: `;
      setAnswer("Borrador de conteo escrito listo. Completa producto y cantidad con unidad, y pégalo en Inventario → Conteo escrito demo para revisar el saldo. No se ha cambiado ningún dato.");
      setDraft(next);
      return;
    } else {
      setAnswer("Esta vista no tiene un borrador conectado para la fila seleccionada. Puedes abrir la fuente visible.");
      return;
    }
    setDraft(next);
    setAnswer("Borrador editable listo. Revisa el texto; no se ha enviado ni se ha modificado ningún dato.");
  };

  if (!topic) return null;
  if (!open) return <button type="button" className="context-help-trigger" onClick={() => onOpenChange(true)} aria-label="Abrir ayuda contextual"><CircleHelp size={18} /><span>Ayuda</span></button>;

  return <aside className="context-help-panel" aria-labelledby="context-help-title">
    <header className="context-help-panel__head"><div><span>Contexto de {topic.title}</span><h2 id="context-help-title">Ayuda contextual</h2></div><button type="button" className="icon-button" aria-label="Cerrar ayuda contextual" onClick={() => onOpenChange(false)}><X size={17} /></button></header>
    <p className="context-help-panel__scope">{topic.description} {useMocks ? "Fuente: escenario demo local." : "La API actual no ofrece acciones de ayuda para este registro."}</p>
    {selection ? <section className="context-help-selection" aria-live="polite"><span>Fila seleccionada</span><strong>{resolved?.label ?? selection.label}</strong><p>{resolved?.summary ?? selection.label}</p><a href={selection.href}>Abrir fuente <ArrowUpRight size={14} /></a></section> : <section className="context-help-empty"><strong>Selecciona una fila</strong><p>Te mostraré la información disponible de esa cita, ficha, cargo o movimiento en este escenario.</p></section>}
    <div className="context-help-actions"><Button compact disabled={!resolved || !useMocks} onClick={() => setAnswer(resolved ? resolved.summary : "Selecciona una fila para consultar su resumen.")}>Consultar resumen</Button><Button compact variant="primary" disabled={!resolved || !useMocks} onClick={prepare}>Preparar borrador</Button></div>
    {answer && <p className="context-help-answer" role="status">{answer}</p>}
    {draft && <label className="field context-help-draft"><span>Borrador editable</span><textarea rows={5} value={draft} onChange={(event) => setDraft(event.target.value)} /><small>Se conserva en esta pantalla demo. No se envía.</small></label>}
    {!useMocks && <p className="context-help-answer">Las acciones de ayuda no están disponibles con contratos API actuales.</p>}
  </aside>;
}
