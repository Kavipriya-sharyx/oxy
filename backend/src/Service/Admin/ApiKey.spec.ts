import { ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { api_key } from "@Database/Table/Admin/api_key";
import { ApiKeyService, hashKey, keyState, newApiKey } from "./ApiKey.service";
import { ActionsApiKeyGuard } from "@Controller/Crm/Actions.controller";
import { buildPostmanCollection } from "@Helper/PostmanCollection";

const config = (values: Record<string, unknown> = {}) =>
  ({ get: (k: string) => values[k] }) as never;

function service(values: Record<string, unknown> = {}) {
  const sys = { updateSettings: jest.fn(async () => ({ updated: 1, items: [] })) };
  return { svc: new ApiKeyService(config(values), sys as never), sys };
}

function stubLookup(row: Partial<api_key> | null) {
  const qb = { where: () => qb, andWhere: () => qb, getOne: jest.fn(async () => row) };
  jest.spyOn(api_key, "createQueryBuilder").mockReturnValue(qb as never);
  jest.spyOn(api_key, "update").mockResolvedValue({} as never);
  return qb;
}

afterEach(() => jest.restoreAllMocks());

describe("API keys (Developer page)", () => {
  it("makes long random keys with a readable prefix", () => {
    const a = newApiKey("production");
    const b = newApiKey("development");
    expect(a).toMatch(/^oxk_live_[A-Za-z0-9_-]{43}$/);
    expect(b).toMatch(/^oxk_test_/);
    expect(a).not.toBe(newApiKey("production"));
  });

  it("tells active, expired and revoked keys apart", () => {
    const now = new Date("2026-11-14T10:00:00Z");
    expect(keyState({ revoked_at: null, expires_at: null }, now)).toBe("active");
    expect(keyState({ revoked_at: null, expires_at: new Date("2026-11-13") }, now)).toBe("expired");
    expect(keyState({ revoked_at: new Date(), expires_at: null }, now)).toBe("revoked");
  });

  it("stores only the hash and returns the key once", async () => {
    const { svc } = service();
    let saved: any;
    jest.spyOn(api_key, "create").mockImplementation((v: any) => v);
    jest.spyOn(api_key, "save").mockImplementation((async (v: any) => {
      saved = v;
      return { ...v, id: "11111111-1111-1111-1111-111111111111" };
    }) as never);
    const made = await svc.create("Zoho CRM production", 90, {
      id: "u1",
      name: "admin@example.com",
    });
    expect(made.key).toMatch(/^oxk_/);
    expect(saved.key_hash).toBe(hashKey(made.key));
    expect(JSON.stringify(saved)).not.toContain(made.key);
    expect(saved.prefix).toBe(made.key.slice(0, 13));
    expect(new Date(saved.expires_at).getTime() - new Date(saved.issued_at).getTime()).toBe(
      90 * 86_400_000,
    );
  });

  it("refuses a key without a name or with an odd expiry", async () => {
    const { svc } = service();
    await expect(svc.create("  ", null, {})).rejects.toThrow(/name is required/i);
    await expect(svc.create("CRM", 7, {})).rejects.toThrow(/Expiry/);
  });

  it("accepts an active key and refuses an unknown or expired one", async () => {
    const { svc } = service();
    stubLookup({ id: "k1", expires_at: null });
    expect(await svc.verify("oxk_test_abc")).toBe(true);
    expect(api_key.update).toHaveBeenCalledWith(
      "k1",
      expect.objectContaining({ last_used_at: expect.any(Date) }),
    );
    expect(await svc.verify("not-a-console-key")).toBe(false);
    expect(await svc.verify(undefined)).toBe(false);

    const other = service().svc;
    stubLookup({ id: "k2", expires_at: new Date(Date.now() - 1000) });
    expect(await other.verify("oxk_test_old")).toBe(false);

    const none = service().svc;
    stubLookup(null);
    expect(await none.verify("oxk_test_gone")).toBe(false);
  });

  it("a rotated webhook secret is saved through the Configuration settings", async () => {
    const { svc, sys } = service();
    const { secret } = await svc.rotateWebhookSecret();
    expect(secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(sys.updateSettings).toHaveBeenCalledWith({ CRM_WEBHOOK_SECRET: secret });
  });
});

describe("Actions API guard", () => {
  const ctx = (key?: string) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ headers: key ? { "x-api-key": key } : {} }) }),
    }) as never;
  const keys = (valid: boolean, active = 0) => ({
    verify: jest.fn(async () => valid),
    activeCount: jest.fn(async () => active),
  });

  it("takes the env key or a console key", async () => {
    await expect(
      new ActionsApiKeyGuard(
        config({ "Actions.ApiKey": "env-key" }),
        keys(false) as never,
      ).canActivate(ctx("env-key")),
    ).resolves.toBe(true);
    await expect(
      new ActionsApiKeyGuard(config(), keys(true, 1) as never).canActivate(ctx("oxk_test_x")),
    ).resolves.toBe(true);
  });

  it("401 for a wrong key, 503 when no key exists at all", async () => {
    await expect(
      new ActionsApiKeyGuard(config(), keys(false, 1) as never).canActivate(ctx("wrong")),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      new ActionsApiKeyGuard(
        config({ "Actions.ApiKey": "env-key" }),
        keys(false) as never,
      ).canActivate(ctx()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      new ActionsApiKeyGuard(config(), keys(false, 0) as never).canActivate(ctx("x")),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe("Postman collection", () => {
  const c = buildPostmanCollection("https://bot.example.com");

  it("has every customer action and every CRM sync call, and no secrets", () => {
    const [actions, sync] = c.item as any[];
    expect(actions.item.map((i: any) => i.name)).toEqual(
      expect.arrayContaining([
        "lookup_customer",
        "search_centres",
        "create_booking_request",
        "create_follow_up",
        "get_official_plan",
        "send_approved_asset",
        "create_escalation",
        "start_conversation",
        "set_opt_out",
        "customer_record",
      ]),
    );
    const paths = sync.item.map(
      (i: any) => `${i.request.method} ${i.request.url.path.slice(3).join("/")}`,
    );
    expect(paths).toEqual([
      "GET Changes",
      "GET Customers",
      "PUT Customers/{{customer_id}}/CrmId",
      "GET BookingRequests",
      "POST BookingRequests/{{booking_request_id}}/Confirm",
      "POST BookingRequests/{{booking_request_id}}/Reschedule",
      "POST BookingRequests/{{booking_request_id}}/Cancel",
      "GET Activations",
      "POST Activations/{{activation_id}}/Payment",
      "GET Tasks",
      "POST Tasks/{{task_id}}/Complete",
    ]);
    expect(c.variable.find((v) => v.key === "api_key")?.value).toBe("");
    expect(c.variable.some((v) => v.key === "webhook_secret")).toBe(false);
    expect(c.variable.find((v) => v.key === "base_url")?.value).toBe("https://bot.example.com");
  });
});
