// SharyX Voice AI (docs: "SharyX Voice AI — API Integration Guide", 5 Nov 2026). Client general rule (20 Nov):
// "for any enquiry, AI bot call in 60 seconds". The bot queues the call (POST /calls, one person now) and reads the
// result back (webhook call.completed). Settings: Configuration page, group Voice AI (read live from process.env).
import { Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import * as crypto from "crypto";

export const SHARYX_DEFAULT_BASE = "https://app.sharyx.org/api/v1";

export interface SharyxCallRequest {
  phone: string;
  name?: string | null;
  /** up to 30 fields, ~3,500 characters; comes back as contact.data in the result */
  data: Record<string, string | number | boolean>;
  openingLine?: string;
  purpose?: string;
}

export type SharyxCallResult =
  | { ok: true; contactId: string; status: string; note?: string }
  // already: the person is waiting / on a call / on the do-not-call list (HTTP 409): never resent
  | { ok: false; reason: "disabled" | "already" | "rejected" | "error"; detail?: string };

/** "+91…" from a WhatsApp number ("919840012345") */
export function e164(wa: string): string {
  const d = String(wa || "").replace(/\D/g, "");
  return d ? `+${d}` : "";
}

/** v1= hex HMAC-SHA256 of {timestamp}.{METHOD}.{path and query}.{raw body} (guide, "Verifying the signature") */
export function sharyxSignature(
  secret: string,
  timestamp: string,
  method: string,
  pathAndQuery: string,
  rawBody: string,
): string {
  const signed = `${timestamp}.${method.toUpperCase()}.${pathAndQuery}.${rawBody || ""}`;
  return "v1=" + crypto.createHmac("sha256", secret).update(signed).digest("hex");
}

/** A webhook really from SharyX: right signature and a timestamp within 5 minutes */
export function validSharyx(
  secret: string | undefined,
  o: {
    timestamp?: string;
    signature?: string;
    method: string;
    pathAndQuery: string;
    rawBody: string;
  },
  nowSec = Date.now() / 1000,
): boolean {
  if (!secret || !o.timestamp || !o.signature) return false;
  if (!/^\d+$/.test(o.timestamp) || Math.abs(nowSec - Number(o.timestamp)) > 300) return false;
  const expected = sharyxSignature(secret, o.timestamp, o.method, o.pathAndQuery, o.rawBody);
  const a = Buffer.from(o.signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Short, safe data values (no secrets, at most 500 characters each, at most 30 fields) */
export function sharyxData(d: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(d)) {
    if (Object.keys(out).length >= 30) break;
    if (v == null || v === "") continue;
    const key = k.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 40);
    out[key] = typeof v === "number" || typeof v === "boolean" ? v : String(v).slice(0, 500);
  }
  return out;
}

@Injectable()
export class SharyxVoiceService {
  private readonly logger = new Logger(SharyxVoiceService.name);

  /** On, with a key and an agent (Configuration page, Voice AI) */
  get enabled(): boolean {
    return (
      process.env.SHARYX_ENABLED === "true" &&
      !!process.env.SHARYX_API_KEY &&
      !!process.env.SHARYX_AGENT_ID
    );
  }

  private base(): string {
    return (process.env.SHARYX_API_BASE || SHARYX_DEFAULT_BASE).replace(/\/+$/, "");
  }

  /** POST /calls: the agent calls this person (within seconds, during 9 am - 9 pm; later = waits) */
  async callNow(r: SharyxCallRequest): Promise<SharyxCallResult> {
    if (!this.enabled) return { ok: false, reason: "disabled" };
    const phone = r.phone.startsWith("+") ? r.phone : e164(r.phone);
    try {
      const res = await axios.post(
        `${this.base()}/calls`,
        {
          agent_id: process.env.SHARYX_AGENT_ID,
          phone,
          ...(r.name ? { name: String(r.name).slice(0, 80) } : {}),
          data: r.data,
          ...(r.openingLine ? { opening_line: r.openingLine.slice(0, 500) } : {}),
          ...(r.purpose ? { purpose: r.purpose.slice(0, 1000) } : {}),
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.SHARYX_API_KEY}`,
            "content-type": "application/json",
          },
          timeout: 8000,
          validateStatus: () => true,
        },
      );
      if (res.status >= 200 && res.status < 300)
        return {
          ok: true,
          contactId: String(res.data?.contact_id ?? ""),
          status: String(res.data?.status ?? "pending"),
          ...(res.data?.note ? { note: String(res.data.note) } : {}),
        };
      const detail = `${res.status} ${String(res.data?.error ?? "").slice(0, 200)}`;
      if (res.status === 409) return { ok: false, reason: "already", detail };
      if (res.status === 400 || res.status === 403 || res.status === 404)
        return { ok: false, reason: "rejected", detail };
      return { ok: false, reason: "error", detail };
    } catch (e) {
      return { ok: false, reason: "error", detail: (e as Error).message };
    }
  }

  /** GET /ping: the key works (for the Configuration page / go-live check) */
  async ping(): Promise<{ ok: boolean; detail: string }> {
    if (!process.env.SHARYX_API_KEY) return { ok: false, detail: "no API key" };
    try {
      const res = await axios.get(`${this.base()}/ping`, {
        headers: { Authorization: `Bearer ${process.env.SHARYX_API_KEY}` },
        timeout: 8000,
        validateStatus: () => true,
      });
      return res.status === 200 && res.data?.ok
        ? { ok: true, detail: `${res.data.client ?? ""} · access ${res.data.access ?? "?"}` }
        : { ok: false, detail: `${res.status} ${String(res.data?.error ?? "")}` };
    } catch (e) {
      this.logger.warn(`SharyX ping failed: ${(e as Error).message}`);
      return { ok: false, detail: (e as Error).message };
    }
  }
}
