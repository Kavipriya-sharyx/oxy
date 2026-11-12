import { queuePrefix, redisDb } from "./Redis";

export default () => ({
  Port: process.env.PORT || 8000,
  Database: {
    Host: process.env.DB_HOST,
    Port: Number(process.env.DB_PORT) || 5432,
    User: process.env.DB_USER,
    Password: process.env.DB_PASS,
    Name: process.env.DB_NAME,
    Seed: process.env.DB_SEED,
    Sync: process.env.DB_SYNC == "true",
    LOG: process.env.DB_LOG == "true",
  },
  Encryption: {
    SecertKey: process.env.SECERT_KEY,
  },
  JWT: {
    SecertToken: process.env.TOKEN_SECRET,
    ExpiresIn: process.env.ExpiresIn,
  },
  InfluxDB: {
    INFLUX_URL: process.env.INFLUX_URL,
    INFLUX_TOKEN: process.env.INFLUX_TOKEN,
    INFLUX_ORG: process.env.INFLUX_ORG,
    INFLUX_BUCKET: process.env.INFLUX_BUCKET,
    INFLUX_DB: process.env.INFLUX_DB,
  },
  Redis: {
    Host: process.env.REDIS_HOST,
    Port: Number(process.env.REDIS_PORT),
    Db: redisDb(),
  },
  Queue: {
    Prefix: queuePrefix(),
  },
  Anthropic: {
    ApiKey: process.env.ANTHROPIC_API_KEY,
  },
  OpenAI: {
    ApiKey: process.env.OPENAI_API_KEY,
    Model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  },
  Whatsapp: {
    VerifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    AppSecret: process.env.WHATSAPP_APP_SECRET,
    AccessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    PhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    ApiVersion: process.env.WHATSAPP_API_VERSION || "v21.0",
    ApiBase: process.env.WHATSAPP_API_BASE || "https://graph.facebook.com",
  },
  Crm: {
    Enabled: process.env.CRM_ENABLED == "true",
    BaseUrl: process.env.CRM_BASE_URL,
    ApiKey: process.env.CRM_API_KEY,
    WebhookSecret: process.env.CRM_WEBHOOK_SECRET,
    MaxAttempts: Number(process.env.CRM_MAX_ATTEMPTS || 8),
  },
  AuditLog: {
    Enable: process.env.AUDIT_LOG == "true",
  },
  FileStoragePath: process.env.STORAGE_PATH || "/uploads",
});
