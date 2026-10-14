import { AtencionPage } from "../../../src/views/AtencionPage";

export default async function AtencionRoute({ searchParams }: { searchParams: Promise<{ cita?: string | string[] }> }) {
  const { cita } = await searchParams;
  return <AtencionPage appointmentId={typeof cita === "string" ? cita : undefined} />;
}
