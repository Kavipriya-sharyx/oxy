// Unit tests get their own Redis database and key prefix, so they can never touch
// the dev server's queues or locks.
process.env.REDIS_DB = "15";
process.env.QUEUE_PREFIX = "oxxy-test";
