// The plan catalogue rows the system starts with. Prices, savings and age limits come from Full Development
// Plan section 1.1. NO sample data: the official activation link of every plan, and the renewal terms and
// activation time of the Oxxy plans, are not known here, so they start EMPTY. Oxxy enters them in the console
// (Plans: propose, a second user approves). Until then the bot gives no price disclosure or link for that plan
// and hands over to the team (Helper/GoLive.ts planReady); the Go-live check lists what is missing.

export const GST_RATE = 0.18;

export interface PlanSeed {
  product: "oxxy" | "cut_medi_bills";
  plan: string;
  billing: "monthly" | "yearly";
  price: number;
  auto_renews: boolean;
  renewal_terms: string | null;
  max_saving_pct: number | null;
  illustration_pct: number | null;
  age_limit: number | null;
  activation_time: string | null;
  activation_link: string | null;
}

// plan, monthly price, yearly price, savings up to %, illustration %, age limit
export const OXXY_PLANS: [string, number, number, number, number, number | null][] = [
  ["everyday", 999, 10000, 20, 20, 70],
  ["vital", 1999, 20000, 25, 25, 75],
  ["thrive", 2999, 30000, 30, 30, 80],
  ["infinity", 3999, 40000, 40, 30, null],
];

export function planSeeds(): PlanSeed[] {
  const rows: PlanSeed[] = [];
  for (const [plan, monthly, yearly, upTo, rate, age] of OXXY_PLANS) {
    for (const [billing, price] of [
      ["monthly", monthly],
      ["yearly", yearly],
    ] as const) {
      rows.push({
        product: "oxxy",
        plan,
        billing,
        price,
        auto_renews: false,
        renewal_terms: null,
        max_saving_pct: upTo,
        illustration_pct: rate,
        age_limit: age,
        activation_time: null,
        activation_link: null,
      });
    }
  }
  rows.push(
    {
      product: "cut_medi_bills",
      plan: "cut_medi_bills",
      billing: "monthly",
      price: 4999,
      auto_renews: true,
      renewal_terms:
        "Renews every month until you cancel. A notice is sent before each renewal charge.",
      max_saving_pct: 30,
      illustration_pct: 30,
      age_limit: null,
      activation_time: "5 to 10 working days",
      activation_link: null,
    },
    {
      product: "cut_medi_bills",
      plan: "cut_medi_bills",
      billing: "yearly",
      price: 19999,
      auto_renews: false,
      renewal_terms: "One-time payment, valid for one year, no automatic renewal.",
      max_saving_pct: 30,
      illustration_pct: 30,
      age_limit: null,
      activation_time: "5 to 10 working days",
      activation_link: null,
    },
  );
  return rows;
}
