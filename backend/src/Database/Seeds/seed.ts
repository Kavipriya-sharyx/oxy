import dataSource from "../data-source";

/**
 * Standalone seed (run after the migrations): npm run seed
 *  - plan_catalog: 4 Oxxy plans (monthly + yearly) and Cut Medi Bills (monthly + annual)
 *  - centres: 5 sample verified centres with PostGIS points
 * Safe to run more than once.
 *
 * Values marked [CONFIRM] are open items in Full Plan section 1.1 and must be replaced
 * with the official values before go-live (GST rate, Oxxy renewal terms and activation
 * time, and the official activation links).
 */

const GST = 0.18; // [CONFIRM]
const CONFIRM_LINK = (slug: string) => `https://example.com/oxxy/activate/${slug}`; // [CONFIRM] official link
const OXXY_ACTIVATION_TIME = "[CONFIRM] activation time"; // not stated in the plan
const OXXY_RENEWAL = "[CONFIRM] renewal terms";

interface PlanRow {
  product: "oxxy" | "cut_medi_bills";
  plan: string | null;
  billing: "monthly" | "yearly";
  price: number;
  auto_renews: boolean;
  renewal_terms: string;
  max_saving_pct: number | null;
  age_limit: number | null;
  activation_time: string;
  activation_link: string;
}

// plan, monthly price, yearly price, max saving %, age limit  (Full Plan 1.1)
const OXXY: [string, number, number, number, number | null][] = [
  ["everyday", 999, 10000, 20, 70],
  ["vital", 1999, 20000, 25, 75],
  ["thrive", 2999, 30000, 30, 80],
  ["infinity", 3999, 40000, 40, null],
];

function planRows(): PlanRow[] {
  const rows: PlanRow[] = [];
  for (const [plan, monthly, yearly, saving, age] of OXXY) {
    for (const [billing, price] of [
      ["monthly", monthly],
      ["yearly", yearly],
    ] as const) {
      rows.push({
        product: "oxxy",
        plan,
        billing,
        price,
        auto_renews: false, // [CONFIRM]
        renewal_terms: OXXY_RENEWAL,
        max_saving_pct: saving,
        age_limit: age,
        activation_time: OXXY_ACTIVATION_TIME,
        activation_link: CONFIRM_LINK(`${plan}-${billing}`),
      });
    }
  }
  rows.push(
    {
      product: "cut_medi_bills",
      plan: null,
      billing: "monthly",
      price: 4999,
      auto_renews: true,
      renewal_terms: "Renews monthly until cancelled",
      max_saving_pct: null,
      age_limit: null,
      activation_time: "5 to 10 working days",
      activation_link: CONFIRM_LINK("cut-medi-bills-monthly"),
    },
    {
      product: "cut_medi_bills",
      plan: null,
      billing: "yearly",
      price: 19999,
      auto_renews: false,
      renewal_terms: "One-time payment for one year",
      max_saving_pct: null,
      age_limit: null,
      activation_time: "5 to 10 working days",
      activation_link: CONFIRM_LINK("cut-medi-bills-annual"),
    },
  );
  return rows;
}

// name, branch, locality, city, postcode, lat, lon, type, specialisations
const CENTRES: [string, string, string, string, string, number, number, string, string[]][] = [
  ["Sample Care Hospital", "Anna Nagar", "Anna Nagar", "Chennai", "600040", 13.085, 80.2101, "multispeciality", ["general", "cardiology"]],
  ["Sample Diagnostics", "T Nagar", "T Nagar", "Chennai", "600017", 13.0418, 80.2341, "diagnostic", ["pathology", "radiology"]],
  ["Sample Dental Clinic", "Adyar", "Adyar", "Chennai", "600020", 13.0012, 80.2565, "clinic", ["dental"]],
  ["Sample Multispeciality", "Indiranagar", "Indiranagar", "Bengaluru", "560038", 12.9719, 77.6412, "multispeciality", ["general", "orthopaedics"]],
  ["Sample Eye Centre", "Bandra", "Bandra West", "Mumbai", "400050", 19.0596, 72.8295, "specialist", ["ophthalmology"]],
];

async function main() {
  await dataSource.initialize();
  const qr = dataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    const existing = await qr.query("SELECT count(*)::int AS n FROM plan_catalog");
    if (existing[0].n === 0) {
      for (const r of planRows()) {
        await qr.query(
          `INSERT INTO plan_catalog
             (product, plan, billing, price, gst_rate, auto_renews, renewal_terms,
              max_saving_pct, age_limit, activation_time, activation_link, version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1)`,
          [r.product, r.plan, r.billing, r.price, GST, r.auto_renews, r.renewal_terms,
           r.max_saving_pct, r.age_limit, r.activation_time, r.activation_link],
        );
      }
      console.log("seeded plan_catalog: 8 Oxxy rows + 2 Cut Medi Bills rows");
    } else {
      console.log(`plan_catalog already has ${existing[0].n} rows, skipped`);
    }

    let added = 0;
    for (const [name, branch, locality, city, postcode, lat, lon, type, specs] of CENTRES) {
      const res = await qr.query(
        `INSERT INTO centres
           (name, branch, locality, city, postcode, location, centre_type, specialisations,
            is_private, verified, verification_source, verified_at)
         VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($7, $6), 4326)::geography, $8, $9,
                 true, true, 'sample seed', now())
         ON CONFLICT (name, branch, city) DO NOTHING
         RETURNING id`,
        [name, branch, locality, city, postcode, lat, lon, type, specs],
      );
      added += res.length;
    }
    console.log(`seeded centres: ${added} added`);
    await qr.commitTransaction();
  } catch (e) {
    await qr.rollbackTransaction();
    throw e;
  } finally {
    await qr.release();
    await dataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
