import { Injectable } from "@nestjs/common";
import { user_role } from "../Table/Admin/user_role";
import { plan_catalog } from "../Table/Oxxy/plan_catalog";
import { centre } from "../Table/Oxxy/centre";

const GST_NOTE = "GST 18% [CONFIRM]";

@Injectable()
export class OxxySeederService {
  async Run() {
    for (const f of [this.Roles, this.Plans, this.Centres]) {
      try {
        await f();
      } catch (e) {
        console.log(e);
      }
    }
  }

  Roles = async () => {
    for (const name of ["agent", "supervisor", "admin"]) {
      if (await user_role.findOne({ where: { name } })) continue;
      await user_role.save(user_role.create({ name, code: name } as any));
    }
  };

  Plans = async () => {
    if ((await plan_catalog.count()) > 0) return;
    const link = (plan: string, billing: string) =>
      `https://oxxy.example/activate/${plan}/${billing}`; // [CONFIRM] real links
    const rows: any[] = [
      // Oxxy yearly plans (benefit amount in renewal_terms)
      {
        product: "oxxy",
        plan: "everyday",
        billing: "yearly",
        price: 999,
        max_saving_pct: 20,
        age_limit: 70,
        benefit: 10000,
      },
      {
        product: "oxxy",
        plan: "vital",
        billing: "yearly",
        price: 1999,
        max_saving_pct: 25,
        age_limit: 75,
        benefit: 20000,
      },
      {
        product: "oxxy",
        plan: "thrive",
        billing: "yearly",
        price: 2999,
        max_saving_pct: 30,
        age_limit: 80,
        benefit: 30000,
      },
      {
        product: "oxxy",
        plan: "infinity",
        billing: "yearly",
        price: 3999,
        max_saving_pct: 30,
        age_limit: null,
        benefit: 40000,
      },
    ].map((r) => ({
      ...r,
      auto_renews: false,
      renewal_terms: `Plan amount ${r.benefit}. ${GST_NOTE}`,
    }));
    rows.push(
      {
        product: "cut_medi_bills",
        plan: "cut_medi_bills",
        billing: "monthly",
        price: 4999,
        max_saving_pct: null,
        age_limit: null,
        auto_renews: true,
        renewal_terms: GST_NOTE,
      },
      {
        product: "cut_medi_bills",
        plan: "cut_medi_bills",
        billing: "annual",
        price: 19999,
        max_saving_pct: null,
        age_limit: null,
        auto_renews: false,
        renewal_terms: GST_NOTE,
      },
    );
    for (const r of rows) {
      delete r.benefit;
      await plan_catalog.save(
        plan_catalog.create({
          ...r,
          gst_rate: 0.18,
          activation_time: "Within 24 hours",
          activation_link: link(r.plan, r.billing),
          version: 1,
        }),
      );
    }
  };

  Centres = async () => {
    if ((await centre.count()) > 0) return;
    const rows = [
      {
        name: "Sample Care Hospital",
        branch: "Anna Nagar",
        locality: "Anna Nagar",
        city: "Chennai",
        latitude: 13.085,
        longitude: 80.2101,
        centre_type: "hospital",
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
        centre_type: "hospital",
        specialisations: ["general", "orthopaedics"],
      },
      {
        name: "Sample Eye Centre",
        branch: "Bandra",
        locality: "Bandra",
        city: "Mumbai",
        latitude: 19.0596,
        longitude: 72.8295,
        centre_type: "clinic",
        specialisations: ["ophthalmology"],
      },
    ];
    for (const r of rows) {
      await centre.save(
        centre.create({ ...r, is_private: true, verified: true, active: true } as any),
      );
    }
  };
}
