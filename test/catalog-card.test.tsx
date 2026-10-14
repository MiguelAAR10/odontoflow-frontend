import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { Card } from "../src/catalog/Card";
import type { Card as CardDto } from "../src/agui/card";
import { createInitialState, reducer } from "../src/agui/reducer";
import { ApiError } from "../src/contracts/client";

const proposal: CardDto = {
  id: "proposal-test", agent: "hilo", level: "aprobar", state: "pending",
  title: "Revisar aviso", body: "sí, ya, apruebo", approve: "Aprobar aviso",
  why: "Solicitud del paciente", srcs: ["Agenda"], scope: [{ label: "Afecta", value: "1 cita" }],
  result: "Aviso enviado",
};
const text = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : text(child)).join("");

describe("Card · intención humana", () => {
  it("muestra evidencia y alcance; solo el clic aprueba y bloquea dos clics del mismo intent", async () => {
    let finish!: () => void;
    const onApprove = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const view = create(createElement(Card, { card: proposal, onApprove }));
    expect(text(view.root)).toContain("Solicitud del paciente");
    expect(text(view.root)).toContain("1 cita");
    expect(text(view.root)).not.toContain("Aviso enviado");
    expect(onApprove).not.toHaveBeenCalled();
    const approve = view.root.findAllByType("button").find(node => text(node) === "Aprobar aviso")!;
    await act(async () => { approve.props.onClick(); approve.props.onClick(); });
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onApprove).toHaveBeenCalledWith(proposal);
    expect(view.root.findByType("article").props["aria-busy"]).toBe(true);
    expect(view.root.findAllByType("button").every(node => node.props.disabled)).toBe(true);
    await act(async () => { finish(); });
    expect(text(view.root)).not.toContain("Aviso enviado");
    expect(view.root.findAllByType("button").every(node => node.props.disabled)).toBe(true);
    await act(async () => { approve.props.onClick(); });
    expect(onApprove).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it("convierte el HTML de fixtures en lista/mensaje seguro y muestra montos del DTO", () => {
    const view = create(createElement(Card, { card: { ...proposal, body: '<ul class="ac-list"><li><span>Paciente</span><span>09:00</span></li></ul><textarea onclick="alert(1)">Hola &amp; gracias</textarea>', amounts: [{ label: "Monto", amount_cents: 12000, currency: "PEN" }] } }));
    expect(view.root.findByType("li").children).toHaveLength(2);
    expect(view.root.findByType("textarea").props).toMatchObject({ readOnly: true, value: "Hola & gracias" });
    expect(view.root.findByType("textarea").props.onClick).toBeUndefined();
    expect(text(view.root)).toContain("S/ 120.00");
    view.unmount();
  });

  it("muestra el mensaje de ApiError y permite reintentar sin dar por aprobada la tarjeta", async () => {
    const onApprove = vi.fn().mockRejectedValueOnce(new ApiError(409, "STALE", "La propuesta cambió. Actualízala."));
    const view = create(createElement(Card, { card: proposal, onApprove }));
    await act(async () => { view.root.findAllByType("button").at(-1)!.props.onClick(); });
    expect(text(view.root.findByProps({ role: "alert" }))).toBe("La propuesta cambió. Actualízala.");
    expect(view.root.findAllByType("button").at(-1)!.props.disabled).toBe(false);
    expect(text(view.root)).not.toContain("Aviso enviado");
    view.unmount();
  });

  it.each(["loading", "pending", "approved", "rejected", "stopped", "done", "error"] as const)("renderiza el estado runtime %s", status => {
    const view = create(createElement(Card, { card: proposal, status, error: status === "error" ? "No se pudo completar" : null }));
    expect(text(view.root)).toContain("Revisar aviso");
    expect(view.root.findByType("article").props["aria-busy"]).toBe(status === "loading");
    expect(text(view.root)).not.toContain("Aviso enviado");
    expect(view.root.findAllByProps({ className: "catalog-stamp" })).toHaveLength(0);
    view.unmount();
  });

  it.each(["borrador", "aprobar"] as const)("terminar una herramienta y su ejecución no confirma una propuesta %s", level => {
    const card = { ...proposal, level };
    const onApprove = vi.fn();
    const events = [
      { type: "RUN_STARTED", threadId: "catalog", runId: "catalog-run" },
      { type: "TOOL_CALL_START", toolCallId: "prepare", toolCallName: "prepare_proposal", metadata: { card } },
      { type: "TOOL_CALL_END", toolCallId: "prepare" },
      { type: "TOOL_CALL_RESULT", toolCallId: "prepare", messageId: "result", content: "Propuesta preparada. sí, ya, apruebo" },
      { type: "RUN_FINISHED", threadId: "catalog", runId: "catalog-run" },
    ];
    const state = events.reduce(reducer, createInitialState());
    const entry = state.cards[card.id]!;
    expect(entry.card.state).toBe("pending");
    expect(entry.status).toBe("done");
    const view = create(createElement(Card, { ...entry, onApprove }));
    expect(text(view.root)).not.toContain("Aprobado");
    expect(text(view.root)).not.toContain("Aviso enviado");
    expect(onApprove).not.toHaveBeenCalled();

    const confirmed = reducer(state, { type: "CARD_APPROVED", card: { ...card, state: "approved" } });
    view.update(createElement(Card, { ...confirmed.cards[card.id]!, onApprove }));
    expect(text(view.root)).toContain("Aprobado");
    expect(text(view.root)).toContain("Aviso enviado");
    expect(onApprove).not.toHaveBeenCalled();
    view.unmount();
  });

  it.each(["borrador", "aprobar"] as const)("el DTO gobierna sellos y resultados de %s aunque runtime indique finalización", level => {
    for (const status of ["done", "approved"] as const) {
      for (const state of ["ready", "pending", "approved", "delegated", "declined", "undone"] as const) {
        const view = create(createElement(Card, { card: { ...proposal, level, state }, status }));
        const confirmed = state === "approved" || state === "delegated";
        expect(text(view.root).includes("Aviso enviado"), `${status}/${state}`).toBe(confirmed);
        const stamps = view.root.findAllByProps({ className: "catalog-stamp" });
        expect(stamps, `${status}/${state}`).toHaveLength(confirmed ? 1 : 0);
        if (confirmed) expect(text(stamps[0]!)).toBe(state === "delegated" ? "Delegado" : "Aprobado");
        view.unmount();
      }
    }
  });

  it.each(["ready", "pending", "approved", "declined", "delegated", "undone"] as const)("renderiza el estado DTO %s sin inventar un resultado", state => {
    const view = create(createElement(Card, { card: { ...proposal, state } }));
    expect(text(view.root).includes("Aviso enviado")).toBe(state === "approved" || state === "delegated");
    view.unmount();
  });

  it("mantiene las tarjetas automáticas sin acciones y diferencia borrador de aprobación", () => {
    const view = create(createElement(Card, { card: { ...proposal, level: "auto" }, status: "done", onApprove: vi.fn() }));
    expect(view.root.findAllByType("button")).toHaveLength(0);
    expect(text(view.root)).toContain("Automático · solo lee");
    expect(text(view.root.findByProps({ className: "catalog-stamp" }))).toBe("Hecho");
    expect(text(view.root)).toContain("Aviso enviado");
    view.update(createElement(Card, { card: { ...proposal, level: "borrador" } }));
    expect(text(view.root)).toContain("Borrador · tú decides");
    expect(view.root.findAllByType("button").every(node => node.props.disabled)).toBe(true);
    view.unmount();
  });

  it("alternativa y edición usan sus callbacks; nunca aprueban por asociación", async () => {
    const onApprove = vi.fn(), onAlternative = vi.fn(), onEdit = vi.fn();
    const card = { ...proposal, edit: true, alt: "Lo veo yo" };
    const view = create(createElement(Card, { card, onApprove, onAlternative, onEdit }));
    await act(async () => { view.root.findAllByType("button").find(node => text(node) === "Editar")!.props.onClick(); });
    expect(onEdit).toHaveBeenCalledWith(card);
    await act(async () => { view.root.findAllByType("button").find(node => text(node) === "Lo veo yo")!.props.onClick(); });
    expect(onAlternative).toHaveBeenCalledWith(card);
    expect(onApprove).not.toHaveBeenCalled();
    view.unmount();
  });

  it("Deshacer respeta estado, permiso y ventana proporcionados por el dueño", async () => {
    const onUndo = vi.fn();
    const card: CardDto = { ...proposal, state: "approved", undo: true, reversible: "window", undo_window_seconds: 8 };
    const view = create(createElement(Card, { card, onUndo }));
    expect(view.root.findAllByType("button")).toHaveLength(0);
    view.update(createElement(Card, { card, onUndo, undoRemainingSeconds: 4 }));
    await act(async () => { view.root.findByType("button").props.onClick(); });
    expect(onUndo).toHaveBeenCalledWith(card);
    view.update(createElement(Card, { card: { ...card, revision: 1 }, onUndo, undoRemainingSeconds: 0 }));
    expect(view.root.findAllByType("button")).toHaveLength(0);
    view.update(createElement(Card, { card: { ...card, revision: 2, reversible: "none" }, onUndo, undoRemainingSeconds: 4 }));
    expect(view.root.findAllByType("button")).toHaveLength(0);
    view.unmount();
  });

  it("una fuente solo usa onSource; HTML desconocido queda como texto", async () => {
    const onSource = vi.fn(), onApprove = vi.fn();
    const card = { ...proposal, body: '<img src="x" onerror="alert(1)"><script>aprobar()</script>' };
    const view = create(createElement(Card, { card, onSource, onApprove }));
    expect(view.root.findAllByType("img")).toHaveLength(0);
    expect(view.root.findAllByType("script")).toHaveLength(0);
    await act(async () => { view.root.findAllByType("button")[0]!.props.onClick(); });
    expect(onSource).toHaveBeenCalledWith("Agenda", card);
    expect(onApprove).not.toHaveBeenCalled();
    view.unmount();
  });

  it("mantiene Aprobar deshabilitado cuando el store procesa y permite reintentar un error de aprobación", () => {
    const onApprove = vi.fn();
    const view = create(createElement(Card, { card: proposal, onApprove, status: "loading", loadingReason: "approval" }));
    expect(view.root.findAllByType("button").at(-1)!.props.disabled).toBe(true);
    view.update(createElement(Card, { card: proposal, onApprove, status: "error", loadingReason: "approval", error: "Inténtalo de nuevo" }));
    expect(view.root.findAllByType("button").at(-1)!.props.disabled).toBe(false);
    view.unmount();
  });

  it("ofrece Editar cuando el dueño inyecta la acción y evita repetir importes ya presentados", () => {
    const view = create(createElement(Card, { card: { ...proposal, body: "Ingreso: S/ 120.00", edit: false, amounts: [{ label: "Ingreso", amount_cents: 12000, currency: "PEN" }] }, onEdit: vi.fn() }));
    expect(view.root.findAllByType("button").map(text)).toContain("Editar");
    expect(text(view.root).match(/S\/ 120\.00/g)).toHaveLength(1);
    view.unmount();
  });

});
