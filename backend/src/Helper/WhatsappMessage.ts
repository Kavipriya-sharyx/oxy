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
  | { kind: "template"; name: string; languageCode: string; params?: string[] };
