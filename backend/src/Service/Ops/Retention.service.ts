// Data retention (Playbook 16.3, DPDP): personal and health data are removed when the customer's retention
// date has passed, or after RETENTION_DAYS without a message [CONFIRM the period with legal]. Never while
// a case is still open (booking, unpaid link, open task, active product). The WhatsApp number and the
// opt-out stay so a STOP is always honoured. The same erase serves a handled deletion request.
import { Injectable, Logger } from "@nestjs/common";
import { DataSource, In, IsNull, Not } from "typeorm";
import { customer } from "@Database/Table/Oxxy/customer";
import { consent } from "@Database/Table/Oxxy/consent";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { message } from "@Database/Table/Oxxy/message";
import { need } from "@Database/Table/Oxxy/need";
import { task } from "@Database/Table/Oxxy/task";
import { booking_request } from "@Database/Table/Oxxy/booking_request";
import { activation } from "@Database/Table/Oxxy/activation";
import { eligibility } from "@Database/Table/Oxxy/eligibility";
import { follow_up } from "@Database/Table/Oxxy/follow_up";
import { BookingStatus } from "@Helper/Enum/BookingStatus";
import { ActivationStatus } from "@Helper/Enum/ActivationStatus";
import { TaskStatus } from "@Helper/Enum/TaskStatus";
import { TaskType } from "@Helper/Enum/TaskType";
import { JobOutcome, runJob } from "./JobRuns";

export const REMOVED = "[removed: data retention]";

/** The retention period in days, or null when it is not set yet ([CONFIRM]: the job then does nothing) */
export function retentionDays(): number | null {
  const n = Number(process.env.RETENTION_DAYS);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Due for removal: the stored retention date has passed, or no message for `days` days */
export function isDue(
  r: { last: Date | string | null; until: string | null },
  days: number,
  now: Date = new Date(),
): boolean {
  const today = now.toISOString().slice(0, 10);
  if (r.until && String(r.until).slice(0, 10) < today) return true;
  if (!r.last) return false;
  return now.getTime() - new Date(r.last).getTime() > days * 86400000;
}

export type EraseResult = { erased: true } | { erased: false; reason: string };

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(private readonly _DataSource: DataSource) {}

  /** Why this customer's data must stay for now, or null */
  async openCase(customerId: string): Promise<string | null> {
    const c = await customer.findOne({ where: { id: customerId } });
    if (!c) return "customer_not_found";
    if (c.active_product) return "active_product";
    if (
      await booking_request.findOne({
        where: { customer_id: customerId, booking_status: In([BookingStatus.PendingConfirmation, BookingStatus.Confirmed]) },
      })
    )
      return "open_booking";
    if (
      await activation.findOne({
        where: { customer_id: customerId, activation_status: In([ActivationStatus.Pending, ActivationStatus.LinkSent]) },
      })
    )
      return "open_activation";
    // the deletion request itself is the one task that may be open
    if (
      await task.findOne({
        where: {
          customer_id: customerId,
          task_status: In([TaskStatus.Open, TaskStatus.InProgress]),
          type: Not(TaskType.PrivacyRequest),
        },
      })
    )
      return "open_task";
    return null;
  }

  /** Removes names, health answers, message texts and notes; keeps ids, statuses, number and opt-out */
  async erase(customerId: string): Promise<EraseResult> {
    const blocked = await this.openCase(customerId);
    if (blocked) return { erased: false, reason: blocked };
    await this._DataSource.transaction(async (mg) => {
      const convs = await mg.find(conversation, { where: { customer_id: customerId }, select: ["id"] as any });
      const ids = convs.map((v) => v.id);
      if (ids.length) {
        await mg.update(message, { conversation_id: In(ids), body: Not(IsNull()) }, { body: REMOVED });
        await mg.update(
          need,
          { conversation_id: In(ids) },
          {
            beneficiary: null,
            healthcare_need: null,
            specialisation: null,
            insurance_status: null,
            condition_if_voluntary: null,
            expected_bill: null,
            annual_medical_spend: null,
            pre_existing: null,
            service_date: null,
            postcode: null,
            locality: null,
          } as any,
        );
        await mg.update(
          conversation,
          { id: In(ids) },
          { handback_note: null, objection: null, last_question: null, escalation_reason: null } as any,
        );
        await mg.update(eligibility, { conversation_id: In(ids) }, { centre_name: null } as any);
      }
      await mg.update(booking_request, { customer_id: customerId }, { specialisation: null } as any);
      await mg.update(task, { customer_id: customerId }, { summary: REMOVED } as any);
      await mg.update(follow_up, { customer_id: customerId, follow_up_status: "scheduled" }, {
        follow_up_status: "cancelled",
        skip_reason: "data_erased",
      } as any);
      await mg.update(customer, { id: customerId }, { first_name: null, age: null, lead_id: null } as any);
      await mg.update(
        consent,
        { customer_id: customerId },
        { health_data_consent: false, marketing_consent: false, erased_at: new Date() } as any,
      );
    });
    return { erased: true };
  }

  async sweep(now: Date = new Date()): Promise<JobOutcome> {
    const days = retentionDays();
    if (!days) return { status: "skipped", summary: { reason: "RETENTION_DAYS is not set [CONFIRM the period]" } };
    const rows: { id: string; last: Date | null; until: string | null }[] = await customer
      .createQueryBuilder("c")
      .innerJoin(consent, "k", "k.customer_id = c.id")
      .leftJoin(conversation, "v", "v.customer_id = c.id")
      .select("c.id", "id")
      .addSelect("MAX(v.last_customer_message_at)", "last")
      .addSelect("k.retention_until", "until")
      .where("k.erased_at IS NULL")
      .groupBy("c.id")
      .addGroupBy("k.retention_until")
      .getRawMany();
    let erased = 0;
    const kept: Record<string, number> = {};
    for (const r of rows.filter((x) => isDue(x, days, now))) {
      try {
        const res = await this.erase(r.id);
        if (res.erased === true) erased++;
        else kept[res.reason] = (kept[res.reason] ?? 0) + 1;
      } catch (e) {
        kept.error = (kept.error ?? 0) + 1;
        this.logger.warn(`retention: customer ${r.id} not erased: ${(e as Error).message}`);
      }
    }
    return { status: "ok", summary: { days, checked: rows.length, due: erased + Object.values(kept).reduce((a, b) => a + b, 0), erased, kept } };
  }

  run(triggeredBy: string | null = null) {
    return runJob("data_retention", triggeredBy, () => this.sweep());
  }
}
