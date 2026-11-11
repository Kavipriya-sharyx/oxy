// One place for the Redis settings, so the dev server, the tests and the scripts
// can each use their own REDIS_DB / QUEUE_PREFIX and never share jobs or locks.

function nonNegativeInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return value !== undefined && value !== "" && Number.isInteger(n) && n >= 0 ? n : fallback;
}

export const redisDb = (): number => nonNegativeInt(process.env.REDIS_DB, 0);

// goes in front of every BullMQ key and every lock key
export const queuePrefix = (): string => process.env.QUEUE_PREFIX || "oxxy";

// connection options for BullMQ (it needs maxRetriesPerRequest: null)
export const redisConnection = () => ({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  db: redisDb(),
  maxRetriesPerRequest: null,
});
