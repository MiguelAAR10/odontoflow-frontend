import { VOICE_ENABLED } from "../../../src/env";
import VoiceView from "./voice-view";
import { PageHeader } from "../../../src/components/PageHeader";

export default function VoiceRoute() {
  if (!VOICE_ENABLED) return <section className="page workspace-page"><PageHeader title="Dictado" /><div className="workspace-future"><div><h2>Dictado por voz no disponible</h2><p>El ingreso por voz está desactivado en este entorno.</p></div></div></section>;
  return <VoiceView />;
}
