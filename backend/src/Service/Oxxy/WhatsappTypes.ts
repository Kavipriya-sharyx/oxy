// The parts of the Meta WhatsApp Cloud API webhook payload that we read.
export interface WaMessage {
  id: string;
  from: string;
  timestamp?: string; // unix seconds
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: {
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
  location?: { latitude: number; longitude: number };
}

export interface WaStatus {
  id: string; // wamid of OUR outbound message
  status: string; // sent | delivered | read | failed
}

export interface WaValue {
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: WaMessage[];
  statuses?: WaStatus[];
}

export interface WaWebhookBody {
  entry?: { changes?: { value?: WaValue }[] }[];
}

export interface InboundJob {
  messageId: string;
  conversationId: string;
  customerId: string;
}
