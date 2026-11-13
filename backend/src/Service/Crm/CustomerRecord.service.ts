// The Playbook 17 customer record, grouped the way the CRM expects it: identity, consent, need, location,
// provider, eligibility, routing, booking, activation, engagement, content and trigger events.
// Read-only: every value comes from the bot's own tables.
import { Injectable, NotFoundException } from "@nestjs/common";
import { In } from "typeorm";
import { customer } from "@Database/Table/Oxxy/customer";
import { consent } from "@Database/Table/Oxxy/consent";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { need } from "@Database/Table/Oxxy/need";
import { centre } from "@Database/Table/Oxxy/centre";
import { eligibility } from "@Database/Table/Oxxy/eligibility";
import { booking_request } from "@Database/Table/Oxxy/booking_request";
import { activation } from "@Database/Table/Oxxy/activation";
import { task } from "@Database/Table/Oxxy/task";
import { trigger_event } from "@Database/Table/Oxxy/trigger_event";
import { asset_send } from "@Database/Table/Oxxy/asset_send";
import { follow_up } from "@Database/Table/Oxxy/follow_up";
import { plan_catalog } from "@Database/Table/Oxxy/plan_catalog";

export const FIELD_GROUPS = [
  "identity",
  "consent",
  "need",
  "location",
  "provider",
  "eligibility",
  "routing",
  "booking",
  "activation",
  "engagement",
  "content",
  "trigger_events",
] as const;

@Injectable()
export class CustomerRecordService {
  /** @param includeHealth false = the need group's health details are left out (e.g. for the CRM) */
  async build(customerId: string, opts: { includeHealth?: boolean } = {}) {
    const c = await customer.findOne({ where: { id: customerId } });
    if (!c) throw new NotFoundException("Customer not found");
    const includeHealth = opts.includeHealth !== false;
    const cons = await consent.findOne({ where: { customer_id: c.id } });
    const conv = await conversation.findOne({
      where: { customer_id: c.id },
      order: { created_on: "DESC" } as any,
    });
    const n = conv ? await need.findOne({ where: { conversation_id: conv.id } }) : null;
    const elig = conv
      ? await eligibility.findOne({ where: { conversation_id: conv.id }, order: { created_on: "DESC" } as any })
      : null;
    const centreIds = [n?.preferred_centre_id, ...(n?.suggested_centre_ids ?? [])].filter(Boolean) as string[];
    const centres = centreIds.length ? await centre.find({ where: { id: In(centreIds) } }) : [];
    const byId = new Map(centres.map((x) => [x.id, x]));
    const preferred = n?.preferred_centre_id ? byId.get(n.preferred_centre_id) : null;
    const bookings = await booking_request
      .createQueryBuilder("b")
      .addSelect("b.created_on") // hidden by default (BaseTable)
      .leftJoinAndSelect("b.centre", "centre")
      .where("b.customer_id = :c", { c: c.id })
      .orderBy("b.created_on", "DESC")
      .getMany();
    const acts = await activation.find({ where: { customer_id: c.id }, order: { created_on: "DESC" } as any });
    const cats = acts.length
      ? await plan_catalog.find({ where: { id: In(acts.map((a) => a.catalog_id).filter(Boolean)) } })
      : [];
    const catById = new Map(cats.map((x) => [x.id, x]));
    const lastEscalation = await task.findOne({
      where: { customer_id: c.id, type: In(["escalation", "human_handoff", "payment_issue", "emergency", "self_harm"]) },
      order: { created_on: "DESC" } as any,
    });
    const nextFollowUp = await follow_up.findOne({
      where: { customer_id: c.id, follow_up_status: "scheduled" },
      order: { scheduled_for: "ASC" } as any,
    });
    const sends = await asset_send.find({ where: { customer_id: c.id }, relations: { asset: true }, order: { created_on: "ASC" } as any });
    const triggers = await trigger_event
      .createQueryBuilder("t")
      .addSelect("t.created_on")
      .where("t.customer_id = :c", { c: c.id })
      .orderBy("t.created_on", "ASC")
      .getMany();
    const paidAct = acts.find((a) => a.payment_status === "paid");
    const ofKind = (...k: string[]) => sends.filter((x) => k.includes(x.kind)).map((x) => x.asset?.code ?? x.asset_id);
    const health = <T>(v: T) => (includeHealth ? v : undefined);

    return {
      identity: {
        lead_id: c.lead_id ?? null,
        customer_id: c.id,
        crm_customer_id: c.crm_customer_id ?? null,
        first_name: c.first_name ?? null,
        whatsapp_number: c.wa_number,
        language: c.language,
        timezone: c.timezone ?? "Asia/Kolkata",
      },
      consent: {
        source: cons?.consent_source ?? null,
        consent_timestamp: cons?.consent_timestamp ?? null,
        whatsapp_consent: !!cons?.whatsapp_consent,
        marketing_consent: !!cons?.marketing_consent,
        opt_out_timestamp: cons?.opt_out_at ?? null,
        privacy_request: cons?.privacy_request_at ?? null,
        health_data_consent: !!cons?.health_data_consent,
        consent_notice_version: cons?.notice_version ?? null,
        retention_until: cons?.retention_until ?? null,
      },
      need: {
        beneficiary: n?.beneficiary ?? null,
        age: c.age ?? null,
        healthcare_need: health(n?.healthcare_need ?? null),
        specialisation: n?.specialisation ?? null,
        condition_if_voluntary: health(n?.condition_if_voluntary ?? null),
        urgency: n?.urgency ?? null,
        service_date: n?.service_date ?? null,
        expected_bill: health(n?.expected_bill ?? null),
        annual_medical_spend: health(n?.annual_medical_spend ?? null),
        need_pattern: n?.need_pattern ?? null,
      },
      location: {
        city: n?.city ?? null,
        locality: n?.locality ?? null,
        postcode_if_available: n?.postcode ?? null,
        travel_radius_km: n?.travel_radius_km ?? null,
      },
      provider: {
        preferred_centre: preferred?.name ?? elig?.centre_name ?? null,
        branch: preferred?.branch ?? null,
        private_status_verified: preferred ? !!preferred.is_private && !!preferred.verified : null,
        verification_source: preferred?.verification_source ?? null,
        suggested_centres: (n?.suggested_centre_ids ?? []).map((id) => {
          const x = byId.get(id);
          return x ? { centre_id: id, name: x.name, branch: x.branch ?? null } : { centre_id: id };
        }),
      },
      eligibility: {
        centre: elig?.centre_name ?? null,
        appointment_status: elig?.booking_state ?? null,
        registration_status: elig?.registration_state ?? null,
        treatment_status: elig?.treatment_state ?? null,
        bill_status: elig?.bill_state ?? null,
        insurance_status: health(n?.insurance_status ?? null),
        pre_existing: health(n?.pre_existing ?? null),
      },
      routing: {
        selected_product: conv?.selected_product ?? null,
        recommended_plan: conv?.recommended_plan ?? null,
        recommendation_reason: conv?.recommendation_reason ?? null,
        alternate_product_suppressed: !!conv?.alternate_product_suppressed,
        value_check_passed: conv?.value_check_passed ?? null,
      },
      booking: bookings.map((b) => ({
        booking_request_id: b.id,
        centre: b.centre?.name ?? null,
        branch: b.centre?.branch ?? null,
        specialisation: b.specialisation ?? null,
        preferred_date: b.preferred_date,
        preferred_time: b.preferred_time ?? null,
        status: b.booking_status,
        created_at: b.created_on,
      })),
      activation: acts.map((a) => {
        const cat = catById.get(a.catalog_id);
        return {
          activation_id: a.id,
          product: a.product,
          plan: a.plan ?? null,
          billing: a.billing,
          price: a.price != null ? Number(a.price) : cat ? Number(cat.price) : null,
          gst: a.gst_rate != null ? Number(a.gst_rate) : cat ? Number(cat.gst_rate) : null,
          renewal_terms_shown: !!a.renewal_terms_shown,
          activation_link_sent_at: a.link_sent_at ?? null,
          payment_status: a.payment_status,
          activation_status: a.activation_status,
          trigger_path: a.trigger_path ?? null,
        };
      }),
      engagement: {
        last_state: conv?.state ?? null,
        last_intent: conv?.last_intent ?? null,
        rescue_attempts: conv?.rescue_count ?? 0,
        objection: conv?.objection ?? null,
        follow_up_at: nextFollowUp?.scheduled_for ?? null, // only a follow-up that is still scheduled
        escalation_reason: conv?.escalation_reason ?? lastEscalation?.reason ?? null,
        outcome: paidAct ? "activated" : (conv?.outcome ?? null),
      },
      content: {
        documents_sent: ofKind("document", "policy"),
        links_sent: [...ofKind("website", "article"), ...acts.map((a) => `activation:${a.product}${a.plan ? `:${a.plan}` : ""}`)],
        comparison_sent: ofKind("comparison"),
        testimonial_or_media_sent: ofKind("testimonial", "media"),
      },
      trigger_events: triggers.map((t) => ({
        trigger_id: t.trigger_id,
        trigger_reason: t.reason ?? null,
        conversation_source: t.conversation_source ?? null,
        asset_ids: (t.assets as string[] | null) ?? [],
        cta: t.cta ?? null,
        customer_response: t.response ?? null,
        next_state: t.next_state ?? null,
        conversion_attribution: t.conversion_attribution ?? null,
        suppression_reason: t.suppression_reason ?? null,
        created_at: t.created_on,
      })),
    };
  }
}
