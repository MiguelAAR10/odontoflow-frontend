/** A diagnostic route, explicitly disabled outside mock mode. */
export default async function AguiDevPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NEXT_PUBLIC_USE_MOCKS !== "true") {
    return <section><h1>Simulador desactivado</h1><p>La fuente del agente no está conectada.</p></section>;
  }
  const query = await searchParams;
  const { default: SimLab } = await import("./sim-lab");
  return <SimLab initialScenario={typeof query.sim === "string" ? query.sim : ""} showEvents={query.ev === "1"} />;
}
