"use client";

import dynamic from "next/dynamic";

const AsistenteVozPage = dynamic(() => import("../../../src/views/AsistenteVozPage").then((module) => module.AsistenteVozPage), { ssr: false });

export default function VoiceView() {
  return <AsistenteVozPage />;
}
