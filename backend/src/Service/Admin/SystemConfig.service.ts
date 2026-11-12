import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { system_config } from "@Database/Table/Admin/system_config";

export interface ConfigFieldDef {
  key: string;
  configPath: string;
  label: string;
  group: "whatsapp" | "ai" | "crm";
  secret?: boolean;
  type?: "string" | "boolean";
  placeholder?: string;
}

export const CONFIG_FIELDS: ConfigFieldDef[] = [
  {
    key: "WHATSAPP_PHONE_NUMBER_ID",
    configPath: "Whatsapp.PhoneNumberId",
    label: "WhatsApp Phone Number ID",
    group: "whatsapp",
    placeholder: "e.g. 1154030421127355",
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
    label: "OpenAI API Key (Fallback)",
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
      const current = this._Config.get<any>(def.configPath);
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

