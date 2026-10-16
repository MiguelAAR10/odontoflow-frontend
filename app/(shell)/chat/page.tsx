import { ChatPage } from "../../../src/views/ChatPage";

export default async function ChatRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const id = typeof query.conversation === "string" && /^[1-9]\d*$/.test(query.conversation) ? Number(query.conversation) : undefined;
  return <ChatPage key={id} conversationId={id} />;
}
