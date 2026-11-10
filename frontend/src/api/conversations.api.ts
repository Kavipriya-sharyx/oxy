import type { Conversation } from "../types";

// Backend endpoint not ready yet.
export function listConversations(): Promise<Conversation[]> {
  return Promise.reject(new Error("Not implemented yet"));
}
