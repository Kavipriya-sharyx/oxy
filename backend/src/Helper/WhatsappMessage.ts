export type SendPurpose = "reply" | "proactive";

export interface ReplyButton {
  id: string;
  title: string;
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

export type OutboundMessage =
  | { kind: "text"; body: string }
  | { kind: "buttons"; body: string; buttons: ReplyButton[] }
  | { kind: "list"; body: string; buttonLabel: string; rows: ListRow[] }
  | { kind: "template"; name: string; languageCode: string; params?: string[] }
  // a "Send location" button: the customer shares the spot with one tap (interactive location_request_message)
  | { kind: "location_request"; body: string }
  // a map pin for a centre; `body` is what the chat history shows for it
  | { kind: "location"; latitude: number; longitude: number; name: string; address?: string; body: string };
