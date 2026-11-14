import { Injectable } from "@nestjs/common";
import { user_role } from "../Table/Admin/user_role";
import { plan_catalog } from "../Table/Oxxy/plan_catalog";
import { GST_RATE, planSeeds } from "./OxxyData";

@Injectable()
export class OxxySeederService {
  async Run() {
    // no sample centres, no example content: the real directory and content are entered in the console
    for (const f of [this.Roles, this.Plans]) {
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
}
