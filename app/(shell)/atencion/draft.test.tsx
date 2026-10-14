import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { acceptScenarioDraft, cancelSimulatedReview, editSimulatedNote, reviewSimulatedNote, signSimulatedNote, useSimulatedNote, type SimulatedNote } from "./draft";

const config = vi.hoisted(() => ({ mocks: true, sequence: 0 }));
vi.mock("../../../src/api", () => ({ get useMocks() { return config.mocks; }, newIdempotencyKey: () => `intent-${++config.sequence}` }));
let observed: SimulatedNote;
function Probe({ noteKey }: { noteKey: string }) { observed = useSimulatedNote(noteKey); return null; }
let renderer: ReactTestRenderer;
let key: string;
beforeEach(() => { config.mocks = true; key = `session-${++config.sequence}:visit-ana`; });
function mount(noteKey = key) { act(() => { renderer = create(<Probe noteKey={noteKey} />); }); }
function unmount() { act(() => { renderer.unmount(); }); }

describe("D7 · ciclo de borrador y firma simulada", () => {
  it("navegar conserva la corrección humana y un resultado tardío no la pisa", () => {
    mount();
    act(() => { acceptScenarioDraft(key, "doctor", "Nota [pendiente]", "stream-1"); });
    act(() => { editSimulatedNote(key, "doctor", "Nota corregida por la doctora"); });
    unmount(); mount();
    act(() => { acceptScenarioDraft(key, "doctor", "Otro borrador", "stream-2"); });
    expect(observed.text).toBe("Nota corregida por la doctora");
    expect(observed.signedAt).toBeNull();
    unmount();
  });
  it("solo el clic final tras revisar firma; cancelar y cambiar texto requieren otra revisión", () => {
    mount();
    act(() => { editSimulatedNote(key, "doctor", "Evolución verificada"); signSimulatedNote(key, "doctor"); });
    expect(observed.signedAt).toBeNull();
    act(() => { reviewSimulatedNote(key, "doctor"); });
    const firstIntent = observed.intentKey;
    expect(observed.reviewedText).toBe("Evolución verificada");
    expect(observed.signedAt).toBeNull();
    act(() => { cancelSimulatedReview(key); editSimulatedNote(key, "doctor", "Evolución corregida"); signSimulatedNote(key, "doctor"); });
    expect(observed.signedAt).toBeNull();
    act(() => { reviewSimulatedNote(key, "doctor"); });
    expect(observed.intentKey).not.toBe(firstIntent);
    act(() => { signSimulatedNote(key, "admin"); });
    expect(observed.signedAt).toBeNull();
    act(() => { signSimulatedNote(key, "doctor"); });
    expect(observed.signedAt).not.toBeNull();
    const signed = observed;
    act(() => { signSimulatedNote(key, "doctor"); editSimulatedNote(key, "doctor", "Sobrescritura"); acceptScenarioDraft(key, "doctor", "Borrador tardío", "stream-3"); });
    expect(observed).toBe(signed);
    unmount();
  });
  it("otra visita o identidad no hereda la nota ni la firma", () => {
    mount();
    act(() => { editSimulatedNote(key, "doctor", "Nota de Ana"); reviewSimulatedNote(key, "doctor"); signSimulatedNote(key, "doctor"); });
    unmount(); mount(key + ":other-visit");
    expect(observed.text).toBe(""); expect(observed.signedAt).toBeNull();
    unmount(); mount("other-identity:" + key);
    expect(observed.text).toBe(""); expect(observed.signedAt).toBeNull();
    unmount();
  });
  it("no consume ni firma notas mock cuando la fuente es real", () => {
    mount();
    act(() => { editSimulatedNote(key, "doctor", "Nota simulada"); });
    unmount(); config.mocks = false; mount();
    expect(observed.text).toBe("");
    act(() => { editSimulatedNote(key, "doctor", "Nota real inventada"); acceptScenarioDraft(key, "doctor", "Mock", "stream-4"); reviewSimulatedNote(key, "doctor"); signSimulatedNote(key, "doctor"); });
    expect(observed.text).toBe(""); expect(observed.signedAt).toBeNull();
    unmount();
  });
});
