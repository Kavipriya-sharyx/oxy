// The ONE copy of the Oxxy sample data. Both seeders (app start and `npm run seed`) use it.
// Values come from Full Development Plan section 1.1. [CONFIRM] = open item Oxxy must answer before go-live.

export const GST_RATE = 0.18; // [CONFIRM]
const LINK = (slug: string) => `https://example.com/oxxy/activate/${slug}`; // [CONFIRM] official links
const OXXY_ACTIVATION_TIME = "[CONFIRM] activation time";
const OXXY_RENEWAL = "[CONFIRM] renewal terms";

export interface PlanSeed {
  product: "oxxy" | "cut_medi_bills";
  plan: string;
  billing: "monthly" | "yearly";
  price: number;
  auto_renews: boolean;
  renewal_terms: string;
  max_saving_pct: number | null;
  illustration_pct: number | null;
  age_limit: number | null;
  activation_time: string;
  activation_link: string;
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
        auto_renews: false, // [CONFIRM]
        renewal_terms: OXXY_RENEWAL,
        max_saving_pct: upTo,
        illustration_pct: rate,
        age_limit: age,
        activation_time: OXXY_ACTIVATION_TIME,
        activation_link: LINK(`${plan}-${billing}`),
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
      activation_link: LINK("cut-medi-bills-monthly"),
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
      activation_link: LINK("cut-medi-bills-annual"),
    },
  );
  return rows;
}

export interface CentreSeed {
  name: string;
  branch: string;
  locality: string;
  city: string;
  latitude: number;
  longitude: number;
  centre_type: string;
  specialisations: string[];
}

export const CENTRE_SEEDS: CentreSeed[] = [
  {
    name: "Sample Care Hospital",
    branch: "Anna Nagar",
    locality: "Anna Nagar",
    city: "Chennai",
    latitude: 13.085,
    longitude: 80.2101,
    centre_type: "multispeciality",
    specialisations: ["general", "cardiology"],
  },
  {
    name: "Sample Diagnostics",
    branch: "T Nagar",
    locality: "T Nagar",
    city: "Chennai",
    latitude: 13.0418,
    longitude: 80.2341,
    centre_type: "diagnostic",
    specialisations: ["pathology", "radiology"],
  },
  {
    name: "Sample Dental Clinic",
    branch: "Adyar",
    locality: "Adyar",
    city: "Chennai",
    latitude: 13.0012,
    longitude: 80.2565,
    centre_type: "clinic",
    specialisations: ["dental"],
  },
  {
    name: "Sample Multispeciality",
    branch: "Indiranagar",
    locality: "Indiranagar",
    city: "Bengaluru",
    latitude: 12.9719,
    longitude: 77.6412,
    centre_type: "multispeciality",
    specialisations: ["general", "orthopaedics"],
  },
  {
    name: "Sample Eye Centre",
    branch: "Bandra",
    locality: "Bandra West",
    city: "Mumbai",
    latitude: 19.0596,
    longitude: 72.8295,
    centre_type: "specialist",
    specialisations: ["ophthalmology"],
  },
];
