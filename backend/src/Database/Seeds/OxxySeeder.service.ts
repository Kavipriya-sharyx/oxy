import { Injectable } from "@nestjs/common";
import { user_role } from "../Table/Admin/user_role";
import { plan_catalog } from "../Table/Oxxy/plan_catalog";
import { centre } from "../Table/Oxxy/centre";
import { approved_asset } from "../Table/Oxxy/approved_asset";
import { CENTRE_SEEDS, GST_RATE, planSeeds } from "./OxxyData";

@Injectable()
export class OxxySeederService {
  async Run() {
    for (const f of [this.Roles, this.Plans, this.Centres, this.Assets]) {
      try {
        await f();
      } catch (e) {
        console.log(e);
      }
    }
  }

  // The console roles are Super Admin / Admin / User (CommonSeeder). Older versions also made
  // lowercase "agent" / "supervisor" / "admin" roles: remove them when no user holds them.
  Roles = async () => {
    for (const name of ["agent", "supervisor", "admin"]) {
      const r = await user_role.findOne({ where: { name } });
      if (!r) continue;
      const used = await user_role.query(`SELECT 1 FROM "user" WHERE user_role_id = $1 LIMIT 1`, [r.id]);
      if (!used.length) await user_role.delete(r.id);
    }
  };

  // Adds any missing catalog row. Also repairs rows written by the old seeder, which stored the
  // MONTHLY price as the yearly price (Everyday yearly 999 instead of 10,000) and used "annual".
  // A price that was changed on purpose (any other value) is never touched.
  Plans = async () => {
    for (const r of planSeeds()) {
      const billings = r.billing === "yearly" ? ["yearly", "annual"] : [r.billing];
      let row: plan_catalog | null = null;
      for (const b of billings) {
        row = await plan_catalog.findOne({
          where: { product: r.product, plan: r.plan, billing: b },
        });
        if (row) break;
      }
      if (!row && r.product === "cut_medi_bills") {
        row = await plan_catalog.findOne({ where: { product: r.product, billing: r.billing } });
      }
      if (!row) {
        await plan_catalog.save(
          plan_catalog.create({ ...r, gst_rate: GST_RATE, version: 1 } as any),
        );
        continue;
      }
      const monthly = planSeeds().find(
        (x) => x.product === r.product && x.plan === r.plan && x.billing === "monthly",
      );
      const oldBug =
        r.billing === "yearly" &&
        r.product === "oxxy" &&
        monthly &&
        Number(row.price) === monthly.price;
      let changed = false;
      if (oldBug) {
        row.price = r.price;
        changed = true;
      }
      if (row.billing === "annual") {
        row.billing = "yearly";
        changed = true;
      }
      if (row.illustration_pct == null) {
        row.illustration_pct = r.illustration_pct;
        row.max_saving_pct = r.max_saving_pct;
        changed = true;
      }
      if (row.activation_time === "Within 24 hours") {
        row.activation_time = r.activation_time;
        changed = true;
      }
      if (changed) await row.save();
    }
  };

  Centres = async () => {
    if ((await centre.count()) > 0) return;
    for (const r of CENTRE_SEEDS) {
      await centre.save(
        centre.create({ ...r, is_private: true, verified: true, active: true } as any),
      );
    }
  };

  // Example assets for development only, NOT approved: an admin approves each one in the console after
  // checking it (Playbook 18.1). Production starts with none.
  Assets = async () => {
    if (process.env.NODE_ENV === "production" || (await approved_asset.count()) > 0) return;
    const rows = [
      { code: "trust_pack_en", kind: "website", trigger_id: "A", title: "About Oxxy Health [CONFIRM]", url: "https://example.com/oxxy/about" },
      { code: "insurance_vs_oxxy_en", kind: "comparison", trigger_id: "B", title: "Health insurance and Oxxy [CONFIRM]", url: "https://example.com/oxxy/insurance-vs-oxxy" },
      { code: "why_activate_en", kind: "document", trigger_id: "C", title: "Why activate Oxxy [CONFIRM]", url: "https://example.com/oxxy/why-activate" },
      { code: "testimonials_en", kind: "testimonial", trigger_id: "L", title: "What members say [CONFIRM]", url: "https://example.com/oxxy/stories" },
      { code: "privacy_policy_en", kind: "policy", trigger_id: null, title: "Privacy policy [CONFIRM]", url: "https://example.com/oxxy/privacy" },
    ];
    for (const r of rows) await approved_asset.save(approved_asset.create({ ...r, language: "en", approved: false } as any));
  };
}
