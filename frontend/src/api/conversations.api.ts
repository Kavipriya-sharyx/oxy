import client from "./client";
import type { ApiEnvelope, Conversation, Message } from "../types";

// Newest first by the last customer message. q / view are filtered by the server; limit 1..300 (100).
export async function listConversations(
  opts: { q?: string; view?: string; limit?: number } = {},
): Promise<Conversation[]> {
  const res = await client.get<Conversation[]>("/Console/Conversations", {
    params: {
      q: opts.q || undefined,
      view: opts.view && opts.view !== "all" ? opts.view : undefined,
      limit: opts.limit,
    },
  });
  return res.data;
}

/** The newest MESSAGE_PAGE messages (oldest first); before = created_on of the oldest one shown */
export const MESSAGE_PAGE = 200;
export async function listMessages(conversationId: string, before?: string): Promise<Message[]> {
  const res = await client.get<Message[]>(`/Console/Conversations/${conversationId}/Messages`, {
    params: { before },
  });
  return res.data;
}

export async function takeOverConversation(conversationId: string): Promise<ApiEnvelope> {
  const res = await client.post<ApiEnvelope>(`/Console/Conversations/${conversationId}/TakeOver`);
  return res.data;
}

// `note` (optional): what the bot should know when it takes over again
export async function handBackConversation(
  conversationId: string,
  note?: string,
): Promise<ApiEnvelope> {
  const res = await client.post<ApiEnvelope>(`/Console/Conversations/${conversationId}/HandBack`, {
    note: note?.trim() || undefined,
  });
  return res.data;
}

export async function replyToConversation(
  conversationId: string,
  body: string,
): Promise<ApiEnvelope> {
  const res = await client.post<ApiEnvelope>(`/Console/Conversations/${conversationId}/Reply`, {
    body,
  });
  return res.data;
}
