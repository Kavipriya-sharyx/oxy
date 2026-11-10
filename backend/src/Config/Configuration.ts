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
  Anthropic: {
    ApiKey: process.env.ANTHROPIC_API_KEY,
  },
  Whatsapp: {
    VerifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    AppSecret: process.env.WHATSAPP_APP_SECRET,
    AccessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    PhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  },
  AuditLog: {
    Enable: process.env.AUDIT_LOG == "true",
  },
  FileStoragePath: process.env.STORAGE_PATH || "/uploads",
});
