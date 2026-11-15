import { BadRequestException, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { system_config } from "@Database/Table/Admin/system_config";

export interface ConfigFieldDef {
  key: string;
  configPath: string;
  label: string;
  group: "whatsapp" | "ai" | "crm" | "maps" | "timings";
  secret?: boolean;
  /** read the current value from process.env (values the services read live, not ConfigService) */
  fromEnv?: boolean;
  /** null = fine; else the reason the value is refused. Empty always means "use the default". */
  check?: (v: string) => string | null;
  type?: "string" | "boolean" | "select";
  options?: { value: string; label: string }[]; // type "select" only
  placeholder?: string;
}

const LLM_OPTIONS = [
  { value: "claude", label: "Claude (Anthropic)" },
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Gemini (Google)" },
];

const intIn = (min: number, max: number, what: string) => (v: string) =>
  /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max
    ? null
    : `${what} must be a whole number from ${min} to ${max}`;
const range = (min: number, max: number, what: string) => (v: string) => {
  const m = v.match(/^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*$/);
  return m && Number(m[1]) >= min && Number(m[2]) <= max && Number(m[1]) < Number(m[2])
    ? null
    : `${what} must look like "10-19" (start before end, ${min} to ${max})`;
};

// Business timings [CONFIRM with Oxxy] (Playbook 22.2: quiet hours, team hours, callback; journey window). The
// services read them live from process.env, so a save applies at once, without a restart. Empty = the default.
const TIMINGS: ConfigFieldDef[] = [
  {
    key: "PROACTIVE_FROM",
    configPath: "Timings.ProactiveFrom",
    label: "Bot may message customers from (hour, IST)",
    group: "timings",
    fromEnv: true,
    placeholder: "9",
    check: intIn(0, 23, "The start hour"),
  },
  {
    key: "PROACTIVE_UNTIL",
    configPath: "Timings.ProactiveUntil",
    label: "… until (hour, IST; quiet hours after this)",
    group: "timings",
    fromEnv: true,
    placeholder: "21",
    check: intIn(1, 24, "The end hour"),
  },
  {
    key: "TEAM_HOURS",
    configPath: "Timings.TeamHours",
    label: "Team hours for callbacks (start-end hour)",
    group: "timings",
    fromEnv: true,
    placeholder: "10-19",
    check: range(0, 24, "Team hours"),
  },
  {
    key: "TEAM_DAYS",
    configPath: "Timings.TeamDays",
    label: "Team days (0 = Sunday … 6 = Saturday)",
    group: "timings",
    fromEnv: true,
    placeholder: "1-6",
    check: range(0, 6, "Team days"),
  },
  {
    key: "RESCUE_1_HOURS",
    configPath: "Timings.Rescue1",
    label: "First nudge when the customer goes quiet (hours)",
    group: "timings",
    fromEnv: true,
    placeholder: "20",
    check: intIn(1, 168, "The first nudge"),
  },
  {
    key: "RESCUE_2_HOURS",
    configPath: "Timings.Rescue2",
    label: "Second nudge (hours after the first)",
    group: "timings",
    fromEnv: true,
    placeholder: "48",
    check: intIn(1, 168, "The second nudge"),
  },
  {
    key: "TRIGGER_Q_DELAY_HOURS",
    configPath: "Timings.TriggerQ",
    label: "Payment reminder after the link (hours)",
    group: "timings",
    fromEnv: true,
    placeholder: "4",
    check: intIn(1, 72, "The payment reminder"),
  },
  {
    key: "JOURNEY_DAYS",
    configPath: "Timings.JourneyDays",
    label: "Decision-journey window (days)",
    group: "timings",
    fromEnv: true,
    placeholder: "7",
    check: intIn(1, 90, "The journey window"),
  },
];

export const CONFIG_FIELDS: ConfigFieldDef[] = [
  {
    key: "WHATSAPP_PHONE_NUMBER_ID",
    configPath: "Whatsapp.PhoneNumberId",
    label: "WhatsApp Phone Number ID",
    group: "whatsapp",
    placeholder: "e.g. 1154030421127355",
  },
  {
    key: "WHATSAPP_WABA_ID",
    configPath: "Whatsapp.WabaId",
    label: "WhatsApp Business Account ID (template status sync)",
    group: "whatsapp",
    placeholder: "e.g. 102290129340398",
  },
  {
    key: "WHATSAPP_VERIFY_TOKEN",
    configPath: "Whatsapp.VerifyToken",
    label: "Webhook Verify Token",
    group: "whatsapp",
    placeholder: "e.g. oxxy-verify-2026",
  },
  {
    key: "WHATSAPP_APP_SECRET",
    configPath: "Whatsapp.AppSecret",
    label: "Meta App Secret",
    group: "whatsapp",
    secret: true,
    placeholder: "Meta App Settings -> Basic -> App Secret",
  },
  {
    key: "WHATSAPP_ACCESS_TOKEN",
    configPath: "Whatsapp.AccessToken",
    label: "WhatsApp Access Token",
    group: "whatsapp",
    secret: true,
    placeholder: "Meta Cloud API permanent/temporary token",
  },
  {
    key: "WHATSAPP_API_VERSION",
    configPath: "Whatsapp.ApiVersion",
    label: "Graph API Version",
    group: "whatsapp",
    placeholder: "v21.0",
  },
  {
    key: "WHATSAPP_API_BASE",
    configPath: "Whatsapp.ApiBase",
    label: "Graph API Base URL",
    group: "whatsapp",
    placeholder: "https://graph.facebook.com",
  },
  {
    key: "LLM_PROVIDER",
    configPath: "Llm.Provider",
    label: "Preferred LLM",
    group: "ai",
    type: "select",
    options: LLM_OPTIONS,
  },
  {
    key: "LLM_FALLBACK",
    configPath: "Llm.Fallback",
    label: "Fallback LLM (used when the preferred one fails)",
    group: "ai",
    type: "select",
    options: [{ value: "", label: "None" }, ...LLM_OPTIONS],
  },
  {
    key: "ANTHROPIC_API_KEY",
    configPath: "Anthropic.ApiKey",
    label: "Anthropic API Key (Claude)",
    group: "ai",
    secret: true,
    placeholder: "sk-ant-...",
  },
  {
    key: "OPENAI_API_KEY",
    configPath: "OpenAI.ApiKey",
    label: "OpenAI API Key",
    group: "ai",
    secret: true,
    placeholder: "sk-proj-...",
  },
  {
    key: "OPENAI_MODEL",
    configPath: "OpenAI.Model",
    label: "OpenAI Model",
    group: "ai",
    placeholder: "gpt-4o-mini",
  },
  {
    key: "ANTHROPIC_MODEL",
    configPath: "Anthropic.Model",
    label: "Claude Model",
    group: "ai",
    placeholder: "claude-opus-5-5",
  },
  {
    key: "GEMINI_API_KEY",
    configPath: "Gemini.ApiKey",
    label: "Gemini API Key",
    group: "ai",
    secret: true,
    placeholder: "AIza...",
  },
  {
    key: "GEMINI_MODEL",
    configPath: "Gemini.Model",
    label: "Gemini Model",
    group: "ai",
    placeholder: "gemini-2.5-flash",
  },
  {
    key: "GOOGLE_MAPS_API_KEY",
    configPath: "Maps.ApiKey",
    label: "Google Maps Platform API key (Geocoding, Routes and Places APIs enabled)",
    group: "maps",
    secret: true,
  },
  {
    key: "GOOGLE_MAPS_BROWSER_KEY",
    configPath: "Maps.BrowserKey",
    label:
      "Google Maps browser key for the console map (Maps JavaScript API, restricted to this site)",
    group: "maps",
  },
  {
    key: "CRM_ENABLED",
    configPath: "Crm.Enabled",
    label: "Enable CRM Sync",
    group: "crm",
    type: "boolean",
  },
  {
    key: "CRM_BASE_URL",
    configPath: "Crm.BaseUrl",
    label: "CRM Base URL",
    group: "crm",
    placeholder: "https://crm.example.com/api",
  },
  {
    key: "CRM_API_KEY",
    configPath: "Crm.ApiKey",
    label: "CRM API Key",
    group: "crm",
    secret: true,
  },
  {
    key: "CRM_WEBHOOK_SECRET",
    configPath: "Crm.WebhookSecret",
    label: "CRM Webhook Secret",
    group: "crm",
    secret: true,
  },
  ...TIMINGS,
];

const MASK_PREFIX = "••••";

@Injectable()
export class SystemConfigService implements OnModuleInit {
  private readonly logger = new Logger(SystemConfigService.name);

  constructor(private readonly _Config: ConfigService) {}

  async onModuleInit() {
    try {
      const rows = await system_config.find();
      for (const row of rows) {
        const def = CONFIG_FIELDS.find((f) => f.key === row.key);
        if (!def || row.value === null) continue;
        this.applyRuntime(def, row.value);
      }
      if (rows.length) {
        this.logger.log(`Loaded ${rows.length} runtime config override(s) from database`);
      }
    } catch (err: any) {
      this.logger.warn(`Skipping DB config load on startup: ${err?.message || err}`);
    }
  }

  private applyRuntime(def: ConfigFieldDef, rawValue: string) {
    process.env[def.key] = rawValue;
    const parsed = def.type === "boolean" ? rawValue === "true" : rawValue;
    this._Config.set(def.configPath, parsed);
  }

  private maskValue(val: string): string {
    if (!val) return "";
    if (val.length <= 4) return MASK_PREFIX;
    return `${MASK_PREFIX}${val.slice(-4)}`;
  }

  getSettings() {
    return CONFIG_FIELDS.map((def) => {
      const current = def.fromEnv ? process.env[def.key] : this._Config.get<any>(def.configPath);
      if (def.type === "boolean") {
        return {
          key: def.key,
          label: def.label,
          group: def.group,
          type: "boolean",
          secret: false,
          isSet: true,
          value: Boolean(current),
          placeholder: def.placeholder,
        };
      }
      const str = current === undefined || current === null ? "" : String(current);
      const isSet = str.length > 0;
      if (def.type === "select") {
        return {
          key: def.key,
          label: def.label,
          group: def.group,
          type: "select",
          secret: false,
          isSet,
          value: str,
          options: def.options ?? [],
          placeholder: def.placeholder,
        };
      }
      return {
        key: def.key,
        label: def.label,
        group: def.group,
        type: "string",
        secret: Boolean(def.secret),
        isSet,
        value: def.secret ? (isSet ? this.maskValue(str) : "") : str,
        placeholder: def.placeholder,
      };
    });
  }

  async updateSettings(values: Record<string, string | boolean>) {
    // check everything first: nothing is saved when one value is wrong
    const problems: string[] = [];
    for (const def of CONFIG_FIELDS) {
      if (!def.check || !(def.key in values)) continue;
      const v = String(values[def.key] ?? "").trim();
      const p = v ? def.check(v) : null;
      if (p) problems.push(p);
    }
    const hour = (k: string, d: number) => {
      const v = k in values ? String(values[k] ?? "").trim() : String(process.env[k] ?? "");
      return v ? Number(v) : d;
    };
    if (!problems.length && hour("PROACTIVE_FROM", 9) >= hour("PROACTIVE_UNTIL", 21))
      problems.push("The bot's start hour must be before its end hour");
    if (problems.length) throw new BadRequestException(problems.join(". "));
    let updated = 0;
    for (const def of CONFIG_FIELDS) {
      if (!(def.key in values)) continue;
      const incoming = values[def.key];
      if (def.type === "boolean") {
        const strVal = incoming === true || incoming === "true" ? "true" : "false";
        await this.upsertKey(def, strVal);
        updated++;
        continue;
      }
      const strVal = incoming === undefined || incoming === null ? "" : String(incoming).trim();
      // Preserve existing secret when the masked placeholder was submitted untouched
      if (def.secret && strVal.startsWith(MASK_PREFIX)) continue;
      // a select keeps only one of its own values
      if (def.type === "select" && !(def.options ?? []).some((o) => o.value === strVal)) continue;
      await this.upsertKey(def, strVal);
      updated++;
    }
    return { updated, items: this.getSettings() };
  }

  private async upsertKey(def: ConfigFieldDef, value: string) {
    let row = await system_config.findOne({ where: { key: def.key } });
    if (!row) {
      row = system_config.create({ key: def.key, value });
    } else {
      row.value = value;
    }
    await system_config.save(row);
    this.applyRuntime(def, value);
  }
}
