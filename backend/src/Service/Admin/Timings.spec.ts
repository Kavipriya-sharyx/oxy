// Timings set on the Configuration page apply at once (read live from process.env) and are checked on save.
import { BadRequestException } from "@nestjs/common";
import { system_config } from "@Database/Table/Admin/system_config";
import { SystemConfigService } from "./SystemConfig.service";
import { hour12, isQuietHours, nextAllowedAt, proactiveHours } from "@Service/Oxxy/WhatsappRules";
import { rescueDelayMs } from "@Service/Oxxy/RecoveryFlow";
import { journeyDays, triggerQDelayMs } from "@Service/Oxxy/ChatPipeline.service";

const KEYS = [
  "PROACTIVE_FROM",
  "PROACTIVE_UNTIL",
  "RESCUE_1_HOURS",
  "RESCUE_2_HOURS",
  "TRIGGER_Q_DELAY_HOURS",
  "JOURNEY_DAYS",
  "TEAM_HOURS",
  "TEAM_DAYS",
];
const saved: Record<string, string | undefined> = {};
beforeEach(() => KEYS.forEach((k) => (saved[k] = process.env[k])));
afterEach(() => {
  KEYS.forEach((k) =>
    saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]),
  );
  jest.restoreAllMocks();
});

function service() {
  const rows = new Map<string, any>();
  jest
    .spyOn(system_config, "findOne")
    .mockImplementation((async (o: any) => rows.get(o.where.key) ?? null) as never);
  jest.spyOn(system_config, "create").mockImplementation(((v: any) => v) as never);
  jest
    .spyOn(system_config, "save")
    .mockImplementation((async (v: any) => rows.set(v.key, v) && v) as never);
  const cfg = { get: () => undefined, set: jest.fn() };
  return { svc: new SystemConfigService(cfg as never), rows };
}

describe("quiet hours from the settings", () => {
  it("defaults to 09:00-21:00 IST and falls back on a broken value", () => {
    delete process.env.PROACTIVE_FROM;
    delete process.env.PROACTIVE_UNTIL;
    expect(proactiveHours()).toEqual({ from: 9, until: 21 });
    expect(proactiveHours({ PROACTIVE_FROM: "22", PROACTIVE_UNTIL: "8" })).toEqual({
      from: 9,
      until: 21,
    });
    expect(hour12(9)).toBe("9 am");
    expect(hour12(21)).toBe("9 pm");
  });

  it("10 to 20 moves quiet hours and the next allowed time at once", () => {
    process.env.PROACTIVE_FROM = "10";
    process.env.PROACTIVE_UNTIL = "20";
    expect(isQuietHours(new Date("2026-11-20T04:00:00Z"))).toBe(true); // 09:30 IST
    expect(isQuietHours(new Date("2026-11-20T05:00:00Z"))).toBe(false); // 10:30 IST
    expect(isQuietHours(new Date("2026-11-20T14:45:00Z"))).toBe(true); // 20:15 IST
    expect(nextAllowedAt(new Date("2026-11-20T14:45:00Z")).toISOString()).toBe(
      "2026-11-21T04:30:00.000Z",
    ); // 10:00 IST
    expect(nextAllowedAt(new Date("2026-11-20T01:00:00Z")).toISOString()).toBe(
      "2026-11-20T04:30:00.000Z",
    );
  });
});

describe("other timings read live", () => {
  it("rescue gaps, payment reminder and journey window follow the settings, with safe defaults", () => {
    delete process.env.RESCUE_1_HOURS;
    expect(rescueDelayMs(0)).toBe(20 * 3600000);
    process.env.RESCUE_1_HOURS = "6";
    process.env.RESCUE_2_HOURS = "24";
    expect(rescueDelayMs(0)).toBe(6 * 3600000);
    expect(rescueDelayMs(1)).toBe(24 * 3600000);
    process.env.TRIGGER_Q_DELAY_HOURS = "2";
    expect(triggerQDelayMs()).toBe(2 * 3600000);
    process.env.JOURNEY_DAYS = "abc";
    expect(journeyDays()).toBe(7);
  });
});

describe("Configuration page: Timings", () => {
  it("are listed in their own group with the values in use", async () => {
    process.env.TEAM_HOURS = "10-19";
    const { svc } = service();
    const t = svc.getSettings().filter((i) => i.group === "timings");
    expect(t.map((i) => i.key)).toEqual(
      expect.arrayContaining([
        "PROACTIVE_FROM",
        "PROACTIVE_UNTIL",
        "TEAM_HOURS",
        "TEAM_DAYS",
        "RESCUE_1_HOURS",
        "RESCUE_2_HOURS",
        "TRIGGER_Q_DELAY_HOURS",
        "JOURNEY_DAYS",
      ]),
    );
    expect(t.find((i) => i.key === "TEAM_HOURS")?.value).toBe("10-19");
  });

  it("a save applies at once; a wrong value is refused and nothing is saved", async () => {
    const { svc, rows } = service();
    await svc.updateSettings({ PROACTIVE_FROM: "10", RESCUE_1_HOURS: "6" });
    expect(process.env.PROACTIVE_FROM).toBe("10");
    expect(rescueDelayMs(0)).toBe(6 * 3600000);
    await expect(
      svc.updateSettings({ PROACTIVE_UNTIL: "25", TEAM_HOURS: "19-10" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.updateSettings({ PROACTIVE_FROM: "22", PROACTIVE_UNTIL: "21" }),
    ).rejects.toThrow(/before its end hour/);
    expect(rows.has("PROACTIVE_UNTIL")).toBe(false);
    await svc.updateSettings({ PROACTIVE_FROM: "" }); // empty = default
    expect(proactiveHours().from).toBe(9);
  });
});
