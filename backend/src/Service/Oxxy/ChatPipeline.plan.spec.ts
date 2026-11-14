// Full Development Plan 12.3 / 12.4 / 12.5: plan choice, honest answer, insurance questions,
// centre search without a city, and the activation disclosure before the link.
import { ChatPipelineService } from "./ChatPipeline.service";
import { GuardrailService } from "./Guardrail.service";
import { ReplyValidatorService } from "./ReplyValidator.service";
import { assertTransition } from "./ConversationStateMachine";
import { ConversationState as S } from "@Helper/Enum/ConversationState";
import { NOTICE_VERSION } from "@Helper/FixedReplies";
import {
  ASK_AGE,
  ASK_CITY,
  INSURANCE_ANSWER,
  INSURANCE_COORDINATION,
  INSURANCE_HAS_ANSWER,
  INSURANCE_HAS_ANSWER_T,
  LINK_DECLINED,
} from "@Helper/PlanReplies";
import { centreSavingReply } from "@Helper/FixedReplies";
import { HOLDING_MESSAGE } from "./ChatPipeline.service";
import { TriggerEngineService } from "./TriggerEngine.service";
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
import { DateWindowService } from "./DateWindow.service";

type Fn = (...a: unknown[]) => unknown;
const stub = (cls: unknown, name: string, impl: Fn) =>
  jest.spyOn(cls as Record<string, Fn>, name).mockImplementation(impl);

const everydayYearly = {
  id: "cat-everyday-y",
  product: "oxxy",
  plan: "everyday",
  billing: "yearly",
  price: 10000,
  illustration_pct: 20,
  max_saving_pct: 20,
  age_limit: 70,
  version: 1,
  renewal_terms: "Valid for one year, no automatic renewal",
  activation_time: "5 to 10 working days",
  activation_link: "https://pay.oxxy.test/activate/everyday-yearly",
};

const draft = (reply_text: string, extra: Record<string, unknown> = {}) => ({
  reply_text,
  intent: "other",
  extracted_fields: {},
  needs_human: false,
  ...extra,
});

function setup(
  drafts: unknown[],
  opts: {
    recommend?: unknown;
    state?: S;
    pending?: string | null;
    recommended?: string | null;
    age?: number | null;
    needRow?: object | null;
    product?: string | null;
    triggers?: unknown;
    sendFails?: boolean;
    catalog?: unknown[];
    assets?: unknown[];
    centres?: Record<string, unknown>[];
    scheduler?: unknown;
    language?: string;
    planRow?: unknown;
    classify?: unknown; // the LLM answer reader; absent = no LLM, the word rules decide
  } = {},
) {
  const cons = {
    opt_out_at: null,
    health_data_consent: true,
    notice_version: NOTICE_VERSION,
    consent_timestamp: new Date(),
  };
  const conv = {
    id: "v1",
    state: opts.state ?? S.Discovery,
    selected_product: opts.product ?? (opts.recommended ? "oxxy" : (null as string | null)),
    recommended_plan: opts.recommended ?? (null as string | null),
    pending_action: opts.pending ?? (null as string | null),
  };
  const out: string[] = [];
  const saved: Record<string, unknown>[] = [];
  const send = jest.fn(async (...a: unknown[]) => {
    if (opts.sendFails) throw new Error("WhatsApp down");
    out.push(String((a[1] as { body: string }).body));
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
  const mg = {
    save: jest.fn(async (v: Record<string, unknown>) => {
      saved.push(v);
      return { ...v, id: "new-id" };
    }),
    create: (_c: unknown, v: unknown) => v,
    update: jest.fn(async () => undefined),
  };
  const enqueue = jest.fn(async () => null);
  const bookings: Record<string, unknown>[] = [];
  stub(centre, "findOne", async (o: unknown) => {
    const w = ((o as { where?: Record<string, unknown> })?.where ?? {}) as Record<string, any>;
    const list = opts.centres ?? [];
    if (w.id) return list.find((c) => c.id === w.id) ?? null;
    const v = String(w.name?._value ?? w.name?.value ?? "")
      .replace(/%/g, "")
      .toLowerCase();
    return (v && list.find((c) => String(c.name).toLowerCase().includes(v))) || null;
  });
  stub(trigger_event, "findOne", async () => null);
  stub(trigger_event, "save", async (v: unknown) => v);
  stub(trigger_event, "create", (v: unknown) => v);

  // a reply to the current message exists once one was sent (afterTurn checks it); reset per run
  let replied = false;
  stub(message, "findOne", async (o: unknown) =>
    replied && (o as { where?: { reply_to_wa_message_id?: string } })?.where?.reply_to_wa_message_id
      ? { id: "out" }
      : null,
  );
  stub(conversation, "findOne", async () => conv);
  stub(message, "find", async () => []);
  stub(consent, "findOne", async () => cons);
  stub(conversation, "update", async () => undefined);
  stub(task, "findOne", async () => null);
  stub(task, "find", async () => []);
  stub(task, "update", async () => undefined);
  stub(booking_request, "findOne", async () => null);
  stub(activation, "findOne", async () => null);
  stub(plan_catalog, "find", async (o: unknown) => {
    const where = ((o as { where?: Record<string, unknown> })?.where ?? {}) as Record<
      string,
      unknown
    >;
    return ((opts.catalog ?? []) as Record<string, unknown>[]).filter((r) =>
      Object.entries(where).every(([k, v]) => k === "status" || r[k] === v),
    );
  });
  stub(approved_asset, "find", async () => opts.assets ?? []);
  stub(asset_send, "find", async () => []);
  stub(asset_send, "save", async (v: unknown) => v);
  stub(asset_send, "create", (v: unknown) => v);
  stub(plan_catalog, "findOne", async () => opts.planRow ?? everydayYearly);
  jest.spyOn(need, "findOne").mockResolvedValue((opts.needRow ?? null) as never);
  jest
    .spyOn(need, "create")
    .mockImplementation(((v: object) => ({ ...v, save: async () => undefined })) as never);

  const pipeline = new ChatPipelineService(
    new GuardrailService(),
    (opts.classify ? { generate, classifyAnswer: opts.classify } : { generate }) as never,
    new ReplyValidatorService(),
    { send } as never,
    {
      recommend: async () => opts.recommend ?? null,
      prices: async () => ({ monthly: 999, yearly: 10000 }),
    } as never,
    { search: async () => [] } as never,
    {
      create: async (b: Record<string, unknown>) => {
        bookings.push(b);
        return { ...b, id: "bk1" };
      },
    } as never,
    new DateWindowService() as never,
    { transaction: async (fn: Fn) => fn(mg) } as never,
    { enqueue, dispatch: jest.fn() } as never,
    { transition } as never,
    opts.triggers as never,
    opts.scheduler as never,
  );
  const s = {
    customer: {
      id: "c1",
      language: opts.language ?? "en",
      active_product: null,
      age: opts.age === undefined ? 40 : opts.age,
      save: async () => undefined,
    },
    conversation: conv,
  } as never;
  const run = (text: string) => {
    replied = false;
    return pipeline.process({ waNumber: "919800000001", waMessageId: "wamid.IN1", text }, s);
  };
  return { run, out, generate, conv, saved, enqueue, mg, bookings };
}

afterEach(() => jest.restoreAllMocks());

describe("plan choice (12.3)", () => {
  const spendNeed = {
    annual_medical_spend: 60000,
    healthcare_need: "routine check-up",
    save: async () => undefined,
  };

  it("asks the age before naming any plan", async () => {
    const t = setup([draft("Thanks for sharing.", { intent: "recommend" })], {
      recommend: { status: "ask_age" },
      needRow: spendNeed,
      age: null,
    });
    await t.run("we spend about 60000 a year");
    expect(t.out.join("\n\n")).toContain(ASK_AGE);
    expect(t.out.join("\n\n")).not.toMatch(/₹/);
  });

  it("shows the prices and the easy illustration from the catalog", async () => {
    const t = setup([draft("Thanks for sharing.", { intent: "recommend" })], {
      recommend: { status: "recommend", plan: "everyday", saving: 12000, price: 10000, rate: 20 },
      needRow: spendNeed,
    });
    await t.run("we spend about 60000 a year");
    expect(t.out.join("\n\n")).toContain("I recommend the Everyday plan");
    expect(t.out.join("\n\n")).toContain("₹999 monthly or ₹10,000 yearly plus applicable GST");
    expect(t.out.join("\n\n")).toContain(
      "save about ₹12,000 a year, against a plan price of ₹10,000 plus GST",
    );
    expect(t.conv.recommended_plan).toBe("everyday");
  });

  it("gives the honest answer when no plan pays for itself", async () => {
    const t = setup([draft("Thanks.", { intent: "recommend" })], {
      recommend: { status: "not_worth_it", plan: "everyday", price: 10000, spend: 15000 },
      needRow: {
        annual_medical_spend: 15000,
        healthcare_need: "fever",
        save: async () => undefined,
      },
    });
    await t.run("about 15000 a year");
    expect(t.out.join("\n\n")).toContain("may not pay for itself in savings alone");
    expect(t.out.join("\n\n")).not.toMatch(/save about/);
  });
});

// reported from a real chat (14 Nov): "Monthly 20,000" got "would you like to explore a plan?" twice, replies
// carried two questions, and "please hold on" was promised
describe("one question, no repeat, no stalling", () => {
  it("'Monthly 20,000': the yearly spend (x 12) is saved and the value check answers in the same turn", async () => {
    const needRow: Record<string, unknown> = {
      healthcare_need: "medicines",
      save: async () => undefined,
    };
    const t = setup(
      [
        draft(
          "Thank you for sharing that your family spends around 20,000 monthly on healthcare. Would you like to explore an Oxxy plan for ongoing support with these expenses?",
          { intent: "collect_needs" },
        ),
      ],
      {
        recommend: { status: "recommend", plan: "thrive", saving: 72000, price: 30000, rate: 30 },
        needRow,
      },
    );
    await t.run("Monthly 20,000");
    expect(needRow.annual_medical_spend).toBe(240000);
    const text = t.out.join("\n\n");
    expect(text).toContain("I recommend the Thrive plan");
    expect(text).not.toContain("Would you like to explore an Oxxy plan"); // the draft's question went
    expect(t.conv.recommended_plan).toBe("thrive");
  });

  it("the system asks the age: the draft's own question is removed (one question per message)", async () => {
    const t = setup(
      [
        draft(
          "Great choice! I can help you with an Oxxy plan. Please let me know your preferred date for activation?",
          { intent: "recommend" },
        ),
      ],
      {
        recommend: { status: "ask_age" },
        needRow: { annual_medical_spend: 240000, save: async () => undefined },
        age: null,
      },
    );
    await t.run("Yes");
    const text = t.out.join("\n\n");
    expect(text).toContain(ASK_AGE);
    expect(text).not.toContain("preferred date for activation");
    expect(text.match(/\?/g)).toHaveLength(1);
  });

  it("naming a hospital is not asking for a booking: the offer comes first, then the landmark", async () => {
    const t = setup(
      [draft("Noted.", { intent: "book", extracted_fields: { centre_name: "PSG Hospital" } })],
      {
        needRow: { specialisation: "gastro", save: async () => undefined },
        centres: CENTRES,
      },
    );
    await t.run("We are consulting in psg hosiptal");
    expect(t.out.join("\n\n")).toContain("May I do your booking at PSG Hospital?");
    expect(t.out.join("\n\n")).not.toContain("not in our directory yet");
    await t.run("yes");
    expect(t.out[1]).toContain('"PSG Hospital" is not in our directory yet');
  });

  it("asked to book in so many words: no second asking", async () => {
    const t = setup(
      [draft("Sure.", { intent: "book", extracted_fields: { centre_name: "PSG Hospital" } })],
      {
        needRow: { specialisation: "gastro", save: async () => undefined },
        centres: CENTRES,
      },
    );
    await t.run("please book an appointment at PSG hospital");
    expect(t.out.join("\n\n")).toContain('"PSG Hospital" is not in our directory yet');
  });

  it("needs a person: the reason comes before the callback options, and the draft's question goes", async () => {
    const t = setup([
      draft("I am not sure about that. Would you like anything else?", { needs_human: true }),
    ]);
    await t.run("my uncle wants something special arranged");
    const text = t.out.join("\n\n");
    expect(text).toContain(
      "I want to give you a precise answer rather than guess. I will arrange an authorised callback.",
    );
    expect(text.indexOf("precise answer")).toBeLessThan(
      text.indexOf("Please choose a convenient time"),
    );
    expect(text).not.toContain("Would you like anything else?");
  });

  // reported: the bot asked again for things the customer had already told it
  it("the LLM is told what is already stored (city, patient, need, spend, plan), so it does not ask again", async () => {
    const t = setup([draft("Sure.")], {
      recommended: "thrive",
      needRow: {
        beneficiary: "mother",
        healthcare_need: "medicines",
        city: "Tiruppur",
        annual_medical_spend: 240000,
        condition_if_voluntary: "secret",
        save: async () => undefined,
      },
    });
    await t.run("ok tell me more");
    const context = JSON.parse(String((t.generate.mock.calls[0] as unknown[])[1]));
    expect(context.known).toMatchObject({
      beneficiary: "mother",
      healthcare_need: "medicines",
      city: "Tiruppur",
      annual_medical_spend: 240000,
      recommended_plan: "thrive",
    });
    expect(context.known.condition_if_voluntary).toBeUndefined(); // the free-text condition is never sent
    expect(context.conversation_state).toBeDefined();
  });

  it("'please hold on while I gather the information' is never sent", async () => {
    const t = setup([
      draft(
        "Thank you for specifying Peelamedu. I will check for healthcare centres in that area. Please hold on for a moment while I gather the information. Which service do you need?",
      ),
    ]);
    await t.run("Peelamedu");
    expect(t.out.join("\n\n")).not.toMatch(/hold on|I will check/);
    expect(t.out.join("\n\n")).toContain("Which service do you need?");
  });
});

describe("insurance questions get the approved fixed answer, never a Claude draft", () => {
  it("Trigger B: is Oxxy insurance?", async () => {
    const t = setup([]);
    await t.run("Is Oxxy insurance?");
    expect(t.out).toEqual([INSURANCE_ANSWER]);
    expect(t.generate).not.toHaveBeenCalled();
  });
  it("Trigger B, not J: I already have insurance (Oxxy route, never advise cancelling)", async () => {
    const t = setup([]);
    await t.run("I already have insurance");
    expect(t.out).toEqual([INSURANCE_HAS_ANSWER]);
    expect(t.out.join("\n\n")).toContain("should not cancel it");
    expect(t.generate).not.toHaveBeenCalled();
  });
  it("Trigger J only on the Cut Medi Bills route", async () => {
    const t = setup([], { product: "cut_medi_bills" });
    await t.run("My father has health insurance for this surgery");
    expect(t.out).toEqual([INSURANCE_COORDINATION]);
  });
  it("records B after the reply is sent, J on the Cut Medi Bills route", async () => {
    const triggers = fakeTriggers();
    const t = setup([], { triggers });
    await t.run("I already have insurance");
    expect(triggers.record).toHaveBeenCalledWith(
      "c1",
      expect.anything(),
      { id: "B", suppression: null },
      "has insurance",
      expect.anything(),
    );
    const t2 = setup([], { triggers: fakeTriggers(), product: "cut_medi_bills" });
    await t2.run("we have insurance for it");
    expect(t2.out).toEqual([INSURANCE_COORDINATION]);
  });
});

function fakeTriggers() {
  const real = new TriggerEngineService();
  return {
    inferCandidate: real.inferCandidate.bind(real),
    decide: jest.fn(async (_c: unknown, _v: unknown, cand: string | null) =>
      cand ? { id: cand, suppression: null } : null,
    ),
    record: jest.fn(async () => undefined),
  };
}

describe("centre discount question (Playbook 10)", () => {
  it.each([
    "Do I get a discount at this hospital?",
    "Will I save money at Apollo hospital?",
    "is there any discount at that clinic",
  ])("%s -> the neutral savings line, no Claude, no tie-up", async (q) => {
    const t = setup([]);
    await t.run(q);
    expect(t.out).toEqual([centreSavingReply("en")]);
    expect(t.out.join("\n\n")).toContain("confirmed separately by the Oxxy team");
    expect(t.generate).not.toHaveBeenCalled();
  });
  it("a plan saving question still goes to Claude", async () => {
    const t = setup([draft("Happy to explain.")]);
    await t.run("how does the plan work?");
    expect(t.generate).toHaveBeenCalled();
  });
});

describe("holding message", () => {
  it("hands the chat to a human (ESCALATED), not the safety PAUSE", async () => {
    const t = setup([draft("You will save 30%."), draft("You will save 30%.")]);
    await t.run("tell me more");
    // the holding message + callback options (Playbook 16.4), one message
    expect(t.out).toHaveLength(1);
    expect(t.out[0].startsWith(HOLDING_MESSAGE)).toBe(true);
    expect(t.conv.state).toBe(S.Escalated);
  });
});

describe("trigger recording", () => {
  it("no D when only the city question was asked", async () => {
    const triggers = fakeTriggers();
    const t = setup([draft("Let me find centres.", { intent: "find_centre" })], { triggers });
    await t.run("find a hospital");
    expect(t.out.join("\n\n")).toContain(ASK_CITY);
    expect(triggers.record).not.toHaveBeenCalled();
  });
  it("no E when only the age was asked", async () => {
    const triggers = fakeTriggers();
    const t = setup([draft("Thanks.", { intent: "recommend" })], {
      triggers,
      recommend: { status: "ask_age" },
      needRow: {
        annual_medical_spend: 60000,
        healthcare_need: "check-up",
        save: async () => undefined,
      },
      age: null,
    });
    await t.run("we spend 60000 a year");
    expect(triggers.record).not.toHaveBeenCalled();
  });
  it("E is recorded when the plan was shown", async () => {
    const triggers = fakeTriggers();
    const t = setup([draft("Thanks.", { intent: "recommend" })], {
      triggers,
      recommend: { status: "recommend", plan: "everyday", saving: 12000, price: 10000, rate: 20 },
      needRow: {
        annual_medical_spend: 60000,
        healthcare_need: "check-up",
        save: async () => undefined,
      },
    });
    await t.run("we spend 60000 a year");
    expect(triggers.record).toHaveBeenCalledWith(
      "c1",
      expect.anything(),
      { id: "E", suppression: null },
      "recommend",
      expect.anything(),
    );
  });
  it("a failed send records no trigger (the retried job can still fire it)", async () => {
    const triggers = fakeTriggers();
    const t = setup([draft("Thanks.", { intent: "recommend" })], {
      triggers,
      sendFails: true,
      recommend: { status: "recommend", plan: "everyday", saving: 12000, price: 10000, rate: 20 },
      needRow: {
        annual_medical_spend: 60000,
        healthcare_need: "check-up",
        save: async () => undefined,
      },
    });
    await expect(t.run("we spend 60000 a year")).rejects.toThrow("WhatsApp down");
    expect(triggers.record).not.toHaveBeenCalled();
  });
});

describe("centre search (12.4)", () => {
  it("asks for the city instead of listing centres from anywhere", async () => {
    const t = setup([draft("Let me find centres.", { intent: "find_centre" })]);
    await t.run("find a hospital");
    expect(t.out.join("\n\n")).toContain(ASK_CITY);
  });
});

describe("activation (12.5): disclosure first, link only after YES", () => {
  it("shows price, GST, renewal and asks before sending any link", async () => {
    const t = setup([draft("Sure.", { intent: "activate" })], {
      state: S.PlanFit,
      recommended: "everyday",
    });
    await t.run("I want to activate");
    expect(t.out.join("\n\n")).toContain("Price: ₹10,000 yearly plus applicable GST");
    expect(t.out.join("\n\n")).toContain("Renewal:");
    expect(t.out.join("\n\n")).toContain("Shall I send the official secure activation link?");
    expect(t.out.join("\n\n")).not.toContain("https://");
    expect(t.conv.pending_action).toBe("send_activation_link:cat-everyday-y");
  });

  it("YES sends only that product's official link and records the activation", async () => {
    const t = setup([], {
      state: S.Activation,
      recommended: "everyday",
      pending: "send_activation_link:cat-everyday-y",
    });
    await t.run("yes");
    expect(t.out.join("\n\n")).toContain(everydayYearly.activation_link);
    expect(t.saved.some((r) => r.activation_status === "link_sent" && r.plan === "everyday")).toBe(
      true,
    );
    expect(t.conv.state).toBe(S.AwaitingPayment);
    expect(t.mg.update).toHaveBeenCalled(); // an earlier unpaid link is cancelled first
    expect(t.generate).not.toHaveBeenCalled();
  });

  // go-live: a plan whose official link or terms are not in the catalogue yet is never quoted
  const notReady = {
    ...everydayYearly,
    activation_link: null,
    renewal_terms: null,
    activation_time: null,
  };

  it("plan not ready (no official link / terms): no price disclosure, no link, a task for the team", async () => {
    const t = setup([draft("Sure.", { intent: "activate" })], {
      state: S.PlanFit,
      recommended: "everyday",
      planRow: notReady,
    });
    await t.run("I want to activate");
    expect(t.out.join("\n\n")).not.toContain("Shall I send the official secure activation link?");
    expect(t.out.join("\n\n")).not.toMatch(/https?:|CONFIRM|example/);
    expect(t.conv.pending_action).toBeNull();
    expect(
      t.saved.some((r) =>
        String(r.summary).startsWith("Plan not ready to sell, missing: official activation link"),
      ),
    ).toBe(true);
  });

  it("YES after the row lost its link (or still holds an example link): holding message, never the link", async () => {
    const t = setup([], {
      state: S.Activation,
      recommended: "everyday",
      pending: "send_activation_link:cat-everyday-y",
      planRow: {
        ...everydayYearly,
        activation_link: "https://example.com/oxxy/activate/everyday-yearly",
      },
    });
    await t.run("yes");
    expect(t.out.join("\n\n")).not.toMatch(/https?:/);
    expect(t.saved.some((r) => r.activation_status === "link_sent")).toBe(false);
  });

  it("NO sends no link", async () => {
    const t = setup([], {
      state: S.Activation,
      recommended: "everyday",
      pending: "send_activation_link:cat-everyday-y",
    });
    await t.run("no");
    expect(t.out).toHaveLength(1);
    expect(t.out[0].startsWith(LINK_DECLINED)).toBe(true);
    expect(t.out.join("\n\n")).toMatch(/be better for a quick follow-up\?/); // Trigger N only if a time is chosen
    expect(t.out.join("\n\n")).not.toMatch(/https?:/);
    expect(t.conv.pending_action).toBe("follow_up_time");
    expect(t.saved.length).toBe(0);
  });
});

// ---- Trigger & Conversion Layer content triggers (A, C, E, F, L) ----

const CATALOG = (
  [
    ["everyday", 999, 10000, 70, 20],
    ["vital", 1999, 20000, 75, 25],
    ["thrive", 2999, 30000, 80, 30],
    ["infinity", 3999, 40000, null, 30],
  ] as [string, number, number, number | null, number][]
).flatMap(([plan, m, y, age, rate]) =>
  (["monthly", "yearly"] as const).map((billing) => ({
    id: billing === "yearly" ? `cat-${plan}-y` : `cat-${plan}-m`,
    product: "oxxy",
    plan,
    billing,
    price: billing === "monthly" ? m : y,
    age_limit: age,
    illustration_pct: rate,
  })),
);
const asset = (o: Record<string, unknown>) => ({
  approved: true,
  status: true,
  valid_to: null,
  language: "en",
  kind: "article",
  ...o,
});

describe("Trigger A: trust pack without Claude", () => {
  it("Is Oxxy genuine? -> official website, policy, support and approved proof; E does not fire", async () => {
    const triggers = fakeTriggers();
    const t = setup([], {
      triggers,
      assets: [
        asset({
          id: "a1",
          code: "a1",
          trigger_id: "A",
          title: "News article",
          url: "https://news.example/oxxy",
        }),
      ],
    });
    await t.run("Is Oxxy genuine?");
    expect(t.generate).not.toHaveBeenCalled();
    expect(t.out.join("\n\n")).toContain("Official website: https://www.oxxy.in");
    expect(t.out.join("\n\n")).toContain("Official policies: https://www.oxxy.in/policies");
    expect(t.out.join("\n\n")).toContain("News article: https://news.example/oxxy");
    expect(t.out.join("\n\n")).not.toMatch(/activation link|₹/);
    expect(triggers.record).toHaveBeenCalledTimes(1);
    const call = triggers.record.mock.calls[0] as unknown[];
    expect(call[2]).toEqual({ id: "A", suppression: null });
    expect(call[4]).toEqual({ assets: ["a1"], cta: "https://www.oxxy.in" });
  });
  it("fires even when no asset is approved (the official links are approved)", async () => {
    const t = setup([], { triggers: fakeTriggers() });
    await t.run("is this legit?");
    expect(t.out.join("\n\n")).toMatch(/^It is sensible to verify/);
  });
  it("asked again in the same journey: the links again, nothing recorded", async () => {
    const triggers = fakeTriggers();
    triggers.decide.mockResolvedValue(null as never);
    const t = setup([], { triggers });
    await t.run("can I trust you?");
    expect(t.out.join("\n\n")).toMatch(/^Here is Oxxy's official information/);
    expect(triggers.record).not.toHaveBeenCalled();
  });
  it("Claude read a trust doubt: the approved pack replaces its draft", async () => {
    const t = setup([draft("Yes we are real.", { intent: "trust_doubt" })], {
      triggers: fakeTriggers(),
    });
    await t.run("hmm not sure about you people");
    expect(t.out.join("\n\n")).toMatch(/^It is sensible to verify/);
    expect(t.out.join("\n\n")).not.toContain("Yes we are real");
  });
});

describe("Trigger C: why activate", () => {
  it("Nobody is sick -> advance activation without fear, variant from the record", async () => {
    const t = setup([], { triggers: fakeTriggers(), needRow: { beneficiary: "my father" } });
    await t.run("why should I activate, nobody is sick");
    expect(t.generate).not.toHaveBeenCalled();
    expect(t.out.join("\n\n")).toContain(
      "Oxxy works best when it is active before the next planned healthcare expense",
    );
    expect(t.out.join("\n\n")).toContain("Infinity has no age limit");
  });
  it("not on the Cut Medi Bills route: Claude answers", async () => {
    const t = setup([draft("Sure.")], { triggers: fakeTriggers(), product: "cut_medi_bills" });
    await t.run("why should I activate?");
    expect(t.generate).toHaveBeenCalled();
    expect(t.out.join("\n\n")).not.toContain("Oxxy works best");
  });
});

describe("Trigger E: comparison only when asked, one plan marked, no link", () => {
  it("compare plans with age and need known -> four plans, one recommended", async () => {
    const triggers = fakeTriggers();
    const t = setup([], {
      triggers,
      catalog: CATALOG,
      age: 45,
      needRow: { healthcare_need: "routine check-up" },
    });
    await t.run("can you compare the plans?");
    expect(t.generate).not.toHaveBeenCalled();
    expect(t.out.join("\n\n")).toContain("Here are the four Oxxy plans");
    expect(t.out[0].match(/recommended for you/g)).toHaveLength(1);
    expect(t.out.join("\n\n")).toContain("1. Everyday (recommended for you)");
    expect(t.out.join("\n\n")).not.toMatch(/https?:/);
    expect(t.conv.recommended_plan).toBe("everyday");
    expect((triggers.record.mock.calls[0] as unknown[])[2]).toEqual({ id: "E", suppression: null });
  });
  it("no age yet -> the comparison, no plan marked, the age question", async () => {
    const t = setup([], { catalog: CATALOG, age: null });
    await t.run("what plans do you have?");
    expect(t.out.join("\n\n")).not.toContain("recommended for you");
    expect(t.out.join("\n\n")).toContain(ASK_AGE);
  });
  it("send me the link (no comparison asked) -> ONE plan with its disclosure, no catalogue", async () => {
    const t = setup([draft("Sure.", { intent: "activate" })], {
      catalog: CATALOG,
      age: 45,
      needRow: { healthcare_need: "routine check-up" },
    });
    await t.run("please send me the link");
    expect(t.out.join("\n\n")).toContain("I recommend the Everyday plan because");
    expect(t.out.join("\n\n")).toContain("Shall I send the official secure activation link?");
    expect(t.out.join("\n\n")).not.toContain("Here are the four Oxxy plans");
    expect(t.out.join("\n\n")).not.toMatch(/https?:/); // the link only after YES
    expect(t.conv.recommended_plan).toBe("everyday");
  });
});

describe("Trigger F: savings illustration", () => {
  it("₹1,00,000 expected bill -> about ₹30,000 with the variability statement", async () => {
    const triggers = fakeTriggers();
    const t = setup(
      [draft("Thanks for sharing.", { extracted_fields: { expected_bill: 100000 } })],
      { triggers },
    );
    await t.run("my bill will be 1 lakh");
    expect(t.out.join("\n\n")).toContain("approximately 30% of ₹1,00,000 is ₹30,000");
    expect(t.out.join("\n\n")).toContain("will be confirmed");
    expect((triggers.record.mock.calls[0] as unknown[])[2]).toEqual({ id: "F", suppression: null });
  });
  it("Everyday recommended -> 20% (₹20,000), never above the plan cap", async () => {
    const t = setup([draft("Thanks.", { extracted_fields: { expected_bill: 100000 } })], {
      recommended: "everyday",
    });
    await t.run("the bill is 1 lakh");
    expect(t.out.join("\n\n")).toContain("approximately 20% of ₹1,00,000 is ₹20,000");
  });
  it("the same bill again is not illustrated twice", async () => {
    const t = setup([draft("Ok.", { extracted_fields: { expected_bill: 100000 } })], {
      needRow: { expected_bill: 100000, save: async () => undefined },
    });
    await t.run("yes 1 lakh");
    expect(t.out.join("\n\n")).not.toContain("For an easy illustration");
  });
});

describe("Trigger L: approved proof only", () => {
  it("wants reviews + an approved testimonial -> it is sent", async () => {
    const t = setup([draft("Happy to share.", { intent: "wants_proof" })], {
      triggers: fakeTriggers(),
      assets: [
        asset({
          id: "l1",
          code: "l1",
          trigger_id: "L",
          kind: "testimonial",
          title: "Member stories",
          url: "https://s.example",
        }),
      ],
    });
    await t.run("any reviews from other customers?");
    expect(t.out.join("\n\n")).toContain("Happy to share.");
    expect(t.out.join("\n\n")).toContain("Member stories: https://s.example");
  });
  it("nothing approved -> L does not fire, nothing invented", async () => {
    const triggers = fakeTriggers();
    const t = setup([draft("Happy to share.", { intent: "wants_proof" })], { triggers });
    await t.run("any reviews from other customers?");
    expect(t.out).toEqual(["Happy to share."]);
    expect(triggers.record).not.toHaveBeenCalled();
  });
});

// ---- Booking request flow (Playbook 11, Trigger layer G / H) ----

const CENTRES = [
  { id: "ctr1", name: "City Multispeciality", branch: "T Nagar", verified: true, active: true },
  { id: "ctr2", name: "Apollo Eye", branch: "Adyar", verified: true, active: true },
];
const ddmmyyyy = (days: number) => {
  const iso = new Date(Date.now() + days * 86400000 + 5.5 * 3600000).toISOString().slice(0, 10);
  const [y, m, d] = iso.split("-");
  return { iso, text: `${d}/${m}/${y}` };
};

describe("booking request, one question per turn", () => {
  it("list pick -> offer -> specialisation -> date -> time -> H summary + one soft suggestion", async () => {
    const row: Record<string, unknown> = {
      suggested_centre_ids: ["ctr1", "ctr2"],
      save: async () => undefined,
    };
    const t = setup([], {
      pending: "centre_pick",
      needRow: row,
      centres: CENTRES,
      triggers: fakeTriggers(),
    });
    await t.run("2");
    expect(t.out[0]).toBe(
      "May I do your booking at Apollo Eye, Adyar? Reply YES or NO, or send the name of another centre you prefer.",
    );
    await t.run("yes");
    expect(t.out[1]).toBe(
      "Which doctor specialisation, test or healthcare service should I include in the request?",
    );
    await t.run("eye check-up");
    expect(row.specialisation).toBe("eye check-up");
    expect(t.out[2]).toMatch(/^What date would you prefer\? It can be from /);
    const day = ddmmyyyy(10);
    await t.run(day.text);
    expect(t.out[3]).toBe("What time or time window would suit you?");
    await t.run("10 am");
    expect(t.bookings).toEqual([
      expect.objectContaining({
        centre_id: "ctr2",
        specialisation: "eye check-up",
        preferred_date: day.iso,
        preferred_time: "10 am",
      }),
    ]);
    expect(t.out[4]).toContain(
      "at 10 am at Apollo Eye, Adyar, for eye check-up. It is pending confirmation.",
    );
    expect(t.out[4]).toContain(
      "Any saving at this centre is confirmed separately. There is no pressure",
    );
    expect(t.out[4]).not.toMatch(/\bconfirmed\b(?! separately)/);
    expect(t.conv.pending_action).toBe("soft_activation");
    expect(t.conv.state).toBe(S.BookingRecorded);
  });

  it("a date too soon or too far is refused with the window (11.1)", async () => {
    const t = setup([], {
      pending: 'booking:{"step":"date","c":"ctr1","cn":"City Multispeciality","ok":true}',
      needRow: { specialisation: "ortho", save: async () => undefined },
      centres: CENTRES,
    });
    await t.run("tomorrow");
    expect(t.out.join("\n\n")).toMatch(/^The booking request needs at least a 3-day gap/);
    await t.run(ddmmyyyy(220).text);
    expect(t.out[1]).toMatch(/^I can record requests only up to 6 months ahead/);
    expect(t.bookings).toHaveLength(0);
  });

  it("a centre not in the directory is never rejected: landmark, then a verification task, no booking row", async () => {
    const day = ddmmyyyy(12);
    const t = setup(
      [
        draft("Sure, which date?", {
          intent: "book",
          extracted_fields: { centre_name: "Kumar Nursing Home" },
        }),
      ],
      {
        needRow: { specialisation: "ortho", save: async () => undefined },
        centres: CENTRES,
      },
    );
    await t.run("book at Kumar Nursing Home");
    expect(t.out.join("\n\n")).toContain('"Kumar Nursing Home" is not in our directory yet');
    expect(t.out.join("\n\n")).not.toContain("Sure, which date?"); // one question per turn
    await t.run("near the bus stand, Velachery");
    expect(t.out[1]).toMatch(/^What date would you prefer/);
    await t.run(`${day.text} 11am`); // the time came with the date
    expect(t.bookings).toHaveLength(0);
    expect(t.out[2]).toContain("Our team will first check the centre and branch");
    expect(t.saved.some((x) => x.type === "directory_verification")).toBe(true);
  });

  // reported from a real chat: "No give me at your suggestion." was saved as a centre name
  it("'give me your suggestion' at the centre question: never a centre name; asks where to search", async () => {
    const t = setup([], { pending: 'booking:{"step":"centre","ok":true}', centres: CENTRES });
    await t.run("No give me at your suggestion.");
    expect(t.out).toHaveLength(1);
    expect(t.out[0]).toBe(ASK_CITY);
    expect(t.out[0]).not.toContain("not in our directory");
    expect(t.conv.pending_action).toBeNull();
    expect(t.conv.state).toBe(S.CentreSearch);
    expect(t.saved.some((x) => x.type === "directory_verification")).toBe(false);
  });

  it("'suggest one' with the city known: asks the travel distance, then the list comes", async () => {
    const t = setup([], {
      pending: 'booking:{"step":"centre","ok":true}',
      needRow: { city: "Madurai", save: async () => undefined },
      centres: CENTRES,
    });
    await t.run("you suggest a good one");
    expect(t.conv.pending_action).toBe("centre_radius");
    expect(t.out[0]).not.toContain("not in our directory");
  });

  it("a sentence that is not a centre name is not saved as one: answered, then the centre question again", async () => {
    const t = setup([draft("Sure, I can help with that.")], {
      pending: 'booking:{"step":"centre","ok":true}',
      centres: CENTRES,
    });
    await t.run("ok do it for me");
    expect(t.out.join("\n\n")).not.toContain("not in our directory");
    expect(t.out.join("\n\n")).toContain("Please share the centre and branch first");
    expect(String(t.conv.pending_action)).toContain('"step":"centre"');
  });

  // ---- the LLM reads an unclear booking answer; the reply stays fixed text ----
  const reads = (kind: string, value: string | null = null) =>
    jest.fn(async () => ({ kind, value }));

  it("LLM reads a suggestion request the word rules miss ('edhavadhu nalla idam sollunga') -> centre search", async () => {
    const classify = reads("wants_suggestion");
    const t = setup([], {
      pending: 'booking:{"step":"centre","ok":true}',
      centres: CENTRES,
      classify,
    });
    await t.run("edhavadhu nalla idam sollunga");
    expect(classify).toHaveBeenCalledWith(
      "centre",
      expect.stringContaining("centre and branch"),
      "edhavadhu nalla idam sollunga",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    expect(t.out[0]).toBe(ASK_CITY);
    expect(t.conv.pending_action).toBeNull();
  });

  it("LLM pulls the centre name out of a sentence; the name alone goes to the team", async () => {
    const classify = reads("answer", "Kumar Nursing Home, Villapuram");
    const t = setup([], {
      pending: 'booking:{"step":"centre","ok":true}',
      centres: CENTRES,
      classify,
    });
    await t.run("pls do it in kumar nursing home villapuram only");
    expect(t.out[0]).toContain('"Kumar Nursing Home, Villapuram" is not in our directory yet');
  });

  it("a centre from the directory needs no LLM call", async () => {
    const classify = reads("other");
    const t = setup([], {
      pending: 'booking:{"step":"centre","ok":true}',
      needRow: { specialisation: "eye", save: async () => undefined },
      centres: CENTRES,
      classify,
    });
    await t.run("Apollo Eye");
    expect(classify).not.toHaveBeenCalled();
    expect(t.out[0]).toMatch(/^What date would you prefer/);
  });

  it("'Orthi' -> the LLM corrects it to Orthopaedics; a known word ('eye') is kept without a call", async () => {
    const needRow: Record<string, unknown> = { save: async () => undefined };
    const classify = reads("answer", "Orthopaedics");
    const t = setup([], {
      pending: 'booking:{"step":"specialisation","c":"ctr1","cn":"City Multispeciality","ok":true}',
      needRow,
      centres: CENTRES,
      classify,
    });
    await t.run("Orthi.");
    expect(needRow.specialisation).toBe("Orthopaedics");
    expect(t.out[0]).toMatch(/^What date would you prefer/);

    const needRow2: Record<string, unknown> = { save: async () => undefined };
    const classify2 = reads("answer", "x");
    const t2 = setup([], {
      pending: 'booking:{"step":"specialisation","c":"ctr1","cn":"City Multispeciality","ok":true}',
      needRow: needRow2,
      centres: CENTRES,
      classify: classify2,
    });
    await t2.run("eye check");
    expect(classify2).not.toHaveBeenCalled();
    expect(needRow2.specialisation).toBe("eye check");
  });

  it("no LLM (or it fails): the answer is kept as the customer wrote it, the flow goes on", async () => {
    const needRow: Record<string, unknown> = { save: async () => undefined };
    const classify = jest.fn(async () => null);
    const t = setup([], {
      pending: 'booking:{"step":"specialisation","c":"ctr1","cn":"City Multispeciality","ok":true}',
      needRow,
      centres: CENTRES,
      classify,
    });
    await t.run("Orthi.");
    expect(needRow.specialisation).toBe("Orthi.");
    expect(t.out[0]).toMatch(/^What date would you prefer/);
  });

  it("a date the parser cannot read ('coming friday') is worked out by the LLM, then checked against the window", async () => {
    const day = ddmmyyyy(12);
    const t = setup([], {
      pending: 'booking:{"step":"date","c":"ctr1","cn":"City Multispeciality","ok":true}',
      needRow: { specialisation: "ortho", save: async () => undefined },
      centres: CENTRES,
      classify: reads("answer", day.iso),
    });
    await t.run("coming friday week");
    expect(String(t.conv.pending_action)).toContain(`"d":"${day.iso}"`);

    const soon = setup([], {
      pending: 'booking:{"step":"date","c":"ctr1","cn":"City Multispeciality","ok":true}',
      needRow: { specialisation: "ortho", save: async () => undefined },
      centres: CENTRES,
      classify: reads("answer", ddmmyyyy(1).iso),
    });
    await soon.run("the day after today");
    expect(String(soon.conv.pending_action)).not.toContain('"d":'); // too soon: refused by the window, not saved
  });

  it("a question during the booking is answered, then the same step is asked again", async () => {
    const t = setup([draft("Yes, most centres have parking.")], {
      pending: 'booking:{"step":"date","c":"ctr1","cn":"City Multispeciality","ok":true}',
      needRow: { specialisation: "ortho", save: async () => undefined },
      centres: CENTRES,
    });
    await t.run("is there parking?");
    expect(t.out.join("\n\n")).toMatch(
      /^Yes, most centres have parking\.\n\nWhat date would you prefer\?/,
    );
  });

  it("no to the offer ends the flow politely; no to the soft suggestion = activation declined", async () => {
    const t = setup([], {
      pending: 'booking:{"step":"offer","c":"ctr2","cn":"Apollo Eye","ok":false}',
      centres: CENTRES,
    });
    await t.run("no");
    expect(t.out.join("\n\n")).toMatch(/^No problem/);
    expect(t.conv.pending_action).toBeNull();
    const t2 = setup([], { pending: "soft_activation" });
    await t2.run("no");
    expect(t2.out[0]).toMatch(/^Absolutely, no problem\. Your booking request is recorded/);
    expect((t2.conv as { outcome?: string }).outcome).toBe("activation_declined");
  });
});

// ---- Objections (M), agreed follow-up (N), medicines (K), rescue (Playbook 14 / 15) ----

function fakeScheduler() {
  return {
    create: jest.fn(async (f: Record<string, unknown>) => ({ id: "fu1", ...f })),
    cancelForConversation: jest.fn(async () => 0),
    hasScheduled: jest.fn(async () => false),
    cancelAll: jest.fn(async () => 0),
  };
}

describe("Trigger M + N: one objection, one resolution; follow-up only when agreed", () => {
  it("I need to think -> 3-line summary + two times; picking one schedules the agreed follow-up", async () => {
    const scheduler = fakeScheduler();
    const triggers = fakeTriggers();
    const t = setup([], {
      scheduler,
      triggers,
      recommended: "vital",
      needRow: { healthcare_need: "knee pain" },
    });
    await t.run("I need to think");
    expect(t.generate).not.toHaveBeenCalled();
    expect(t.out.join("\n\n")).toContain("Your need: knee pain.");
    expect(t.out.join("\n\n")).toContain("Suggested: the Oxxy Vital plan");
    expect(t.out.join("\n\n")).toMatch(
      /Would .* at 11 am or .* at 5 pm be better for a quick follow-up\?/,
    );
    expect(t.conv.pending_action).toBe("follow_up_time");
    expect((triggers.record.mock.calls[0] as unknown[])[2]).toEqual({ id: "M", suppression: null });
    // no follow-up yet: only after agreement
    expect(scheduler.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: "agreed_follow_up" }),
    );

    await t.run("1");
    expect(scheduler.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "agreed_follow_up",
        templateName: "agreed_follow_up",
        source: "whatsapp_inbound",
      }),
    );
    expect(t.out[t.out.length - 1]).toMatch(/^Thank you\. I will follow up on .* at 11 am\./);
    expect(t.conv.state).toBe(S.FollowUp);
    expect(t.conv.pending_action).toBeNull();
  });

  it("a follow-up in quiet hours is refused with two allowed times", async () => {
    const t = setup([], { scheduler: fakeScheduler(), pending: "follow_up_time" });
    await t.run("tomorrow 11 pm");
    expect(t.out.join("\n\n")).toMatch(/^I can message only between 9 am and 9 pm\./);
  });

  it("too expensive, no spend yet -> the spend question, then the value check", async () => {
    const t = setup([], {
      recommend: { status: "recommend", plan: "vital", saving: 50000, price: 20000, rate: 25 },
    });
    await t.run("this is too expensive");
    expect(t.out.join("\n\n")).toMatch(/^I understand\. The plan should make practical sense/);
    expect(t.conv.pending_action).toBe("price_spend");
    await t.run("about 2 lakh");
    expect(t.out[1]).toContain("I recommend the Vital plan");
    expect(t.conv.recommended_plan).toBe("vital");
  });

  it("not interested -> summary or close; close ends the journey politely", async () => {
    const scheduler = fakeScheduler();
    const t = setup([], { scheduler });
    await t.run("not interested");
    expect(t.out[0]).toBe(
      "No problem. Would you prefer a concise summary or should I close the enquiry?",
    );
    await t.run("close it");
    expect(t.out[1]).toMatch(/^No problem\. I will close the enquiry here/);
    expect(t.conv.state).toBe(S.Closed);
    expect(scheduler.cancelForConversation).toHaveBeenCalledWith(
      "v1",
      ["rescue", "agreed_follow_up", "trigger_q"],
      "closed",
    );
  });

  it("not now after the disclosure offers two times; 'no need' ends it", async () => {
    const t = setup([], { pending: "follow_up_time" });
    await t.run("no need");
    expect(t.out[0]).toBe("No problem. You can message Oxxy whenever it is convenient for you.");
    expect(t.conv.pending_action).toBeNull();
  });
});

describe("Trigger K: medicines", () => {
  it("names only the selected product (default Oxxy)", async () => {
    const t = setup([], { triggers: fakeTriggers() });
    await t.run("do you deliver medicines?");
    expect(t.out[0]).toBe(
      "Oxxy may provide savings on almost all medicines, with home delivery at no additional charge, subject to " +
        "service availability. Please share your city and medicine requirement.",
    );
  });
  it("Cut Medi Bills route: Cut Medi Bills, never both", async () => {
    const t = setup([], { triggers: fakeTriggers(), product: "cut_medi_bills" });
    await t.run("can I get medicines cheaper?");
    expect(t.out.join("\n\n")).toMatch(/^Cut Medi Bills may provide savings/);
    expect(t.out.join("\n\n")).not.toMatch(/\bOxxy\b/);
  });
});

describe("conversation rescue (Playbook 15)", () => {
  it("after a normal reply: one rescue alarm (attempt 1 of 2); the customer's message cancels the old one", async () => {
    const scheduler = fakeScheduler();
    const t = setup([draft("Which city is the patient in?")], { scheduler });
    await t.run("I want to know more");
    // nothing that was waiting for the customer goes out once they write: rescue, agreed follow-up, queued first contact
    expect(scheduler.cancelForConversation).toHaveBeenCalledWith(
      "v1",
      ["rescue", "agreed_follow_up", "lead_intro"],
      "customer_replied",
    );
    expect(scheduler.create).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "rescue", templateName: "conversation_rescue_1" }),
    );
  });
  it("no rescue while a human has the chat (holding message -> ESCALATED)", async () => {
    const scheduler = fakeScheduler();
    const t = setup([draft("You will save 30%."), draft("You will save 30%.")], { scheduler });
    await t.run("tell me more");
    expect(scheduler.create).not.toHaveBeenCalled();
  });
  it("no rescue when one or an agreed follow-up is already waiting", async () => {
    const scheduler = fakeScheduler();
    scheduler.hasScheduled.mockResolvedValue(true);
    const t = setup([draft("Which city?")], { scheduler });
    await t.run("ok");
    expect(scheduler.create).not.toHaveBeenCalled();
  });
});

// ---- Hindi / Hinglish (Playbook 1.1, 19) ----

describe("the customer's language", () => {
  it("a Hindi customer gets the Hindi trust pack (links unchanged)", async () => {
    const t = setup([], { language: "hi", triggers: fakeTriggers() });
    await t.run("क्या Oxxy असली है?");
    expect(t.out.join("\n\n")).toMatch(/^किसी भी स्वास्थ्य सेवा के लिए भुगतान से पहले/);
    expect(t.out.join("\n\n")).toContain("आधिकारिक वेबसाइट: https://www.oxxy.in");
  });
  it("a Hinglish message switches the reply language: has insurance -> Hinglish Trigger B", async () => {
    const t = setup([], { language: "en" });
    await t.run("mere paas insurance hai");
    expect(t.out[0]).toBe(INSURANCE_HAS_ANSWER_T.hinglish);
    expect(t.generate).not.toHaveBeenCalled();
  });
  it("Hindi booking offer after a list pick", async () => {
    const t = setup([], {
      language: "hi",
      pending: "centre_pick",
      needRow: { suggested_centre_ids: ["ctr1"], save: async () => undefined },
      centres: [
        {
          id: "ctr1",
          name: "City Multispeciality",
          branch: "T Nagar",
          verified: true,
          active: true,
        },
      ],
    });
    await t.run("1");
    expect(t.out[0]).toBe(
      "क्या मैं City Multispeciality, T Nagar पर आपकी बुकिंग करूँ? हाँ या नहीं लिखें, या अपनी पसंद के किसी दूसरे केंद्र का नाम भेजें।",
    );
  });
});
