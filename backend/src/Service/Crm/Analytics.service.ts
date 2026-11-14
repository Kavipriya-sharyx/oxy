// Trigger & Conversion Layer 13 / 13.1: key performance measures, and conversion attribution when a
// payment is verified. Raw SQL on purpose: these are counts across several tables.
import { Injectable, Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import { activation } from "@Database/Table/Oxxy/activation";
import { trigger_event } from "@Database/Table/Oxxy/trigger_event";

export const TRIGGER_IDS = "ABCDEFGHIJKLMNOPQR".split("");

const rate = (num: number, den: number) => (den ? Math.round((num / den) * 1000) / 10 : null); // percent, 1 decimal

/** YYYY-MM-DD, default: the last 30 days (IST dates) */
export function range(from?: string, to?: string, now = new Date()) {
  const ok = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const ist = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  const end = ok(to) ? to! : ist(now);
  const start = ok(from) ? from! : ist(new Date(now.getTime() - 29 * 86_400_000));
  return { from: start, to: end };
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly _DataSource: DataSource) {}

  private async q<T = any>(sql: string, params: unknown[]): Promise<T[]> {
    return await this._DataSource.query(sql, params);
  }

  async kpis(fromIn?: string, toIn?: string) {
    const { from, to } = range(fromIn, toIn);
    // created_on is stored without a time zone (server time): the range is applied to it as dates
    const inRange = (col: string) => `${col} >= $1::date AND ${col} < ($2::date + 1)`;
    const p = [from, to];

    // 1. Trigger-to-response rate by A-R (suppressed rows are not counted as fired)
    const byTrigger = await this.q(
      `SELECT trigger_id,
              count(*) FILTER (WHERE suppression_reason IS NULL)::int AS fired,
              count(*) FILTER (WHERE suppression_reason IS NULL AND response IN ('replied','clicked'))::int AS responded,
              count(*) FILTER (WHERE response = 'clicked')::int AS clicked,
              count(*) FILTER (WHERE response = 'declined')::int AS declined,
              count(*) FILTER (WHERE response = 'opted_out')::int AS opted_out,
              count(*) FILTER (WHERE response = 'escalated')::int AS escalated,
              count(*) FILTER (WHERE suppression_reason IS NULL AND response IS NULL
                               AND created_on < now() - interval '24 hours')::int AS ignored,
              count(*) FILTER (WHERE suppression_reason IS NOT NULL)::int AS suppressed
         FROM trigger_event WHERE ${inRange("created_on")}
        GROUP BY trigger_id`,
      p,
    );
    const map = new Map(byTrigger.map((r: any) => [r.trigger_id, r]));
    const triggerRows = TRIGGER_IDS.map((id) => {
      const r: any = map.get(id) ?? { fired: 0, responded: 0, clicked: 0, declined: 0, opted_out: 0, escalated: 0, ignored: 0, suppressed: 0 };
      return {
        trigger_id: id,
        fired: r.fired,
        responded: r.responded,
        response_rate: rate(r.responded, r.fired),
        clicked: r.clicked,
        declined: r.declined,
        ignored: r.ignored,
        opted_out: r.opted_out,
        opt_out_rate: rate(r.opted_out, r.fired),
        escalated: r.escalated,
        complaint_rate: rate(r.escalated, r.fired),
        suppressed: r.suppressed,
      };
    });

    // 2. Trust pack (A) to continued conversation: a customer message after A
    const [trust] = await this.q(
      `SELECT count(*)::int AS sent,
              count(*) FILTER (WHERE EXISTS (SELECT 1 FROM message m WHERE m.conversation_id = t.conversation_id
                    AND m.direction = 'in' AND m.created_on > t.created_on))::int AS continued
         FROM trigger_event t WHERE t.trigger_id = 'A' AND t.suppression_reason IS NULL AND ${inRange("t.created_on")}`,
      p,
    );

    // 3. Centre list (D) to booking request
    const [centreToBooking] = await this.q(
      `SELECT count(DISTINCT t.conversation_id)::int AS lists,
              count(DISTINCT t.conversation_id) FILTER (WHERE EXISTS (SELECT 1 FROM booking_request b
                    WHERE b.conversation_id = t.conversation_id AND b.created_on >= t.created_on))::int AS booked
         FROM trigger_event t WHERE t.trigger_id = 'D' AND ${inRange("t.created_on")}`,
      p,
    );

    // 4. Plan recommendation (E) to acceptance (the customer asked for the link)
    const [planAccept] = await this.q(
      `SELECT count(DISTINCT t.conversation_id)::int AS recommended,
              count(DISTINCT t.conversation_id) FILTER (WHERE EXISTS (SELECT 1 FROM activation a
                    WHERE a.customer_id = t.customer_id AND a.created_on >= t.created_on))::int AS accepted
         FROM trigger_event t WHERE t.trigger_id = 'E' AND t.suppression_reason IS NULL AND ${inRange("t.created_on")}`,
      p,
    );

    // 5. Activation link to completed payment
    const [linkPay] = await this.q(
      `SELECT count(*)::int AS links,
              count(*) FILTER (WHERE payment_status = 'paid')::int AS paid,
              count(*) FILTER (WHERE payment_status = 'failed')::int AS failed
         FROM activation WHERE ${inRange("created_on")}`,
      p,
    );

    // 6. Booking without activation, later activated
    const [bookingLater] = await this.q(
      `SELECT count(*)::int AS bookings_without_activation,
              count(*) FILTER (WHERE EXISTS (SELECT 1 FROM activation a WHERE a.customer_id = b.customer_id
                    AND a.payment_status = 'paid' AND a.created_on > b.created_on))::int AS later_activated
         FROM booking_request b
        WHERE ${inRange("b.created_on")}
          AND NOT EXISTS (SELECT 1 FROM activation a WHERE a.customer_id = b.customer_id AND a.created_on <= b.created_on)`,
      p,
    );

    // 7. Opt-out and complaint rates by trigger sequence (the path of triggers before the opt-out / complaint)
    const sequences = await this.q(
      `SELECT path, outcome, count(*)::int AS n FROM (
         SELECT t.conversation_id,
                string_agg(t.trigger_id, '>' ORDER BY t.created_on) AS path,
                CASE WHEN bool_or(t.response = 'opted_out') THEN 'opted_out'
                     WHEN bool_or(t.response = 'escalated') THEN 'complaint' END AS outcome
           FROM trigger_event t WHERE ${inRange("t.created_on")} AND t.trigger_id <> 'R'
          GROUP BY t.conversation_id) s
        WHERE outcome IS NOT NULL
        GROUP BY path, outcome ORDER BY n DESC LIMIT 20`,
      p,
    );
    const [journeys] = await this.q(
      `SELECT count(DISTINCT conversation_id)::int AS n FROM trigger_event WHERE ${inRange("created_on")}`,
      p,
    );

    // 8. Human callback resolution and activation
    const [callbacks] = await this.q(
      `SELECT count(*)::int AS callbacks,
              count(*) FILTER (WHERE task_status = 'done')::int AS resolved,
              count(*) FILTER (WHERE EXISTS (SELECT 1 FROM activation a WHERE a.customer_id = k.customer_id
                    AND a.payment_status = 'paid' AND a.created_on > k.created_on))::int AS activated
         FROM task k
        WHERE k.type IN ('escalation','human_handoff','payment_issue','holding_message') AND ${inRange("k.created_on")}`,
      p,
    );

    // 9. Duplicate-message and frequency-cap violations: target zero
    const [violations] = await this.q(
      `SELECT
         (SELECT count(*)::int FROM trigger_event WHERE suppression_reason = 'duplicate' AND ${inRange("created_on")}) AS duplicate_triggers_blocked,
         ((SELECT count(*)::int FROM trigger_event WHERE suppression_reason = 'frequency_cap' AND ${inRange("created_on")})
          + (SELECT count(*)::int FROM message WHERE message_status = 'frequency_cap' AND ${inRange("created_on")})) AS frequency_cap_blocked,
         (SELECT count(*)::int FROM (SELECT reply_to_wa_message_id FROM message
             WHERE direction = 'out' AND reply_to_wa_message_id IS NOT NULL AND ${inRange("created_on")}
             GROUP BY reply_to_wa_message_id HAVING count(*) > 1) d) AS duplicate_replies,
         (SELECT count(*)::int FROM (SELECT conversation_id, trigger_id FROM trigger_event
             WHERE suppression_reason IS NULL AND ${inRange("created_on")}
             GROUP BY conversation_id, trigger_id HAVING count(*) > 1) x) AS duplicate_triggers_sent,
         (SELECT count(*)::int FROM follow_up WHERE follow_up_status = 'sent' AND kind = 'rescue'
             AND ${inRange("updated_on")}
             AND customer_id IN (SELECT customer_id FROM follow_up WHERE kind = 'rescue' AND follow_up_status = 'sent'
                                  GROUP BY customer_id HAVING count(*) > 2)) AS rescue_over_cap`,
      p,
    );
    const v = violations as any;

    return {
      range: { from, to },
      trigger_to_response: triggerRows,
      trust_pack_to_continued: { ...trust, rate: rate(trust.continued, trust.sent) },
      centre_list_to_booking: { ...centreToBooking, rate: rate(centreToBooking.booked, centreToBooking.lists) },
      plan_to_acceptance: { ...planAccept, rate: rate(planAccept.accepted, planAccept.recommended) },
      link_to_payment: { ...linkPay, rate: rate(linkPay.paid, linkPay.links) },
      booking_to_later_activation: {
        ...bookingLater,
        rate: rate(bookingLater.later_activated, bookingLater.bookings_without_activation),
      },
      opt_out_and_complaint_by_sequence: {
        journeys: journeys.n,
        sequences,
      },
      callback_resolution: {
        ...callbacks,
        resolution_rate: rate(callbacks.resolved, callbacks.callbacks),
        activation_rate: rate(callbacks.activated, callbacks.callbacks),
      },
      violations: {
        ...v,
        total: v.duplicate_replies + v.duplicate_triggers_sent + v.rescue_over_cap,
        target: 0,
      },
    };
  }

  /**
   * Conversion attribution (Trigger layer 13): the full trigger path before the payment, the last useful
   * trigger marked "last_touch", the others "assisted". P, Q and R are outcomes, not persuasion.
   */
  async attributeConversion(activationId: string): Promise<string | null> {
    try {
      const a = await activation.findOne({ where: { id: activationId } });
      if (!a) return null;
      const rows = await trigger_event
        .createQueryBuilder("t")
        .where("t.customer_id = :c", { c: a.customer_id })
        .andWhere("t.suppression_reason IS NULL")
        .andWhere("t.trigger_id NOT IN ('P','Q','R')")
        .andWhere(`t.created_on <= (SELECT x.updated_on FROM "activation" x WHERE x.id = :id)`, { id: a.id })
        .orderBy("t.created_on", "ASC")
        .getMany();
      const path = rows.map((r) => r.trigger_id).join(">") || null;
      for (const [i, r] of rows.entries()) {
        await trigger_event.update(r.id, { conversion_attribution: i === rows.length - 1 ? "last_touch" : "assisted" });
      }
      await activation.update(a.id, { trigger_path: path });
      return path;
    } catch (e) {
      this.logger.warn(`conversion attribution failed for ${activationId}: ${(e as Error).message}`);
      return null;
    }
  }
}
