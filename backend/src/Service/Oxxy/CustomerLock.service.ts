import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { queuePrefix } from "@Root/Config/Redis";

export class LockTimeoutError extends Error {
  constructor(customerId: string) {
    super(`Could not get the lock for customer ${customerId} in time`);
    this.name = "LockTimeoutError";
  }
}

// Only what we use from ioredis. Works on Redis 5: SET key token PX ttl NX, and EVAL.
export interface RedisLike {
  set(key: string, value: string, px: "PX", ttl: number, nx: "NX"): Promise<string | null>;
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
}

export interface LockOptions {
  ttlMs?: number; // the lock expires by itself after this if it is not renewed (default 90 s)
  renewMs?: number; // while fn runs, extend the TTL this often (default 30 s, or ttl / 3 if the ttl is small)
  waitMs?: number; // how long to wait for the lock (default 20 s)
  retryMinMs?: number;
  retryMaxMs?: number;
}

// release only if the lock is still ours (compare, then delete)
const RELEASE = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

// extend the TTL only if the lock is still ours (compare, then pexpire)
const RENEW = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) else return 0 end`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One customer = one message at a time, in order. Different customers run in parallel.
@Injectable()
export class CustomerLockService {
  constructor(@Inject("REDIS_CLIENT") private readonly redis: RedisLike) {}

  async withCustomerLock<T>(
    customerId: string,
    fn: () => Promise<T>,
    opts: LockOptions = {},
  ): Promise<T> {
    const ttl = opts.ttlMs ?? 90_000;
    const renew = opts.renewMs ?? Math.min(30_000, Math.floor(ttl / 3));
    const wait = opts.waitMs ?? 20_000;
    const minRetry = opts.retryMinMs ?? 100;
    const maxRetry = opts.retryMaxMs ?? 200;
    const key = `${queuePrefix()}:lock:customer:${customerId}`;
    const token = randomUUID();
    const deadline = Date.now() + wait;

    while ((await this.redis.set(key, token, "PX", ttl, "NX")) !== "OK") {
      if (Date.now() >= deadline) throw new LockTimeoutError(customerId); // the queue job retries
      await sleep(minRetry + Math.random() * (maxRetry - minRetry));
    }

    // keep the lock alive while fn runs (a slow Claude call must not lose it)
    const timer = setInterval(() => {
      this.redis
        .eval(RENEW, 1, key, token, String(ttl))
        .then((renewed) => {
          if (Number(renewed) !== 1) clearInterval(timer); // not ours any more: stop renewing
        })
        .catch(() => undefined); // a Redis hiccup: try again at the next tick
    }, renew);
    timer.unref?.(); // never keeps the process alive on its own

    try {
      return await fn();
    } finally {
      clearInterval(timer);
      // never throws out of finally: a Redis problem here must not hide fn's result or error
      await this.redis.eval(RELEASE, 1, key, token).catch(() => undefined);
    }
  }
}
