const { Client } = require("/var/www/oxxy/backend/node_modules/pg");

async function main() {
  const agentId = "6863c4b5-7d09-478a-903b-b94017907e19";
  const dbs = [
    "new_sharyx_saas",
    "saas_db_new",
    "saas_db",
    "sharyx_saas_db",
    "assistant_sharyx",
    "billing_saas_prod",
    "client_database",
    "client_database2",
    "client_db",
    "clientsharyx",
    "crm_sharyx",
    "final_saas",
    "vapi_db",
    "vapi_dashboard",
    "oxxyflow",
    "oxxy"
  ];

  for (const db of dbs) {
    const client = new Client({
      host: "127.0.0.1",
      port: 5432,
      user: "myuser",
      password: "Login@123!",
      database: db,
    });
    try {
      await client.connect();
      // Search all tables for this ID
      const tablesRes = await client.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
      );
      for (const t of tablesRes.rows) {
        try {
          const res = await client.query(`SELECT * FROM "${t.table_name}" WHERE id::text = $1`, [agentId]);
          if (res.rows.length > 0) {
            console.log(`\n========================================`);
            console.log(`FOUND AGENT in DB "${db}", Table "${t.table_name}"!`);
            console.log(JSON.stringify(res.rows[0], null, 2));
            console.log(`========================================\n`);
          }
        } catch (_) {}
      }
      await client.end();
    } catch (e) {
      // console.log(`Error on DB ${db}:`, e.message);
    }
  }
}

main().catch(console.error);
