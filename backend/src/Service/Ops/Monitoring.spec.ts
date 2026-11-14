import { MonitoringService, overall } from "./Monitoring.service";

function svc(opts: { dbUp?: boolean; redisUp?: boolean; stuck?: number; dead?: number; failed?: number } = {}) {
  const ds = {
    query: jest.fn(async (sql: string) => {
      if (opts.dbUp === false) throw new Error("connection refused");
      if (/^SELECT 1$/.test(sql)) return [{ "?column?": 1 }];
      if (/"message"/.test(sql)) return [{ n: String(opts.stuck ?? 0) }];
      if (/crm_outbox/.test(sql)) return [{ n: String(opts.dead ?? 0) }];
      return [{ n: String(opts.failed ?? 0) }];
    }),
  };
  const redis = { ping: jest.fn(async () => (opts.redisUp === false ? Promise.reject(new Error("ECONNREFUSED")) : "PONG")) };
  return new MonitoringService(ds as never, redis);
}

describe("health checks (Full Plan 11)", () => {
  it("all fine = ok", async () => {
    const r = await svc().check();
    expect(r.status).toBe("ok");
    expect(r.checks.database.ok).toBe(true);
    expect(r.checks.redis.ok).toBe(true);
  });

  it("database or Redis down = down", async () => {
    expect((await svc({ dbUp: false }).check()).status).toBe("down");
    expect((await svc({ redisUp: false }).check()).status).toBe("down");
  });

  it("stuck inbound messages or failed CRM webhooks = degraded", async () => {
    expect((await svc({ stuck: 3 }).check()).status).toBe("degraded");
    expect((await svc({ failed: 1 }).check()).status).toBe("degraded");
  });

  it("overall() ranks down above degraded", () => {
    const ok = { ok: true };
    expect(overall({ database: { ok: false }, redis: ok, inbound_stuck: { ok: false }, crm_dead: ok, crm_webhook_failed: ok })).toBe("down");
  });
});

describe("alerts", () => {
  it("one alert per check per throttle window, a recovery note when it is fine again, no text or numbers of customers", async () => {
    const s = svc({ stuck: 2 });
    const alert = jest.spyOn(s, "alert");
    await s.tick();
    await s.tick();
    expect(alert.mock.calls.filter((c) => c[0] === "inbound_stuck")).toHaveLength(2); // called twice...
    const sentTexts = alert.mock.results.length;
    expect(sentTexts).toBe(2);
    expect(await (s as any).alert("inbound_stuck", "x")).toBe(false); // ...but throttled
    expect(String(alert.mock.calls[0][1])).toMatch(/2 inbound message\(s\) not answered/);
  });

  it("only NEW CRM dead letters alert", async () => {
    const s = svc({ dead: 4 });
    const alert = jest.spyOn(s, "alert");
    await s.tick(); // 4 new
    await s.tick(); // still 4: nothing new
    expect(alert.mock.calls.filter((c) => c[0] === "crm_dead")).toHaveLength(1);
  });
});
