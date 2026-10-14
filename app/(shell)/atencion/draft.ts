"use client";
import { useSyncExternalStore } from "react";
import { newIdempotencyKey, useMocks } from "../../../src/api";
import { canSignDraft, pendingFields } from "./doctor";

export interface SimulatedNote { text: string; reviewedText: string | null; signedAt: string | null; intentKey: string | null; consumedPart: string | null }
const empty: SimulatedNote = { text: "", reviewedText: null, signedAt: null, intentKey: null, consumedPart: null };
// Browser session only. No persistence or REST claim: a simulated signature must
// never become an actual recorded attendance. Keys fence identity and visit.
const notes = new Map<string, SimulatedNote>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const read = (key: string) => useMocks ? notes.get(key) ?? empty : empty;
function write(key: string, note: SimulatedNote) {
  if (!useMocks) return;
  notes.set(key, note);
  listeners.forEach(listener => listener());
}
export function useSimulatedNote(key: string) { return useSyncExternalStore(subscribe, () => read(key), () => empty); }
export function editSimulatedNote(key: string, role: string, text: string) {
  const note = read(key);
  if (!useMocks || role !== "doctor" || note.signedAt) return;
  write(key, { ...note, text, reviewedText: null, intentKey: null });
}
export function acceptScenarioDraft(key: string, role: string, text: string, partId: string) {
  const note = read(key);
  if (!useMocks || role !== "doctor" || note.signedAt || note.consumedPart === partId) return;
  // Never overwrite the doctor's work when an old stream finishes or on navigation.
  write(key, { ...note, text: note.text.trim() ? note.text : text, consumedPart: partId });
}
export function reviewSimulatedNote(key: string, role: string) {
  const note = read(key);
  if (!useMocks || role !== "doctor" || note.signedAt || !note.text.trim() || pendingFields(note.text)) return;
  write(key, { ...note, reviewedText: note.text, intentKey: note.intentKey ?? newIdempotencyKey() });
}
export function cancelSimulatedReview(key: string) {
  const note = read(key);
  if (note.signedAt) return;
  write(key, { ...note, reviewedText: null, intentKey: null });
}
export function signSimulatedNote(key: string, role: string) {
  const note = read(key);
  if (note.signedAt || !note.intentKey || !canSignDraft({ mocks: useMocks, role, text: note.text, reviewedText: note.reviewedText })) return;
  write(key, { ...note, signedAt: new Date().toISOString(), reviewedText: null });
}
