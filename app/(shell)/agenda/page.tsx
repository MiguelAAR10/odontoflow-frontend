import { AgendaPage } from "../../../src/views/AgendaPage";

export default async function AgendaRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const appointment = typeof query.appointment === "string" && /^[1-9]\d*$/.test(query.appointment) ? Number(query.appointment) : undefined;
  const conversation = typeof query.conversation === "string" && /^[1-9]\d*$/.test(query.conversation) ? Number(query.conversation) : undefined;
  return <AgendaPage appointmentId={appointment} conversationId={conversation} />;
}
