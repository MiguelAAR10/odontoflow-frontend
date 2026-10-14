export type Agent = "airi" | "cepillo" | "pasta" | "hilo" | "enjuague" | "espejo" | "escudo";
export type CharacterState = "idle" | "thinking" | "working" | "handoff" | "done" | "needs-you";

/** Premium SVG from v10. Size is in CSS pixels; gaze follows mouse/pen only.
 * Set decorative when an adjacent label already names the agent. The crew host
 * chooses which (maximum two) agents are active; this primitive preserves all six states.
 */
export interface CharacterProps {
  state?: CharacterState;
  size?: number;
  gaze?: boolean;
  className?: string;
  label?: string;
  decorative?: boolean;
}
