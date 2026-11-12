import client from "./client";
import type { ApiEnvelope, Conversation, Message } from "../types";

export async function listConversations(): Promise<Conversation[]> {
  const res = await client.get<Conversation[]>("/Console/Conversations");
  return res.data;
}

export async function listMessages(conversationId: string): Promise<Message[]> {
  const res = await client.get<Message[]>(`/Console/Conversations/${conversationId}/Messages`);
  return res.data;
}

export async function takeOverConversation(conversationId: string): Promise<ApiEnvelope> {
  const res = await client.post<ApiEnvelope>(`/Console/Conversations/${conversationId}/TakeOver`);
  return res.data;
}

export async function handBackConversation(conversationId: string): Promise<ApiEnvelope> {
  const res = await client.post<ApiEnvelope>(`/Console/Conversations/${conversationId}/HandBack`);
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
