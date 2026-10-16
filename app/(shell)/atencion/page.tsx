import { Suspense } from "react";
import { AtencionFromUrl } from "../../../src/views/AtencionPage";

export default function AtencionRoute() {
  return <Suspense fallback={<p role="status">Cargando la atención…</p>}><AtencionFromUrl /></Suspense>;
}
