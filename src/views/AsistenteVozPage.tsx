"use client";

/**
 * Asistente de voz — the contributed voice assistant view.
 *
 * AUTHORED BY **Alejandro Marcelo (AlejandroMarceloCh)**, ported from
 * alejandro/feat/asistente-voz (c0f418d, donor PR
 * leonardopanduro-rgb/ODONTO-SMART-FRONT#1). The layout, the recording
 * interaction, the stepper, the live inventory table, the editable summary and
 * the latency readout are his design and his code. This is a port, not a
 * rewrite: only the two adaptations noted below were made.
 *
 * ADAPTATION 1 — unavailability is a first-class state. The donor assumed the
 * voice service was always reachable. It is now opt-in (NEXT_PUBLIC_ENABLE_VOICE) and
 * silent in mock mode (NEXT_PUBLIC_USE_MOCKS), so the page distinguishes "switched
 * off" from "service down" and says which, instead of showing a generic error.
 *
 * ADAPTATION 2 — V1 produces DRAFTS. The summaries below are proposals for a
 * human to confirm; nothing here writes a Visit, ServiceExecution,
 * ServiceConsumption, Charge, Payment or InventoryMovement. The canonical
 * OdontoFlow backend remains the only business authority.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Boxes, Check, ChevronRight, ChevronUp, CreditCard, FileText, Mic, Package, RotateCcw, Send, Square, Stethoscope, User, Wallet } from "lucide-react";
import { Badge } from "../components/Badge";
import { DataTable, type Column } from "../components/DataTable";
import { editVoiceField, getVoiceHealth, isVoiceUnavailable, restartVoiceSession, sendVoiceAudio, sendVoiceText } from "../api";
import type { VoiceAttachment, VoiceReply, VoiceStockRow, VoiceStockSummary, VoiceTurn, VoiceVisitSummary } from "../types";

const ETIQUETAS: Record<string, string> = { paciente: "Paciente", tratamientos: "Tratamiento", insumos: "Insumos", cobro: "Cobro", observaciones: "Notas" };

const columnasStock: Column<VoiceStockRow>[] = [
  { key: "nombre", header: "Insumo", render: (row) => row.nombre },
  { key: "anterior", header: "Antes", width: "70px", render: (row) => <span className="tabular">{row.anterior ?? "—"}</span> },
  { key: "contado", header: "Ahora", width: "70px", render: (row) => <span className="tabular">{row.contado ?? "—"}</span> },
  { key: "estado", header: "", width: "104px", render: (row) => <Badge tone={row.estado === "contado" ? "green" : "amber"}>{row.estado === "contado" ? "Contado" : "Pendiente"}</Badge> },
];

const esInventario = (a: VoiceAttachment | null): a is VoiceStockSummary => a?.tipo === "inventario";
const esConsulta = (a: VoiceAttachment | null): a is VoiceVisitSummary => a?.tipo === "consulta";

export function AsistenteVozPage() {
  const [turnos, setTurnos] = useState<VoiceTurn[]>([]);
  const [sesion, setSesion] = useState<string | null>(null);
  const [estado, setEstado] = useState<VoiceReply | null>(null);
  const [resumen, setResumen] = useState<VoiceVisitSummary | null>(null);
  const [conectado, setConectado] = useState<boolean | null>(null);
  const [apagado, setApagado] = useState<string | null>(null);
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [borrador, setBorrador] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [historialAbierto, setHistorialAbierto] = useState(true);
  const [editando, setEditando] = useState<string | null>(null);
  const [valorEditado, setValorEditado] = useState("");

  const grabadora = useRef<MediaRecorder | null>(null);
  const trozos = useRef<Blob[]>([]);
  const cronometro = useRef<number | null>(null);

  useEffect(() => {
    void getVoiceHealth()
      .then(() => { setConectado(true); setApagado(null); })
      .catch((error: unknown) => {
        setConectado(false);
        // ADAPTATION 1: a closed gate is not a failure — name the reason.
        setApagado(isVoiceUnavailable(error)
          ? (error.reason === "mocks"
              ? "Modo demo: el asistente de voz no se contacta. Para usarlo, arranca odontoflow-voice y define NEXT_PUBLIC_USE_MOCKS=false."
              : "El asistente de voz está desactivado (NEXT_PUBLIC_ENABLE_VOICE).")
          : null);
      });
  }, []);
  useEffect(() => () => { if (cronometro.current) window.clearInterval(cronometro.current); }, []);

  const ultimoAdjunto = useMemo(() => { for (let i = turnos.length - 1; i >= 0; i -= 1) if (turnos[i].adjunto) return turnos[i].adjunto; return null; }, [turnos]);
  const stock = esInventario(ultimoAdjunto) ? ultimoAdjunto : null;
  const consulta = resumen ?? (esConsulta(ultimoAdjunto) ? ultimoAdjunto : null);
  const flujo = estado?.flujo ?? null;
  const pasos = estado?.pasos ?? [];
  const paso = estado?.paso ?? 0;
  const ultimoBot = useMemo(() => [...turnos].reverse().find((t) => t.de === "bot") ?? null, [turnos]);
  const ultimoMedico = useMemo(() => [...turnos].reverse().find((t) => t.de === "medico") ?? null, [turnos]);

  const absorber = useCallback((data: VoiceReply) => {
    setSesion(data.sesion_id); setEstado(data); setConectado(true);
    setTurnos((previos) => [...previos, ...data.mensajes.map((mensaje, indice) => ({ ...mensaje, id: `${data.sesion_id}-${previos.length + indice}-${mensaje.ts}`, audio: mensaje.de === "medico" ? data.transcripcion : null }))]);
    const cierre = data.mensajes.find((m) => m.adjunto?.tipo === "consulta");
    if (cierre && cierre.adjunto?.tipo === "consulta") setResumen(cierre.adjunto);
  }, []);

  const fallar = useCallback((error: unknown) => {
    setConectado(false);
    if (isVoiceUnavailable(error)) {
      setAviso(error.reason === "mocks"
        ? "Modo demo: el asistente de voz no se contacta."
        : "El asistente de voz está desactivado.");
      return;
    }
    setAviso(error instanceof Error ? `No se pudo contactar al asistente: ${error.message}` : "No se pudo contactar al asistente.");
  }, []);

  const enviarTexto = useCallback(async (texto: string) => {
    const limpio = texto.trim(); if (!limpio || enviando) return;
    setEnviando(true); setAviso(null); setBorrador("");
    try { absorber(await sendVoiceText(sesion, limpio)); } catch (error) { fallar(error); } finally { setEnviando(false); }
  }, [absorber, enviando, fallar, sesion]);

  const enviarAudio = useCallback(async (blob: Blob) => {
    setEnviando(true); setAviso(null);
    try { absorber(await sendVoiceAudio(sesion, blob, "dictado.webm")); } catch (error) { fallar(error); } finally { setEnviando(false); }
  }, [absorber, fallar, sesion]);

  const empezar = useCallback(async () => {
    if (grabando || enviando) return; setAviso(null);
    try {
      const pista = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(pista); trozos.current = [];
      rec.ondataavailable = (evento) => { if (evento.data.size) trozos.current.push(evento.data); };
      rec.onstop = () => { pista.getTracks().forEach((t) => t.stop()); const blob = new Blob(trozos.current, { type: rec.mimeType || "audio/webm" }); if (blob.size > 1200) void enviarAudio(blob); else setAviso("El audio salió vacío. Acerca el micrófono y vuelve a intentar."); };
      grabadora.current = rec; rec.start(); setGrabando(true); setSegundos(0);
      cronometro.current = window.setInterval(() => setSegundos((s) => s + 1), 1000);
    } catch { setAviso("No hay permiso para usar el micrófono. Habilítalo en el navegador y vuelve a intentar."); }
  }, [enviarAudio, enviando, grabando]);

  const parar = useCallback(() => {
    grabadora.current?.stop(); grabadora.current = null;
    if (cronometro.current) { window.clearInterval(cronometro.current); cronometro.current = null; }
    setGrabando(false);
  }, []);

  const reiniciar = useCallback(async () => {
    if (sesion) { try { await restartVoiceSession(sesion); } catch { /* la sesión local se limpia igual */ } }
    setTurnos([]); setSesion(null); setEstado(null); setResumen(null); setBorrador(""); setAviso(null); setEditando(null);
  }, [sesion]);

  const guardarCampo = useCallback(async (campo: string) => {
    if (!sesion || !valorEditado.trim()) { setEditando(null); return; }
    try { const data = await editVoiceField(sesion, campo, valorEditado.trim()); setResumen(data.resumen); } catch (error) { fallar(error); } finally { setEditando(null); setValorEditado(""); }
  }, [fallar, sesion, valorEditado]);

  const filas = consulta ? [
    { campo: "paciente", icono: User, tono: "azul", etiqueta: "Paciente", valor: consulta.paciente_ref || "—" },
    { campo: "tratamientos", icono: Stethoscope, tono: "azul", etiqueta: "Tratamiento", valor: consulta.servicios.length ? consulta.servicios.map((s) => s.nombre).join(", ") : "—" },
    { campo: "insumos", icono: Package, tono: "morado", etiqueta: "Insumos gastados", valor: consulta.consumo.length ? consulta.consumo.map((c) => `${c.nombre}${c.cantidad_consumida ? ` ×${c.cantidad_consumida}` : ""}`).join(", ") : "—" },
    { campo: "cobro", icono: Wallet, tono: "verde", etiqueta: "Total", valor: consulta.total_bruto === null ? "—" : `S/ ${consulta.total_bruto}` },
    { campo: "cobro", icono: CreditCard, tono: "ambar", etiqueta: "Método de pago", valor: consulta.metodos_pago.length ? consulta.metodos_pago.join(", ") : "—", comoChip: true },
    { campo: "observaciones", icono: FileText, tono: "gris", etiqueta: "Observaciones", valor: consulta.observaciones || "—" },
  ] : [];

  return (
    <section className="page voz-page">
      <div className="voz-titulo">
        <h1>Asistente de voz</h1>
        <span className={`voz-estado ${conectado === false ? "voz-estado--caido" : ""}`}><i />{conectado === false ? "Sin conexión" : conectado ? "Conectado" : "Comprobando"}</span>
        {(turnos.length > 0 || sesion) && <button type="button" className="voz-reiniciar" onClick={() => void reiniciar()}><RotateCcw size={15} />Reiniciar</button>}
      </div>

      <div className="voz-grid">
        <div className="voz-principal">
          <div className="voz-tarjeta voz-escena">
            {flujo === "consulta" && pasos.length > 0 ? (
              <ol className="voz-stepper">
                {pasos.map((campo, indice) => (
                  <li key={campo} className={`voz-step ${indice < paso ? "voz-step--hecho" : indice === paso ? "voz-step--activo" : ""}`}>
                    <span className="voz-step__marca">{indice < paso ? <Check size={17} strokeWidth={3} /> : indice + 1}</span>
                    <span className="voz-step__etiqueta">{ETIQUETAS[campo] ?? campo}</span>
                  </li>
                ))}
              </ol>
            ) : null}

            <button type="button" className={`voz-hero ${grabando ? "voz-hero--activo" : ""} ${enviando ? "voz-hero--ocupado" : ""}`} onClick={() => (grabando ? parar() : void empezar())} disabled={enviando} aria-label={grabando ? "Detener la grabación" : "Grabar un dictado"}>
              <span className="voz-hero__halo" aria-hidden="true" /><span className="voz-hero__anillo" aria-hidden="true" />
              <span className="voz-hero__centro">{grabando ? <Square size={40} fill="currentColor" /> : <Mic size={46} strokeWidth={1.7} />}<span className="voz-onda" aria-hidden="true">{Array.from({ length: 13 }).map((_, i) => <i key={i} style={{ animationDelay: `${i * 70}ms` }} />)}</span></span>
            </button>

            {flujo === "consulta" && estado?.total_pasos ? <p className="voz-contador">{Math.min(paso + 1, estado.total_pasos)} de {estado.total_pasos}</p> : flujo === "inventario" && stock ? <p className="voz-contador">{stock.contados} de {stock.total} insumos</p> : null}

            <h2 className="voz-pregunta">{estado?.pregunta ?? (ultimoBot ? ultimoBot.texto.split("\n")[0] : "¿Qué vamos a hacer hoy?")}</h2>
            <p className="voz-pista">{enviando ? "Procesando el dictado" : grabando ? `Grabando · ${segundos} s` : apagado ? apagado : conectado === false ? "El asistente no responde" : "Escucho atentamente"}</p>

            {turnos.length ? (
              <div className="voz-ultima">
                <button type="button" className="voz-ultima__cabecera" onClick={() => setHistorialAbierto((v) => !v)} aria-expanded={historialAbierto}>Última interacción<ChevronUp size={17} className={historialAbierto ? "" : "voz-girado"} /></button>
                {historialAbierto ? (
                  <div className="voz-ultima__cuerpo">
                    {ultimoBot ? <p><i className="voz-punto voz-punto--bot" /><b>Asistente</b><span>{ultimoBot.texto.replace(/\n/g, " · ")}</span></p> : null}
                    {ultimoMedico ? <p><i className="voz-punto voz-punto--yo" /><b>Tú</b><span>{ultimoMedico.texto}{ultimoMedico.audio ? <em> · {ultimoMedico.audio.segundos_audio} s de audio, procesado en {ultimoMedico.audio.segundos_proceso} s</em> : null}</span></p> : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {aviso ? <p className="voz-aviso" role="status">{aviso}</p> : null}
          </div>

          <div className="voz-tarjeta voz-barra">
            <button type="button" className={`voz-mic ${grabando ? "voz-mic--activo" : ""}`} onClick={() => (grabando ? parar() : void empezar())} disabled={enviando} aria-label={grabando ? "Detener la grabación" : "Grabar un dictado"}>{grabando ? <Square size={17} fill="currentColor" /> : <Mic size={19} />}</button>
            <input value={borrador} onChange={(evento) => setBorrador(evento.target.value)} onKeyDown={(evento) => { if (evento.key === "Enter") void enviarTexto(borrador); }} placeholder="Habla o escribe tu respuesta" aria-label="Respuesta escrita para el asistente" disabled={enviando || grabando} />
            <button type="button" className="voz-cta" onClick={() => void enviarTexto(estado?.terminado ? "confirmar" : borrador)} disabled={enviando || grabando || (!estado?.terminado && !borrador.trim())}>{estado?.terminado ? "Confirmar resumen" : "Enviar"}{estado?.terminado ? <ChevronRight size={19} /> : <Send size={17} />}</button>
          </div>
        </div>

        <aside className="voz-tarjeta voz-resumen">
          <h2>{flujo === "inventario" ? "Inventario" : "Resumen de consulta"} <Badge tone="amber">Borrador</Badge></h2>

          {stock ? (
            <>
              <DataTable columns={columnasStock} rows={stock.filas} rowKey={(row) => row.codigo} emptyMessage="Todavía no dictaste ningún insumo" />
              {stock.contados === stock.total ? <p className="voz-listo"><Check size={18} strokeWidth={3} />Conteo completo (borrador)</p> : null}
            </>
          ) : consulta ? (
            <>
              <div className="voz-campos">
                {filas.map((fila) => (
                  <div key={fila.etiqueta} className="voz-campo">
                    <span className={`voz-campo__icono voz-campo__icono--${fila.tono}`}><fila.icono size={19} /></span>
                    <span className="voz-campo__etiqueta">{fila.etiqueta}</span>
                    {editando === fila.etiqueta ? (
                      <input className="voz-campo__editor" value={valorEditado} autoFocus onChange={(evento) => setValorEditado(evento.target.value)} onBlur={() => void guardarCampo(fila.campo)} onKeyDown={(evento) => { if (evento.key === "Enter") void guardarCampo(fila.campo); if (evento.key === "Escape") setEditando(null); }} aria-label={`Corregir ${fila.etiqueta}`} />
                    ) : fila.comoChip && fila.valor !== "—" ? <Badge tone="cyan">{fila.valor}</Badge> : <strong className="voz-campo__valor">{fila.valor}</strong>}
                    <button type="button" className="voz-campo__lapiz" onClick={() => { setEditando(fila.etiqueta); setValorEditado(fila.valor === "—" ? "" : fila.valor); }} aria-label={`Corregir ${fila.etiqueta}`}>✎</button>
                  </div>
                ))}
              </div>
              {estado?.terminado ? <p className="voz-listo"><Check size={18} strokeWidth={3} />Borrador listo para revisar</p> : null}
            </>
          ) : (
            <div className="voz-vacio"><Boxes size={30} /><p>{apagado ?? "Acá aparece el resumen de la consulta o el conteo de inventario a medida que dictas."}</p></div>
          )}
        </aside>
      </div>
    </section>
  );
}
