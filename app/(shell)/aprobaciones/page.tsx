import { ApprovalsPage } from "../../../src/views/ApprovalsPage";

export default async function ApprovalsRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const conversation = typeof query.conversation === "string" && /^[1-9]\d*$/.test(query.conversation) ? Number(query.conversation) : undefined;
  const returnToCash = typeof query.payment === "string" && /^[1-9]\d*$/.test(query.payment) && typeof query.location === "string" && /^(?:[1-9]\d*)?$/.test(query.location)
    ? `/caja?payment=${query.payment}&location=${query.location}` : undefined;
  return <ApprovalsPage conversationId={conversation} focusedKey={typeof query.proposal === "string" && /^(agent_proposal|appointment_proposal):[1-9]\d*$/.test(query.proposal) ? query.proposal : undefined} focusedStatus={typeof query.status === "string" ? query.status : undefined} returnToCash={returnToCash} />;
}
