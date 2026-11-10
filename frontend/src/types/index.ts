// The backend wraps most replies as { Type: "S" | "E", Message }.
// Errors also come back with HTTP 200, so always check Type.
export type ResponseType = "S" | "E";

export interface ApiEnvelope {
  Type: ResponseType;
  Message: string;
}

export interface LoginResponse extends ApiEnvelope {
  result?: { api_token: string };
}

export interface Customer {
  id: string;
  wa_number: string;
  first_name: string | null;
  language: string;
  age: number | null;
  active_product: string | null;
  active_plan: string | null;
}

export interface Centre {
  id: string;
  name: string;
  branch: string | null;
  locality: string | null;
  city: string;
  latitude: number;
  longitude: number;
  centre_type: string | null;
  specialisations: string[] | null;
  is_private: boolean;
  verified: boolean;
  active: boolean;
}

export interface Booking {
  id: string;
  customer_id: string;
  conversation_id: string;
  centre_id: string;
  specialisation: string | null;
  preferred_date: string;
  preferred_time: string | null;
  booking_status: string;
  confirmed_by_id: string | null;
  customer?: Customer;
  centre?: Centre;
}

export interface PlanCatalog {
  id: string;
  product: string;
  plan: string;
  billing: string;
  price: number;
  gst_rate: number;
  auto_renews: boolean;
  renewal_terms: string | null;
  max_saving_pct: number | null;
  age_limit: number | null;
  activation_time: string | null;
  activation_link: string | null;
  version: number;
}

export interface Conversation {
  id: string;
  customer_id: string;
  state: string;
  selected_product: string | null;
  recommended_plan: string | null;
  last_question: string | null;
  last_customer_message_at: string | null;
  closed_at: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: "in" | "out";
  sender: "customer" | "bot" | "agent";
  wa_message_id: string | null;
  body: string | null;
  template_name: string | null;
  message_status: string;
}
