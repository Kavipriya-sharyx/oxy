// Client, 17 Nov: the voice-aligned button flow through the pipeline, from "hi" to the activation step.
import { ChatPipelineService } from "./ChatPipeline.service";
import { GuardrailService } from "./Guardrail.service";
import { ReplyValidatorService } from "./ReplyValidator.service";
import { assertTransition } from "./ConversationStateMachine";
import { DateWindowService } from "./DateWindow.service";
import { ConversationState as S } from "@Helper/Enum/ConversationState";
import { NOTICE_VERSION } from "@Helper/FixedReplies";
import { message } from "@Database/Table/Oxxy/message";
import { consent } from "@Database/Table/Oxxy/consent";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { need } from "@Database/Table/Oxxy/need";
import { task } from "@Database/Table/Oxxy/task";
import { booking_request } from "@Database/Table/Oxxy/booking_request";
import { activation } from "@Database/Table/Oxxy/activation";
import { plan_catalog } from "@Database/Table/Oxxy/plan_catalog";
import { approved_asset } from "@Database/Table/Oxxy/approved_asset";
import { asset_send } from "@Database/Table/Oxxy/asset_send";
import { centre } from "@Database/Table/Oxxy/centre";
import { trigger_event } from "@Database/Table/Oxxy/trigger_event";

type Fn = (...a: unknown[]) => unknown;
const stub = (cls: unknown, name: string, impl: Fn) =>
  jest.spyOn(cls as Record<string, Fn>, name).mockImplementation(impl);

const draft = (reply_text: string, extra: Record<string, unknown> = {}) => ({
  reply_text,
  intent: "other",
  extracted_fields: {},
  needs_human: false,
  ...extra,
});

function setup(
  drafts: unknown[],
  opts: { needRow: object; found: (q: Record<string, unknown>) => unknown[]; maps?: unknown; catalog?: Record<string, unknown>[] },
) {
  const conv = { id: "v1", state: S.New, selected_product: null as string | null, recommended_plan: null as string | null, pending_action: null as string | null };
  const out: string[] = [];
  const sent: Record<string, unknown>[] = [];
  let replied = false;
  const send = jest.fn(async (...a: unknown[]) => {
    out.push(String((a[1] as { body: string; log?: string }).log ?? (a[1] as { body: string }).body));
    sent.push(a[1] as Record<string, unknown>);
    replied = true;
    return "wamid.OUT";
  });
  const generate = jest.fn();
  for (const d of drafts) generate.mockResolvedValueOnce(d);
  const transition = jest.fn(async (_id: unknown, to: unknown) => {
    assertTransition(conv.state, to as string);
    conv.state = to as S;
    return conv;
  });
  const mg = { save: jest.fn(async (v: object) => ({ ...v, id: "new-id" })), create: (_c: unknown, v: unknown) => v, update: jest.fn() };
  stub(message, "findOne", async (o: unknown) => {
    const w = (o as { where?: { reply_to_wa_message_id?: string; type?: string } })?.where;
    if (w?.type === "location_request") return { id: "pin-asked" }; // the pin question was asked before
    return replied && w?.reply_to_wa_message_id ? { id: "out" } : null;
  });
  stub(message, "find", async () => []);
  stub(conversation, "findOne", async () => conv);
  stub(conversation, "update", async () => undefined);
  stub(consent, "findOne", async () => ({ opt_out_at: null, health_data_consent: true, notice_version: NOTICE_VERSION, consent_timestamp: new Date() }));
  stub(task, "findOne", async () => null);
  stub(task, "find", async () => []);
  stub(task, "update", async () => undefined);
  stub(booking_request, "findOne", async () => null);
  stub(activation, "findOne", async () => null);
  stub(plan_catalog, "find", async (o: unknown) => {
    const w = ((o as { where?: Record<string, unknown> })?.where ?? {}) as Record<string, unknown>;
    return (opts.catalog ?? []).filter((r) => (!w.plan || r.plan === w.plan) && (!w.product || r.product === w.product));
  });
  stub(plan_catalog, "findOne", async (o: unknown) => {
    const w = ((o as { where?: Record<string, unknown> })?.where ?? {}) as Record<string, unknown>;
    return (opts.catalog ?? []).find((r) => r.plan === w.plan && r.billing === w.billing) ?? null;
  });
  stub(approved_asset, "find", async () => []);
  stub(asset_send, "find", async () => []);
  stub(centre, "findOne", async () => null);
  stub(centre, "find", async () => [{ city: "Coimbatore" }]);
  stub(trigger_event, "findOne", async () => null);
  stub(trigger_event, "save", async (v: unknown) => v);
  stub(trigger_event, "create", (v: unknown) => v);
  jest.spyOn(need, "findOne").mockResolvedValue(opts.needRow as never);

  const pipeline = new ChatPipelineService(
    new GuardrailService(),
    { generate } as never,
    new ReplyValidatorService(),
    { send } as never,
    { recommend: async () => null, prices: async () => ({ monthly: 999, yearly: 10000 }) } as never,
    { search: async (q: Record<string, unknown>) => opts.found(q) } as never,
    { create: async (b: object) => ({ ...b, id: "bk1" }) } as never,
    new DateWindowService() as never,
    { transaction: async (fn: Fn) => fn(mg) } as never,
    { enqueue: jest.fn(async () => null), dispatch: jest.fn() } as never,
    { transition } as never,
    undefined as never,
    undefined as never,
    undefined as never,
    opts.maps as never,
  );
  const s = {
    customer: { id: "c1", language: "en", active_product: null, age: null as number | null, save: async () => undefined },
    conversation: conv,
  } as never;
  const run = (text: string) => {
    replied = false;
    return pipeline.process({ waNumber: "919800000001", waMessageId: "wamid.IN1", text }, s);
  };
  return { run, out, conv, sent, s };
}

afterEach(() => jest.restoreAllMocks());

const cat = (plan: string, monthly: number, yearly: number) => [
  { id: `${plan}-m`, product: "oxxy", plan, billing: "monthly", price: monthly, status: true, version: 1, renewal_terms: "Renews monthly until cancelled", activation_time: "5 to 10 working days", activation_link: `https://pay.oxxy.in/${plan}-m` },
  { id: `${plan}-y`, product: "oxxy", plan, billing: "yearly", price: yearly, status: true, version: 1, renewal_terms: "Valid for one year", activation_time: "5 to 10 working days", activation_link: `https://pay.oxxy.in/${plan}-y` },
];

describe("17 Nov: welcome card, then the voice-call questions with buttons, then one plan with GST", () => {
  it("hi -> welcome card -> who -> service -> age -> city -> spend -> plan -> family -> activate", async () => {
    const needRow: Record<string, unknown> = { save: async () => undefined };
    const t = setup([], { needRow, found: () => [], catalog: [...cat("infinity", 3999, 40000), ...cat("everyday", 999, 10000)] });
    await t.run("hi");
    expect(t.sent[0]).toMatchObject({ kind: "buttons" });
    expect(t.out[0]).toContain("Welcome to Oxxy HealthCare!");
    expect(t.conv.pending_action).toBe("flow:start");

    await t.run("flow_start");
    expect(t.sent.at(-1)).toMatchObject({ kind: "list", buttonLabel: "Family Member" });
    await t.run("who_parents");
    expect(needRow.beneficiary).toBe("parents");
    expect(t.out.at(-1)).toContain("Are you planning a consultation, test, medicine, treatment or surgery now");

    await t.run("need_consult");
    expect(t.out.at(-2)).toContain("Verify Our Healthcare Services");
    // no condition and no insurance question (client, 17 Nov): service -> age -> city -> spend
    expect(t.out.at(-1)).toContain("May I know the patient's age?");
    expect(t.out.join(" ")).not.toContain("ongoing or pre-existing condition");
    await t.run("age_65");
    expect(t.out.at(-1)).toContain("Which city and locality");
    await t.run("Peelamedu, Coimbatore");
    expect(needRow).toMatchObject({ city: "Coimbatore", locality: "Peelamedu" });
    expect(t.out.at(-1)).toContain("How much will your annual medical expense be next year?");
    expect(t.out.join(" ")).not.toContain("health insurance");
    await t.run("spend_50000");
    expect(t.out.at(-2)).toContain("Oxxy can help you save up to ₹15,000");
    const plan = t.out.at(-1)!;
    expect(plan).toContain("Since this is for your parents");
    expect(plan).toContain("Oxxy Infinity plan fits best");
    expect(plan).toContain("Yearly: ₹40,000 + GST ₹7,200 = ₹47,200");
    expect(plan).toContain("Monthly: ₹3,999 + GST ₹720 = ₹4,719");
    expect(t.conv.recommended_plan).toBe("infinity");

    await t.run("flow_family");
    await t.run("fam_1");
    expect(t.out.at(-1)).toContain("Each additional member: ₹40,000 − 30% (₹12,000) = ₹28,000 + GST ₹5,040 = ₹33,040");
    expect(t.out.at(-1)).toContain("Total for 2 members: ₹80,240");
    expect(t.conv.pending_action).toBe("flow:close:1");

    await t.run("act_yearly");
    expect(t.out.join(" ")).toContain("Our team will add the 1 family member with the 30% discount");
    expect(t.conv.pending_action).toBe("send_activation_link:infinity-y");
    expect(t.out.at(-1)).toContain("terms and conditions");
  });

  it("a typed question in the middle goes to the normal conversation; the next tap still works", async () => {
    const needRow: Record<string, unknown> = { save: async () => undefined };
    const t = setup([{ reply_text: "Oxxy is a healthcare savings and support service.", intent: "other", extracted_fields: {}, needs_human: false }], { needRow, found: () => [], catalog: cat("everyday", 999, 10000) });
    (t.conv as Record<string, unknown>).state = "DISCOVERY";
    (t.conv as Record<string, unknown>).pending_action = "flow:insurance";
    await t.run("what exactly is oxxy?");
    expect(t.conv.pending_action).toBe("flow:insurance");
    await t.run("ins_yes");
    expect(needRow.insurance_status).toBe("has_insurance");
    expect(t.out.at(-1)).toContain("How much will your annual medical expense be next year?");
  });

  it("Main Menu brings the welcome card back", async () => {
    const t = setup([], { needRow: { save: async () => undefined }, found: () => [] });
    (t.conv as Record<string, unknown>).state = "DISCOVERY";
    await t.run("Main Menu");
    expect(t.out.at(-1)).toContain("Welcome to Oxxy HealthCare!");
    expect(t.conv.pending_action).toBe("flow:start");
  });
});
