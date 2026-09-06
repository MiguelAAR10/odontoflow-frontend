import { redirect } from "next/navigation";
import { VOICE_ENABLED } from "../../../src/env";
import VoiceView from "./voice-view";

export default function VoiceRoute() {
  if (!VOICE_ENABLED) redirect("/agenda");
  return <VoiceView />;
}
