import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes } from "crypto";
import { IsNull } from "typeorm";
import { api_key } from "@Database/Table/Admin/api_key";
import { SystemConfigService } from "@Service/Admin/SystemConfig.service";

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** "oxk_live_<43 chars>" (or oxk_test_ outside production): 256 random bits, URL-safe. */
export function newApiKey(env = process.env.NODE_ENV): string {
  const kind = env === "production" ? "live" : "test";
  return `oxk_${kind}_${randomBytes(32).toString("base64url")}`;
}

export const EXPIRY_DAYS = [30, 90, 180, 365] as const;
const CACHE_MS = 10_000; // a key revoked on another server instance stops working within 10 s
const TOUCH_MS = 60_000;

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  created_by_name: string | null;
  issued_at: Date;
  expires_at: Date | null;
  last_used_at: Date | null;
  revoked_at: Date | null;
  state: "active" | "expired" | "revoked";
}

export function keyState(
  k: { revoked_at: Date | null; expires_at: Date | null },
  now = new Date(),
): ApiKeyRow["state"] {
  if (k.revoked_at) return "revoked";
  if (k.expires_at && new Date(k.expires_at) <= now) return "expired";
  return "active";
}

// Actions API keys made in the console's Developer page. The ACTIONS_API_KEY env key keeps working next to them.
@Injectable()
export class ApiKeyService {
  // hash -> {id, expires_at, checked}: saves a database read on every Actions call
  private cache = new Map<string, { id: string; expires: number | null; at: number }>();
  private touched = new Map<string, number>();

  constructor(
    private readonly _Config: ConfigService,
    private readonly _SystemConfig: SystemConfigService,
  ) {}

  async list(): Promise<ApiKeyRow[]> {
    const rows = await api_key.find({ order: { issued_at: "DESC" } });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      prefix: r.prefix,
      created_by_name: r.created_by_name,
      issued_at: r.issued_at,
      expires_at: r.expires_at,
      last_used_at: r.last_used_at,
      revoked_at: r.revoked_at,
      state: keyState(r),
    }));
  }

  /** Makes a key. The plain key is returned only here; the database keeps its hash. */
  async create(
    name: string,
    expiresInDays: number | null,
    by: { id?: string; name?: string | null },
  ) {
    const clean = String(name ?? "").trim();
    if (!clean) throw new BadRequestException('A name is required, e.g. "Zoho CRM production"');
    if (clean.length > 80)
      throw new BadRequestException("Name is too long (80 characters at most)");
    if (expiresInDays !== null && !(EXPIRY_DAYS as readonly number[]).includes(expiresInDays)) {
      throw new BadRequestException(
        `Expiry must be one of ${EXPIRY_DAYS.join(", ")} days, or never`,
      );
    }
    const key = newApiKey();
    const issued = new Date();
    const row = await api_key.save(
      api_key.create({
        name: clean,
        prefix: key.slice(0, 13),
        key_hash: hashKey(key),
        created_by_id: by.id,
        created_by_name: by.name ?? null,
        issued_at: issued,
        expires_at: expiresInDays ? new Date(issued.getTime() + expiresInDays * 86_400_000) : null,
      }),
    );
    return { id: row.id, name: row.name, prefix: row.prefix, expires_at: row.expires_at, key };
  }

  async revoke(id: string) {
    const row = await api_key.findOne({ where: { id } });
    if (!row) throw new NotFoundException("API key not found");
    if (!row.revoked_at) {
      row.revoked_at = new Date();
      await row.save();
    }
    this.cache.clear();
    return { id: row.id, revoked_at: row.revoked_at };
  }

  async activeCount(): Promise<number> {
    const rows = await api_key.find({ where: { revoked_at: IsNull() } });
    return rows.filter((r) => keyState(r) === "active").length;
  }

  /** true when the given key is an active console key. Records when it was last used (at most once a minute). */
  async verify(given: string | undefined): Promise<boolean> {
    if (!given || !given.startsWith("oxk_")) return false;
    const hash = hashKey(given);
    const now = Date.now();
    let hit = this.cache.get(hash);
    if (!hit || now - hit.at > CACHE_MS) {
      const row = await api_key
        .createQueryBuilder("k")
        .where("k.key_hash = :hash", { hash })
        .andWhere("k.revoked_at IS NULL")
        .getOne();
      if (!row) {
        this.cache.delete(hash);
        return false;
      }
      hit = {
        id: row.id,
        expires: row.expires_at ? new Date(row.expires_at).getTime() : null,
        at: now,
      };
      this.cache.set(hash, hit);
    }
    if (hit.expires !== null && hit.expires <= now) return false;
    if (now - (this.touched.get(hit.id) ?? 0) > TOUCH_MS) {
      this.touched.set(hit.id, now);
      api_key.update(hit.id, { last_used_at: new Date(now) }).catch(() => undefined);
    }
    return true;
  }

  /** Makes a new CRM webhook signing secret, saves it like the Configuration page does, returns it once. */
  async rotateWebhookSecret(): Promise<{ secret: string }> {
    const secret = `whsec_${randomBytes(32).toString("base64url")}`;
    await this._SystemConfig.updateSettings({ CRM_WEBHOOK_SECRET: secret });
    return { secret };
  }

  async overview() {
    return {
      env_key_set: !!this._Config.get<string>("Actions.ApiKey"),
      active_keys: await this.activeCount(),
      webhook_secret_set: !!this._Config.get<string>("Crm.WebhookSecret"),
      crm_enabled: !!this._Config.get<boolean>("Crm.Enabled"),
      crm_base_url: this._Config.get<string>("Crm.BaseUrl") || null,
      expiry_days: EXPIRY_DAYS,
    };
  }
}
