import { queuePrefix, redisConnection, redisDb } from "./Redis";

describe("Redis isolation settings", () => {
  const saved = { db: process.env.REDIS_DB, prefix: process.env.QUEUE_PREFIX };
  afterEach(() => {
    process.env.REDIS_DB = saved.db;
    process.env.QUEUE_PREFIX = saved.prefix;
  });

  it("the unit tests run with their own database and prefix (set by test/jest.setup.js)", () => {
    expect(redisDb()).toBe(15);
    expect(queuePrefix()).toBe("oxxy-test");
  });

  it("defaults: REDIS_DB 0, QUEUE_PREFIX oxxy", () => {
    delete process.env.REDIS_DB;
    delete process.env.QUEUE_PREFIX;
    expect(redisDb()).toBe(0);
    expect(queuePrefix()).toBe("oxxy");
  });

  it("a bad REDIS_DB falls back to 0", () => {
    for (const bad of ["", "abc", "-1", "1.5"]) {
      process.env.REDIS_DB = bad;
      expect(redisDb()).toBe(0);
    }
  });

  it("the BullMQ connection carries the db and never retries forever per request", () => {
    process.env.REDIS_DB = "7";
    expect(redisConnection()).toMatchObject({ db: 7, maxRetriesPerRequest: null });
  });
});
