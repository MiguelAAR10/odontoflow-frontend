import { USE_MOCKS } from "./env";
import { ApiError, getConversationContext, replyConversation, resumeConversation, type ConversationContext, type StaffReplyCreate } from "./contracts/client";

/** Demo has no canonical cross-record links. Never infer them from a phone. */
export async function loadConversationContext(id: number): Promise<ConversationContext | null> {
  return USE_MOCKS ? null : getConversationContext(id);
}
export async function sendConversationReply(id: number, input: StaffReplyCreate, key: string) {
  if (USE_MOCKS) throw new ApiError(422, "DEMO_UNAVAILABLE", "La demo no envía respuestas por WhatsApp.");
  return replyConversation(id, input, key);
}
export async function returnConversationToAgent(id: number, key: string) {
  if (USE_MOCKS) throw new ApiError(422, "DEMO_UNAVAILABLE", "La demo no devuelve conversaciones al transporte real.");
  return resumeConversation(id, key);
}
