import { CustomerLockService, LockTimeoutError, RedisLike } from "./CustomerLock.service";
import { queuePrefix } from "@Root/Config/Redis";

// the key for a customer, including the QUEUE_PREFIX the tests run with
const key = (id: string) => `${queuePrefix()}:lock:customer:${id}`;

// A tiny stand-in for Redis: SET NX PX with expiry, and the compare-and-delete script
class FakeRedis implements RedisLike {
  store = new Map<string, { value: string; expires: number }>();
  set = jest.fn(async (key: string, value: string, ...rest: ["PX", number, "NX"]) => {
    const ttl = rest[1];
    const cur = this.store.get(key);
    if (cur && cur.expires > Date.now()) return null;
    this.store.set(key, { value, expires: Date.now() + ttl });
    return "OK";
  });
  eval = jest.fn(async (script: string, _n: number, k: string, token: string, ttl?: string) => {
    const cur = this.store.get(k);
    const ours = !!cur && cur.value === token;
    if (script.includes("pexpire")) {
      // renew: extend the TTL only if the stored token is ours
      if (ours) cur.expires = Date.now() + Number(ttl);
      return ours ? 1 : 0;
    }
    if (ours) {
      this.store.delete(k);
      return 1;
    }
    return 0;
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fast = { retryMinMs: 5, retryMaxMs: 10, waitMs: 2000 };

describe("CustomerLockService", () => {
  it("takes {prefix}:lock:customer:{id} with SET NX PX 90 s and releases with a compare-and-delete script", async () => {
    const redis = new FakeRedis();
    const lock = new CustomerLockService(redis);
    await lock.withCustomerLock("c1", async () => "done");
    expect(redis.set).toHaveBeenCalledWith(key("c1"), expect.any(String), "PX", 90000, "NX");
    const [script, numKeys, usedKey] = redis.eval.mock.calls[0];
    expect(script).toContain('redis.call("get"');
    expect(script).toContain('redis.call("del"');
    expect(script).not.toContain("pexpire"); // the first eval is the release, nothing was renewed yet
    expect([numKeys, usedKey]).toEqual([1, key("c1")]);
  });

  it("returns what fn returns", async () => {
    const lock = new CustomerLockService(new FakeRedis());
    await expect(lock.withCustomerLock("c1", async () => 42)).resolves.toBe(42);
  });

  it("the same customer: the second caller waits, order is kept", async () => {
    const lock = new CustomerLockService(new FakeRedis());
    const events: string[] = [];
    const first = lock.withCustomerLock(
      "c1",
      async () => {
        events.push("1 start");
        await sleep(80);
        events.push("1 end");
      },
      fast,
    );
    await sleep(10);
    const second = lock.withCustomerLock(
      "c1",
      async () => {
        events.push("2 start");
        events.push("2 end");
      },
      fast,
    );
    await Promise.all([first, second]);
    expect(events).toEqual(["1 start", "1 end", "2 start", "2 end"]);
  });

  it("different customers do not block each other", async () => {
    const lock = new CustomerLockService(new FakeRedis());
    const events: string[] = [];
    const run = (id: string) =>
      lock.withCustomerLock(
        id,
        async () => {
          events.push(`${id} start`);
          await sleep(60);
          events.push(`${id} end`);
        },
        fast,
      );
    await Promise.all([run("c1"), run("c2")]);
    expect(events.slice(0, 2).sort()).toEqual(["c1 start", "c2 start"]); // both started before either ended
  });

  it("is released when fn throws, and the error is passed on", async () => {
    const redis = new FakeRedis();
    const lock = new CustomerLockService(redis);
    await expect(
      lock.withCustomerLock("c1", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(redis.store.has(key("c1"))).toBe(false);
    await expect(lock.withCustomerLock("c1", async () => "next", fast)).resolves.toBe("next");
  });

  it("release does nothing if the token changed (lock expired and someone else took it)", async () => {
    const redis = new FakeRedis();
    const lock = new CustomerLockService(redis);
    await lock.withCustomerLock("c1", async () => {
      // our lock "expired" and another worker now owns the key
      redis.store.set(key("c1"), { value: "someone-else", expires: Date.now() + 60_000 });
    });
    expect(redis.store.get(key("c1"))?.value).toBe("someone-else");
  });

  it("LockTimeoutError when the lock is never freed (and fn never runs)", async () => {
    const redis = new FakeRedis();
    redis.store.set(key("c1"), { value: "stuck", expires: Date.now() + 60_000 });
    const lock = new CustomerLockService(redis);
    const fn = jest.fn(async () => "x");
    await expect(
      lock.withCustomerLock("c1", fn, { waitMs: 60, retryMinMs: 5, retryMaxMs: 10 }),
    ).rejects.toBeInstanceOf(LockTimeoutError);
    expect(fn).not.toHaveBeenCalled();
    expect(redis.store.get(key("c1"))?.value).toBe("stuck"); // someone else's lock is left alone
  });

  it("a Redis error while releasing does not hide fn's result", async () => {
    const redis = new FakeRedis();
    redis.eval.mockRejectedValueOnce(new Error("redis down"));
    const lock = new CustomerLockService(redis);
    await expect(lock.withCustomerLock("c1", async () => "ok")).resolves.toBe("ok");
  });

  describe("renewal while fn runs", () => {
    const pexpireCalls = (redis: FakeRedis) =>
      redis.eval.mock.calls.filter((c) => String(c[0]).includes("pexpire")).length;

    it("the default TTL is 90 s and it is renewed every 30 s", async () => {
      const setInterval = jest.spyOn(global, "setInterval");
      const clearInterval = jest.spyOn(global, "clearInterval");
      const redis = new FakeRedis();
      await new CustomerLockService(redis).withCustomerLock("c1", async () => "x");
      expect(redis.set.mock.calls[0][3]).toBe(90000);
      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 30000);
      expect(clearInterval).toHaveBeenCalled();
      setInterval.mockRestore();
      clearInterval.mockRestore();
    });

    it("keeps the lock alive past its TTL while fn is still running", async () => {
      const redis = new FakeRedis();
      const lock = new CustomerLockService(redis);
      let heldAtEnd = false;
      let stolen: string | null = "";
      await lock.withCustomerLock(
        "c1",
        async () => {
          await sleep(450); // much longer than the 120 ms TTL
          heldAtEnd = (redis.store.get(key("c1"))?.expires ?? 0) > Date.now();
          stolen = await redis.set(key("c1"), "intruder", "PX", 100, "NX"); // someone else tries to take it
        },
        { ttlMs: 120, renewMs: 40 },
      );
      expect(heldAtEnd).toBe(true);
      expect(stolen).toBeNull();
      expect(pexpireCalls(redis)).toBeGreaterThanOrEqual(5);
    });

    it("renews with the same TTL and the same token it locked with", async () => {
      const redis = new FakeRedis();
      await new CustomerLockService(redis).withCustomerLock("c1", async () => sleep(100), {
        ttlMs: 300,
        renewMs: 30,
      });
      const token = redis.set.mock.calls[0][1];
      const renew = redis.eval.mock.calls.find((c) => String(c[0]).includes("pexpire"))!;
      expect(renew.slice(1)).toEqual([1, key("c1"), token, "300"]);
    });

    it("stops renewing when fn finishes", async () => {
      const redis = new FakeRedis();
      await new CustomerLockService(redis).withCustomerLock("c1", async () => sleep(100), {
        ttlMs: 300,
        renewMs: 25,
      });
      const after = pexpireCalls(redis);
      expect(after).toBeGreaterThan(0);
      await sleep(150);
      expect(pexpireCalls(redis)).toBe(after);
      expect(redis.store.has(key("c1"))).toBe(false); // and the lock was released
    });

    it("stops renewing when fn throws", async () => {
      const redis = new FakeRedis();
      await expect(
        new CustomerLockService(redis).withCustomerLock(
          "c1",
          async () => {
            await sleep(60);
            throw new Error("boom");
          },
          { ttlMs: 300, renewMs: 25 },
        ),
      ).rejects.toThrow("boom");
      const after = pexpireCalls(redis);
      await sleep(100);
      expect(pexpireCalls(redis)).toBe(after);
    });

    it("never extends a lock that is not ours any more, and stops trying", async () => {
      const redis = new FakeRedis();
      const lock = new CustomerLockService(redis);
      let otherExpires = 0;
      await lock.withCustomerLock(
        "c1",
        async () => {
          // our lock "expired" and another worker took the key
          otherExpires = Date.now() + 80;
          redis.store.set(key("c1"), { value: "someone-else", expires: otherExpires });
          await sleep(250);
        },
        { ttlMs: 300, renewMs: 30 },
      );
      expect(redis.store.get(key("c1"))).toEqual({ value: "someone-else", expires: otherExpires }); // untouched
      expect(pexpireCalls(redis)).toBe(1); // one failed renewal, then it gave up
    });

    it("a Redis error while renewing does not break fn", async () => {
      const redis = new FakeRedis();
      const original = redis.eval.getMockImplementation()!;
      redis.eval.mockImplementation(async (...a) => {
        if (String(a[0]).includes("pexpire")) throw new Error("redis hiccup");
        return original(...a);
      });
      await expect(
        new CustomerLockService(redis).withCustomerLock(
          "c1",
          async () => (await sleep(120), "done"),
          {
            ttlMs: 300,
            renewMs: 30,
          },
        ),
      ).resolves.toBe("done");
    });
  });
});
