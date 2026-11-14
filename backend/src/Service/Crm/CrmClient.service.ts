import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { crm_outbox } from "@Database/Table/Crm/crm_outbox";
import { customer } from "@Database/Table/Oxxy/customer";
import { CrmAction } from "@Helper/Enum/CrmAction";

// Bot -> CRM calls (Full Plan 3.2). CRM_BASE_URL is the CRM's API root, e.g. https://crm.example/api/v1.
// The paths are the plan's proposal and must be agreed with the CRM team [CONFIRM]. Actions the plan does
// not list (confirm_booking, set_opt_in, set_callback_window) stay POST {base}/{action} [CONFIRM].
export interface CrmRoute {
  method: "get" | "post" | "put";
  path: string;
}

/** Where an outbox action goes. `wa` = the customer's WhatsApp number, `crmId` = the CRM's customer id. */
export function crmRoute(action: string, ids: { wa?: string | null; crmId?: string | null }): CrmRoute {
  const who = encodeURIComponent(ids.crmId || ids.wa || "unknown");
  switch (action) {
    case CrmAction.UpsertCustomer:
      return { method: "put", path: `/customers/${encodeURIComponent(ids.wa || "unknown")}` };
    case CrmAction.CreateBookingRequest:
      return { method: "post", path: "/booking-requests" };
    case CrmAction.CreateTask:
      return { method: "post", path: "/tasks" };
    case CrmAction.CreateActivation:
      return { method: "post", path: "/activations" };
    case CrmAction.LogEvent:
      return { method: "post", path: `/customers/${who}/events` };
    case CrmAction.SetOptOut:
      return { method: "post", path: `/customers/${who}/opt-out` };
    default:
      return { method: "post", path: `/${action}` };
  }
}

/** What the CRM says about a customer (Full Plan 3.2 lookup_customer) */
export interface CrmCustomer {
  id: string | null;
  active_product: string | null;
  active_plan: string | null;
  opted_out: boolean;
}

@Injectable()
export class CrmClient {
  constructor(private readonly _Config: ConfigService) {}

  private base(): string {
    return String(this._Config.get("Crm.BaseUrl") || "").replace(/\/+$/, "");
  }

  private headers(idempotencyKey?: string) {
    return {
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      Authorization: `Bearer ${this._Config.get("Crm.ApiKey")}`,
    };
  }

  // Idempotency-Key = outbox id, so a retry is harmless. Returns the id the CRM gave back (or null).
  async send(row: crm_outbox): Promise<string | null> {
    const c = row.customer_id ? await customer.findOne({ where: { id: row.customer_id } }) : null;
    const r = crmRoute(row.action, { wa: c?.wa_number ? `+${c.wa_number}` : null, crmId: c?.crm_customer_id });
    const res = await axios.request({
      method: r.method,
      url: `${this.base()}${r.path}`,
      data: row.payload,
      headers: this.headers(row.id),
      timeout: 5000, // Full Plan 3.2: 5-second timeout; the outbox retries
    });
    const id: unknown = res.data?.id;
    return id == null ? null : String(id);
  }

  /** GET {base}/customers?whatsapp=+91... (5 s). null = not known to the CRM. Throws on a network error. */
  async lookup(waNumber: string): Promise<CrmCustomer | null> {
    const res = await axios.get(`${this.base()}/customers`, {
      params: { whatsapp: `+${waNumber.replace(/^\+/, "")}` },
      headers: this.headers(),
      timeout: 5000,
      validateStatus: (s) => (s >= 200 && s < 300) || s === 404,
    });
    if (res.status === 404 || !res.data) return null;
    const d = Array.isArray(res.data) ? res.data[0] : (res.data.data ?? res.data);
    if (!d) return null;
    return {
      id: d.id != null ? String(d.id) : null,
      active_product: d.active_product ?? null,
      active_plan: d.active_plan ?? null,
      opted_out: !!(d.opted_out ?? d.opt_out),
    };
  }
}
