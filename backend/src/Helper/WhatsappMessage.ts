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

// The top line of an interactive message: a picture (buttons / link button only) or a bold title
export type InteractiveHeader = { type: "image"; link: string } | { type: "text"; text: string };

export type OutboundMessage =
  | { kind: "text"; body: string }
  | { kind: "buttons"; body: string; buttons: ReplyButton[]; header?: InteractiveHeader; footer?: string }
  // `log`: what the chat history shows when it differs from the body (the centre list: names only in the rows)
  | {
      kind: "list";
      body: string;
      buttonLabel: string;
      rows: ListRow[];
      log?: string;
      header?: { type: "text"; text: string };
      footer?: string;
    }
  // one button that opens a web address (the website, the savings calculator)
  | { kind: "cta_url"; body: string; buttonText: string; url: string; header?: InteractiveHeader; footer?: string }
  | { kind: "template"; name: string; languageCode: string; params?: string[] }
  // a "Send location" button: the customer shares the spot with one tap (interactive location_request_message)
  | { kind: "location_request"; body: string }
  // a map pin for a centre; `body` is what the chat history shows for it
  | { kind: "location"; latitude: number; longitude: number; name: string; address?: string; body: string };
