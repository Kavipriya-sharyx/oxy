// Go-live check: what the system really holds right now, read from the database and the settings. Nothing
// here is assumed. "blocker" = customers would get a wrong or placeholder answer, or nothing would work;
// "warn" = it works, with a gap the team should know about.
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { In, IsNull } from "typeorm";
import { api_key } from "@Database/Table/Admin/api_key";
import { keyState } from "@Service/Admin/ApiKey.service";
import { user } from "@Database/Table/Admin/user";
import { approved_asset } from "@Database/Table/Oxxy/approved_asset";
import { centre } from "@Database/Table/Oxxy/centre";
import { plan_catalog } from "@Database/Table/Oxxy/plan_catalog";
import { wa_template } from "@Database/Table/Oxxy/wa_template";
import {
  DEMO_USER_EMAILS,
  isPlaceholder,
  isRealLink,
  isSampleName,
  planProblems,
} from "@Helper/GoLive";
import { retentionDays } from "./Retention.service";

export type CheckStatus = "ok" | "warn" | "blocker";
export interface GoLiveCheck {
  area: string;
  item: string;
  status: CheckStatus;
  detail: string;
  fix?: string; // where to fix it
}

export const REQUIRED_TEMPLATES = [
  "booking_confirmed",
  "booking_rescheduled",
  "booking_cancelled",
  "booking_cancelled_info",
  "activation_confirmed",
  "activation_reminder",
  "agreed_follow_up",
  "conversation_rescue_1",
  "conversation_rescue_2",
];

const planLabel = (r: { product: string; plan: string; billing: string }) =>
  `${r.product === "oxxy" ? `Oxxy ${r.plan}` : "Cut Medi Bills"} ${r.billing}`;

// ---- pure parts (tested without a database) ----

export function planChecks(rows: any[]): GoLiveCheck[] {
  if (!rows.length)
    return [
      {
        area: "Plans",
        item: "Plan catalogue",
        status: "blocker",
        detail: "No plan rows",
        fix: "Plans",
      },
    ];
  return rows.map((r) => {
    const missing = planProblems(r);
    return {
      area: "Plans",
      item: planLabel(r),
      status: missing.length ? "blocker" : "ok",
      detail: missing.length
        ? `Missing: ${missing.join(", ")}. Until then the bot gives no price or link for it and hands over to the team.`
        : `₹${r.price}, v${r.version}`,
      fix: "Plans (propose a change, a second user approves)",
    } as GoLiveCheck;
  });
}

export function centreChecks(
  rows: { name: string; active: boolean; verified: boolean; latitude: number; longitude: number }[],
): GoLiveCheck[] {
  const active = rows.filter((r) => r.active);
  const sample = active.filter((r) => isSampleName(r.name));
  const real = active.filter((r) => r.verified && !isSampleName(r.name));
  const noPlace = real.filter((r) => !Number(r.latitude) || !Number(r.longitude));
  const out: GoLiveCheck[] = [
    {
      area: "Centres",
      item: "Verified centres",
      status: real.length ? "ok" : "blocker",
      detail: real.length
        ? `${real.length} verified, active centres`
        : "No verified centre: the bot cannot suggest any centre",
      fix: "Centres (add or import the real directory)",
    },
  ];
  if (sample.length)
    out.push({
      area: "Centres",
      item: "Sample centres",
      status: "blocker",
      detail: `${sample.length} sample centre(s) still active: ${sample
        .map((r) => r.name)
        .slice(0, 5)
        .join(", ")}`,
      fix: "Centres (delete or deactivate)",
    });
  if (noPlace.length)
    out.push({
      area: "Centres",
      item: "Centre location",
      status: "warn",
      detail: `${noPlace.length} centre(s) have no latitude / longitude: the distance search skips or misplaces them`,
      fix: "Centres",
    });
  return out;
}

export function assetChecks(
  rows: { code: string; url: string; title: string; approved: boolean }[],
): GoLiveCheck[] {
  const bad = rows.filter((r) => r.approved && (!isRealLink(r.url) || isPlaceholder(r.title)));
  const approved = rows.filter((r) => r.approved).length - bad.length;
  const out: GoLiveCheck[] = [
    {
      area: "Content",
      item: "Approved content",
      status: approved ? "ok" : "warn",
      detail: approved
        ? `${approved} approved item(s)`
        : "No approved content: trust, insurance and testimonial triggers answer with text only, no link",
      fix: "Content",
    },
  ];
  if (bad.length)
    out.push({
      area: "Content",
      item: "Placeholder content",
      status: "blocker",
      detail: `Approved but not real (placeholder link or title): ${bad.map((r) => r.code).join(", ")}`,
      fix: "Content (replace the link and title, or remove the approval)",
    });
  return out;
}

export function templateChecks(
  rows: { name: string; language: string; meta_status: string }[],
): GoLiveCheck[] {
  const en = (n: string) =>
    rows.find((r) => r.name === n && r.language.toLowerCase().startsWith("en"));
  const notOk = REQUIRED_TEMPLATES.filter((n) => en(n)?.meta_status !== "approved");
  const hi = REQUIRED_TEMPLATES.filter((n) =>
    rows.some(
      (r) =>
        r.name === n && r.language.toLowerCase().startsWith("hi") && r.meta_status === "approved",
    ),
  );
  return [
    {
      area: "WhatsApp",
      item: "Message templates",
      status: notOk.length ? "blocker" : "ok",
      detail: notOk.length
        ? `Not approved in Meta: ${notOk.map((n) => `${n} (${en(n)?.meta_status ?? "missing"})`).join(", ")}. Booking updates, reminders and follow-ups outside the 24-hour window cannot be sent.`
        : `All ${REQUIRED_TEMPLATES.length} templates are approved`,
      fix: "Templates (Read status from Meta)",
    },
    {
      area: "WhatsApp",
      item: "Hindi templates",
      status: hi.length === REQUIRED_TEMPLATES.length ? "ok" : "warn",
      detail: `${hi.length} of ${REQUIRED_TEMPLATES.length} approved in Hindi: Hindi customers get the English template for the rest`,
      fix: "Meta Business Manager, then Templates",
    },
  ];
}

/** Actions API: the ACTIONS_API_KEY server key or an active key made on the Developer page */
export function actionsKeyCheck(envKeySet: boolean, consoleKeys: number): GoLiveCheck {
  const base = {
    area: "CRM",
    item: "Actions API key",
    fix: "Developer (generate a key per system)",
  };
  if (!envKeySet && !consoleKeys)
    return {
      ...base,
      status: "warn",
      detail: "No key: the CRM and voice AI cannot call the bot (the Actions API answers 503)",
    };
  const parts = [
    consoleKeys ? `${consoleKeys} active key(s) from the Developer page` : "",
    envKeySet ? "ACTIONS_API_KEY server key" : "",
  ];
  return { ...base, status: "ok", detail: parts.filter(Boolean).join(" + ") };
}

@Injectable()
export class GoLiveService {
  constructor(private readonly _Config: ConfigService) {}

  private has(path: string) {
    return !isPlaceholder(this._Config.get<string>(path));
  }

  private setting(
    area: string,
    item: string,
    path: string,
    status: CheckStatus,
    why: string,
  ): GoLiveCheck {
    const ok = this.has(path);
    return {
      area,
      item,
      status: ok ? "ok" : status,
      detail: ok ? "Set" : `Not set: ${why}`,
      fix: "Settings",
    };
  }

  /** Asks Meta whether the token and the phone number id really work (a real call, no message is sent) */
  private async whatsappLive(): Promise<GoLiveCheck> {
    const base = {
      area: "WhatsApp",
      item: "Connection to Meta",
      fix: "Settings (a permanent System User token)",
    };
    if (!this.has("Whatsapp.AccessToken") || !this.has("Whatsapp.PhoneNumberId"))
      return { ...base, status: "blocker", detail: "Access token or Phone Number ID is not set" };
    try {
      const api = String(
        this._Config.get("Whatsapp.ApiBase") || "https://graph.facebook.com",
      ).replace(/\/+$/, "");
      const res = await axios.get(
        `${api}/${this._Config.get("Whatsapp.ApiVersion")}/${encodeURIComponent(String(this._Config.get("Whatsapp.PhoneNumberId")))}`,
        {
          params: { fields: "display_phone_number,verified_name,quality_rating" },
          headers: { Authorization: `Bearer ${this._Config.get("Whatsapp.AccessToken")}` },
          timeout: 8000,
        },
      );
      const d = res.data ?? {};
      return {
        ...base,
        status: "ok",
        detail:
          `Connected: ${d.verified_name ?? "business"} ${d.display_phone_number ?? ""}${d.quality_rating ? `, quality ${d.quality_rating}` : ""}`.trim(),
      };
    } catch (e: any) {
      const msg = e?.response?.data?.error?.message ?? e?.message ?? "no answer";
      return {
        ...base,
        status: "blocker",
        detail: `Meta refused the token or the number: ${String(msg).slice(0, 200)}`,
      };
    }
  }

  private llm(): GoLiveCheck {
    const keyOf: Record<string, string> = {
      claude: "Anthropic.ApiKey",
      openai: "OpenAI.ApiKey",
      gemini: "Gemini.ApiKey",
    };
    const preferred = String(this._Config.get("Llm.Provider") || "claude");
    const withKey = Object.keys(keyOf).filter((p) => this.has(keyOf[p]));
    if (!withKey.length)
      return {
        area: "AI",
        item: "LLM key",
        status: "blocker",
        detail: "No API key for Claude, OpenAI or Gemini: every reply becomes the holding message",
        fix: "Settings",
      };
    if (!withKey.includes(preferred))
      return {
        area: "AI",
        item: "LLM key",
        status: "warn",
        detail: `The preferred provider (${preferred}) has no key; ${withKey[0]} is used instead`,
        fix: "Settings",
      };
    return {
      area: "AI",
      item: "LLM key",
      status: withKey.length > 1 ? "ok" : "warn",
      detail:
        withKey.length > 1
          ? `${preferred} first, fallback available (${withKey.filter((p) => p !== preferred).join(", ")})`
          : `${preferred} only: no fallback when it is down`,
      fix: "Settings",
    };
  }

  private crm(): GoLiveCheck[] {
    if (!this._Config.get("Crm.Enabled"))
      return [
        {
          area: "CRM",
          item: "CRM sync",
          status: "warn",
          detail: "Off: bookings, tasks and activations stay in the console only",
          fix: "Settings",
        },
      ];
    const url = this._Config.get<string>("Crm.BaseUrl");
    return [
      {
        area: "CRM",
        item: "CRM address",
        status: isRealLink(url) ? "ok" : "blocker",
        detail: isRealLink(url)
          ? "Set"
          : "CRM sync is on but the address is missing or a placeholder: every CRM call fails",
        fix: "Settings",
      },
      this.setting(
        "CRM",
        "CRM API key",
        "Crm.ApiKey",
        "blocker",
        "the CRM refuses the bot's calls",
      ),
      this.setting(
        "CRM",
        "CRM webhook secret",
        "Crm.WebhookSecret",
        "blocker",
        "booking confirmations and payments from the CRM are refused",
      ),
    ];
  }

  async run(): Promise<{
    ready: boolean;
    blockers: number;
    warnings: number;
    checked_at: string;
    checks: GoLiveCheck[];
  }> {
    const [plans, centres, assets, templates, demo, live, keys] = await Promise.all([
      plan_catalog.find({
        where: { status: true } as any,
        order: { product: "DESC", plan: "ASC", billing: "ASC" } as any,
      }),
      centre.find(),
      approved_asset.find(),
      wa_template.find(),
      user.find({ where: { email: In(DEMO_USER_EMAILS), status: true } as any }),
      this.whatsappLive(),
      api_key.find({ where: { revoked_at: IsNull() } }),
    ]);
    const prod = process.env.NODE_ENV === "production";
    const checks: GoLiveCheck[] = [
      {
        area: "Server",
        item: "Production mode",
        status: prod ? "ok" : "blocker",
        detail: prod
          ? "NODE_ENV=production"
          : `NODE_ENV=${process.env.NODE_ENV || "(not set)"}: demo logins are created and the test-send endpoint is open`,
        fix: "Server environment",
      },
      {
        area: "Server",
        item: "Demo logins",
        status: demo.length ? "blocker" : "ok",
        detail: demo.length
          ? `Active demo accounts with the shared password: ${demo.map((u) => u.email).join(", ")}`
          : "None",
        fix: "Users (create real users, then deactivate these)",
      },
      live,
      this.setting(
        "WhatsApp",
        "App secret",
        "Whatsapp.AppSecret",
        "blocker",
        "incoming messages cannot be verified as coming from Meta",
      ),
      this.setting(
        "WhatsApp",
        "Webhook verify token",
        "Whatsapp.VerifyToken",
        "blocker",
        "Meta cannot register the webhook",
      ),
      this.setting(
        "WhatsApp",
        "Business Account ID",
        "Whatsapp.WabaId",
        "warn",
        "template status cannot be read from Meta",
      ),
      ...templateChecks(templates),
      this.llm(),
      ...planChecks(plans),
      ...centreChecks(centres as any),
      ...assetChecks(assets as any),
      ...this.crm(),
      actionsKeyCheck(
        this.has("Actions.ApiKey"),
        keys.filter((k) => keyState(k) === "active").length,
      ),
      {
        area: "Policy",
        item: "Data retention period",
        status: retentionDays() ? "ok" : "warn",
        detail: retentionDays()
          ? `${retentionDays()} days`
          : "RETENTION_DAYS is not set: old customer data is never removed",
        fix: "Server environment (period from legal)",
      },
      {
        area: "Policy",
        item: "Team hours for callbacks",
        status: process.env.TEAM_HOURS ? "ok" : "warn",
        detail: process.env.TEAM_HOURS
          ? `${process.env.TEAM_HOURS}, days ${process.env.TEAM_DAYS || "1-6"}`
          : "TEAM_HOURS is not set: 10 am to 7 pm, Monday to Saturday is offered",
        fix: "Server environment",
      },
    ];
    const blockers = checks.filter((c) => c.status === "blocker").length;
    return {
      ready: blockers === 0,
      blockers,
      warnings: checks.filter((c) => c.status === "warn").length,
      checked_at: new Date().toISOString(),
      checks,
    };
  }
}
