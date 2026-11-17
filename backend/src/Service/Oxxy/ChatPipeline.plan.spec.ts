// Full Development Plan 12.3 / 12.4 / 12.5: plan choice, honest answer, insurance questions,
// centre search without a city, and the activation disclosure before the link.
import { LOCATION_ASK_T } from "@Helper/CentreReplies";
import { ChatPipelineService } from "./ChatPipeline.service";
import { GuardrailService } from "./Guardrail.service";
import { ReplyValidatorService } from "./ReplyValidator.service";
import { assertTransition } from "./ConversationStateMachine";
import { ConversationState as S } from "@Helper/Enum/ConversationState";
import { NOTICE_VERSION } from "@Helper/FixedReplies";
import {
  ASK_AGE,
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
    maps?: unknown; // Google Maps adapter (geocode / travel / nearbyCandidates)
    found?: (q: Record<string, unknown>) => unknown[]; // what the directory search returns
    pinAsked?: boolean; // the "Send location" question was already asked in this conversation
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
  let pinAsked = !!opts.pinAsked; // a "Send location" message already went out in this conversation
  const send = jest.fn(async (...a: unknown[]) => {
    if (opts.sendFails) throw new Error("WhatsApp down");
    // what the chat history keeps: the centre list's full text (`log`); its body has the names only in the rows
    out.push(String((a[1] as { body: string; log?: string }).log ?? (a[1] as { body: string }).body));
    if ((a[1] as { kind?: string }).kind === "location_request") pinAsked = true;
    // only a message tagged with the inbound wamid is "the reply" (a map pin sent first is not)
    if (a[3] || (a[1] as { kind?: string }).kind !== "location") replied = true;
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
  stub(message, "findOne", async (o: unknown) => {
    const w = (o as { where?: { reply_to_wa_message_id?: string; type?: string } })?.where;
    if (w?.type === "location_request") return pinAsked ? { id: "pin-asked" } : null;
    return replied && w?.reply_to_wa_message_id ? { id: "out" } : null;
  });
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
    { search: async (q: Record<string, unknown>) => (opts.found ? opts.found(q) : []) } as never,
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
    undefined as never,
    opts.maps as never,
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
  const run = (text: string, location?: { latitude: number; longitude: number }, type?: string) => {
    replied = false;
    return pipeline.process({ waNumber: "919800000001", waMessageId: "wamid.IN1", text, location, type }, s);
  };
  return { run, out, generate, conv, saved, enqueue, mg, bookings, send };
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
    expect(t.out.join("\n\n")).toContain("₹999 + GST ₹180 = ₹1,179 monthly or ₹10,000 + GST ₹1,800 = ₹11,800 yearly");
    expect(t.out.join("\n\n")).toContain(
      "save about ₹12,000 a year, against a plan price of ₹11,800 a year including GST",
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
    await t.run("my mother takes medicines every month"); // ("ok, thanks" now ends the chat with the summary)
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
    expect(t.out.join("\n\n")).toBe(LOCATION_ASK_T.en);
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
  it("asks where (Send location button, or the area typed) instead of listing centres from anywhere", async () => {
    const t = setup([draft("Let me find centres.", { intent: "find_centre" })]);
    await t.run("find a hospital");
    expect((t.send.mock.calls[0] as unknown[])[1]).toMatchObject({ kind: "location_request" });
    expect(t.out).toEqual([LOCATION_ASK_T.en]); // the draft does not ride along
    expect(t.conv.pending_action).toBe("centre_location");
  });
});

describe("activation (12.5): disclosure first, link only after YES", () => {
  it("shows price, GST, renewal and asks before sending any link", async () => {
    const t = setup([draft("Sure.", { intent: "activate" })], {
      state: S.PlanFit,
      recommended: "everyday",
    });
    await t.run("I want to activate");
    expect(t.out.join("\n\n")).toContain("Plan cost: ₹10,000\n+ GST (18%): ₹1,800\n= Final payable: ₹11,800 a year");
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
    // said plainly + callback times (never "send your payment method"), and a task for the team
    expect(t.out.join(" ")).toMatch(/our team will send you the official secure activation link/);
    expect(t.conv.pending_action).toMatch(/^callback_time:/);
    expect(
      t.saved.some((r) => /plan not ready to sell, missing: official activation link/.test(String(r.summary))),
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
    // each answer is said back first (client, 17 Nov), then the next question
    expect(t.out[1]).toBe(
      "Noted: Apollo Eye, Adyar.\n\nWhich doctor specialisation, test or healthcare service should I include in the request?",
    );
    await t.run("eye check-up");
    expect(row.specialisation).toBe("eye check-up");
    expect(t.out[2]).toMatch(/^Noted: eye check-up\.\n\nWhat date would you prefer\? It can be from /);
    const day = ddmmyyyy(10);
    await t.run(day.text);
    expect(t.out[3]).toMatch(/^Noted .*\.\n\nWhat time or time window would suit you\?$/);
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
    expect(t.out.join("\n\n")).toMatch(/^A booking request needs at least 3 days .* The earliest date I can request is/);
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
    expect(t.out[1]).toMatch(/^Noted: .+\n\nWhat date would you prefer/);
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
    expect(t.out[0]).toBe(LOCATION_ASK_T.en); // sent with the one-tap "Send location" button
    expect(t.out[0]).not.toContain("not in our directory");
    expect(t.conv.pending_action).toBe("centre_location");
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
    // the city given in this chat is used (client, 17 Nov): no location question, the distance next
    expect(t.out[0]).toMatch(/^How far can the patient travel/);
    expect(t.out[0]).not.toContain("not in our directory");
    expect(t.conv.pending_action).toBe("centre_radius");
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
    expect(t.out[0]).toBe(LOCATION_ASK_T.en);
    expect(t.conv.pending_action).toBe("centre_location");
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
    expect(t.out[0]).toMatch(/^Noted: .+\n\nWhat date would you prefer/);
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
    expect(t.out[0]).toMatch(/^Noted: .+\n\nWhat date would you prefer/);

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
    expect(t.out[0]).toMatch(/^Noted: .+\n\nWhat date would you prefer/);
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

// ---- nearby centres with Google Maps: where the customer is, never which centre to suggest ----
describe("nearby centres (location + Google Maps)", () => {
  const ABC = { id: "ctr9", name: "ABC Hospital", branch: null, locality: "Peelamedu", city: "Coimbatore", centre_type: "multispeciality", latitude: 11.03, longitude: 77.01, verified: true, active: true };
  const spot = { latitude: 11.0261, longitude: 77.0006 };
  const fakeMaps = (over: Record<string, unknown> = {}) => ({
    enabled: true,
    geocode: jest.fn(async () => ({ ...spot, formatted: "Peelamedu, Coimbatore", locality: "Peelamedu", city: "Coimbatore", approximate: false })),
    travel: jest.fn(async (_o: unknown, d: unknown[]) => d.map(() => ({ distance_km: 2.3, minutes: 9 }))),
    nearbyCandidates: jest.fn(async () => [{ name: "PSG Hospitals", address: "Peelamedu, Coimbatore", latitude: 11.02, longitude: 77, maps_url: null }]),
    ...over,
  });

  it("'any hospital near me': the Send location button, then the answer is awaited", async () => {
    const t = setup([]);
    await t.run("any hospital near me");
    expect((t.send.mock.calls[0] as unknown[])[1]).toMatchObject({ kind: "location_request" });
    expect(t.out[0]).toBe(LOCATION_ASK_T.en);
    expect(t.conv.pending_action).toBe("centre_location");
    expect(t.generate).not.toHaveBeenCalled();
  });

  // Real chat, 16 Nov: the area was typed earlier ("coimbatore peelamedu"), then "you can suggest hospital".
  // The LLM listed hospitals by itself; the reply that went out was "1. 2. 3." + the travel-distance question.
  const AREA = { city: "Coimbatore", locality: "Peelamedu", save: async () => undefined };
  const INVENTED = "Here are some hospitals in Peelamedu:\n1. PSG Hospitals\n2. KMCH\n3. Aravind Eye Hospital\n\nWould you like to book one?";

  it("area known, 'you can suggest hospital': the known area is used (how far), never the LLM's own hospital list", async () => {
    const t = setup([draft(INVENTED, { intent: "find_centre" })], { needRow: { ...AREA } });
    await t.run("you can sugees hosiptal");
    expect(t.out.join(" ")).not.toMatch(/PSG|KMCH|Aravind/);
    expect(t.out.join(" ")).toContain("How far can the patient travel");
    expect(t.out.join(" ")).not.toMatch(/share the patient's location|Which city/i);
    expect(t.conv.pending_action).toBe("centre_radius");
  });

  it("the pin comes after that question: the nearest centres, no travel-distance question in between", async () => {
    const found = jest.fn(() => [{ ...ABC }]);
    const t = setup([], { pending: "centre_location", needRow: { ...AREA }, found, maps: fakeMaps(), pinAsked: true });
    await t.run("", spot);
    expect((found.mock.calls[0] as unknown[])[0]).toMatchObject({ latitude: spot.latitude, longitude: spot.longitude });
    expect(t.out[0]).toContain("1. ABC Hospital - Peelamedu");
    expect(t.conv.pending_action).toBe("centre_pick");
  });

  it.each(["no", "No, search in the same area", "I can't share location", "skip"])(
    "'%s' to the location question: the typed area is used, the travel distance is asked",
    async (answer) => {
      const maps = fakeMaps();
      const t = setup([], { pending: "centre_location", needRow: { ...AREA }, maps, pinAsked: true });
      await t.run(answer);
      expect(t.out[0]).toMatch(/^How far can the patient travel/);
      expect(t.conv.pending_action).toBe("centre_radius");
      expect(maps.geocode).not.toHaveBeenCalled(); // "no" is never looked up as a place
      expect(t.generate).not.toHaveBeenCalled();
    },
  );

  it("'10 km' to the location question: no pin, the distance is taken and the list comes", async () => {
    const needRow: Record<string, unknown> = { ...AREA };
    const found = jest.fn(() => [{ ...ABC }]);
    const t = setup([], { pending: "centre_location", needRow, found, maps: fakeMaps(), pinAsked: true });
    await t.run("10 km");
    expect(needRow.travel_radius_km).toBe(10);
    expect(t.out[0]).toContain("ABC Hospital");
    expect(t.conv.pending_action).toBe("centre_pick");
  });

  it("'ok' to the location question: the button once more, the wait stays", async () => {
    const t = setup([], { pending: "centre_location", needRow: { ...AREA }, pinAsked: true });
    await t.run("ok");
    expect((t.send.mock.calls[0] as unknown[])[1]).toMatchObject({ kind: "location_request" });
    expect(t.conv.pending_action).toBe("centre_location");
  });

  it("the location question is asked once: the next centre search goes to the travel distance", async () => {
    const t = setup([draft(INVENTED, { intent: "find_centre" })], { needRow: { ...AREA }, pinAsked: true });
    await t.run("suggest a hospital please");
    expect(t.out).toEqual(["How far can the patient travel for this? For example 5 km, 10 km or 20 km."]);
    expect(t.out.join(" ")).not.toMatch(/PSG|KMCH|1\. 2\./);
    expect(t.conv.pending_action).toBe("centre_radius");
  });

  it("a shared pin: the directory is searched around it, with road distance in the list", async () => {
    const found = jest.fn(() => [{ ...ABC }]);
    const maps = fakeMaps();
    const t = setup([], { pending: "centre_location", needRow: { save: async () => undefined }, found, maps });
    await t.run("", spot);
    expect((found.mock.calls[0] as unknown[])[0]).toMatchObject({ latitude: spot.latitude, longitude: spot.longitude });
    expect(t.out[0]).toContain("1. ABC Hospital - Peelamedu | Multispeciality | about 2.3 km, 9 min");
    expect(t.conv.pending_action).toBe("centre_pick");
    expect(maps.geocode).not.toHaveBeenCalled(); // the pin is the spot: nothing to look up
  });

  it("the area typed instead of the pin: looked up on the map, saved, the travel distance, then the list", async () => {
    const needRow: Record<string, unknown> = { save: async () => undefined };
    const found = jest.fn(() => [{ ...ABC }]);
    const t = setup([], { pending: "centre_location", needRow, found, maps: fakeMaps() });
    await t.run("Peelamedu Coimbatore");
    expect(needRow).toMatchObject({ locality: "Peelamedu", city: "Coimbatore" });
    // Playbook 10.1: how far first, never the list before the question
    expect(t.out[0]).toMatch(/^How far can the patient travel/);
    expect(found).not.toHaveBeenCalled();
    expect(t.conv.pending_action).toBe("centre_radius");
    t.out.length = 0;
    await t.run("10 km");
    expect((found.mock.calls[0] as unknown[])[0]).toMatchObject({ latitude: spot.latitude });
    expect(t.out[0]).toContain("ABC Hospital");
  });

  it("picking a centre from the list also sends its map pin", async () => {
    const t = setup([], { pending: "centre_pick", needRow: { suggested_centre_ids: ["ctr9"], specialisation: "ortho", save: async () => undefined }, centres: [ABC] });
    await t.run("1");
    // the pin first, then the YES / NO offer as the last message (client, 17 Nov)
    const msgs = t.send.mock.calls.map((c) => (c as unknown[])[1] as Record<string, unknown>);
    expect(msgs[0]).toMatchObject({ kind: "location", latitude: 11.03, longitude: 77.01, name: "ABC Hospital" });
    expect(msgs.at(-1)).toMatchObject({ kind: "buttons" });
    expect(t.out.at(-1)).toContain("May I do your booking at ABC Hospital?");
  });

  it("no verified centre near the pin: Google's places go to the TEAM as a task, never to the customer", async () => {
    const maps = fakeMaps();
    const t = setup([], { pending: "centre_location", needRow: { locality: "Peelamedu", city: "Coimbatore", save: async () => undefined }, found: () => [], maps });
    await t.run("", spot);
    expect(t.out.join("\n")).toContain("I do not have a verified centre in Peelamedu, Coimbatore yet");
    expect(t.out.join("\n")).not.toContain("PSG Hospitals");
    const gap = t.saved.find((x) => x.type === "directory_verification");
    expect(String(gap?.summary)).toContain("Not verified, from Google Maps, to check before adding to the directory: PSG Hospitals (Peelamedu, Coimbatore)");
  });

  it("no Google Maps key: a shared pin still works (straight-line distance), nothing is looked up", async () => {
    const found = jest.fn(() => [{ ...ABC, distance_km: 0.6 }]);
    const t = setup([], { pending: "centre_location", needRow: { save: async () => undefined }, found });
    await t.run("", spot);
    expect(t.out[0]).toContain("ABC Hospital - Peelamedu | Multispeciality | under 1 km");
  });
});

// Reported 16 Nov (kavi, Coimbatore): simple answers and questions in the booking went to the LLM, were read
// wrong, and ended in a hand-over to a person; then the bot went silent. Replayed step by step.
describe("booking answers the bot reads itself (no hand-over for basic questions)", () => {
  const PSG = { id: "ctrP", name: "PSG HOSPITAL", branch: "PEELAMEDU", verified: true, active: true };
  const offer = '{"step":"offer","c":"ctrP","cn":"PSG HOSPITAL, PEELAMEDU","u":false,"ok":false}';
  const atDate = '{"step":"date","c":"ctrP","cn":"PSG HOSPITAL, PEELAMEDU","ok":true}';
  const need = () => ({ specialisation: "Cardiology", save: async () => undefined });

  it('"yes psg okay" is a YES: the next step, never the same question again', async () => {
    const t = setup([], { pending: `booking:${offer}`, needRow: need(), centres: [PSG] });
    await t.run("yes psg okay");
    expect(t.generate).not.toHaveBeenCalled();
    expect(t.out).toHaveLength(1);
    expect(t.out[0]).not.toContain("May I do your booking");
    expect(t.out[0]).not.toMatch(/YYYY/);
  });

  it('"no, another one" or another centre name is not read as YES', async () => {
    const { saysYesToOffer } = jest.requireActual("./BookingFlow");
    expect(saysYesToOffer("yes psg okay", "PSG HOSPITAL, PEELAMEDU")).toBe(true);
    expect(saysYesToOffer("ok book it", "PSG HOSPITAL, PEELAMEDU")).toBe(true);
    expect(saysYesToOffer("yes but another hospital", "PSG HOSPITAL, PEELAMEDU")).toBe(false);
    expect(saysYesToOffer("yes kmch", "PSG HOSPITAL, PEELAMEDU")).toBe(false);
    expect(saysYesToOffer("no", "PSG HOSPITAL, PEELAMEDU")).toBe(false);
  });

  it('"what booking why i want too book ??" gets why, and that a booking is not needed: no pressure, no LLM', async () => {
    const t = setup([], { pending: `booking:${offer}`, needRow: need(), centres: [PSG] });
    await t.run("what booking why i want too book ??");
    expect(t.generate).not.toHaveBeenCalled();
    expect(t.out[0]).toMatch(/^You picked PSG HOSPITAL, PEELAMEDU from the list/);
    expect(t.out[0]).toContain("You do not have to book");
    expect(t.conv.pending_action).toMatch(/^booking:/);
  });

  it('"tomorrow ??" is a date answer: refused with the reason and the earliest date, never an LLM date', async () => {
    const t = setup([], { pending: `booking:${atDate}`, needRow: need(), centres: [PSG] });
    await t.run("tomorrow ??");
    expect(t.generate).not.toHaveBeenCalled();
    const min = new Date(Date.now() + 5.5 * 3600000 + 3 * 86400000);
    const shown = `${min.getUTCDate()} ${min.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} ${min.getUTCFullYear()}`;
    expect(t.out[0]).toContain(`The earliest date I can request is ${shown}`);
    expect(t.out.join(" ")).not.toMatch(/precise answer|callback|2023/);
    expect(t.conv.state).not.toBe(S.Escalated);
  });

  it('"why tomorrow not possible" at the date step is answered here, and the step stays open', async () => {
    const t = setup([], { pending: `booking:${atDate}`, needRow: need(), centres: [PSG] });
    await t.run("why tommorow not possible");
    expect(t.out[0]).toMatch(/^A booking request needs at least 3 days so the centre and our team can confirm/);
    expect(t.conv.pending_action).toMatch(/^booking:/);
  });

  it("a side question mid-booking that the LLM marks needs_human: answered, the same step again, no hand-over", async () => {
    const t = setup([draft("Booking requests are free.", { needs_human: true })], {
      pending: `booking:${atDate}`,
      needRow: need(),
      centres: [PSG],
    });
    await t.run("is there any charge for this booking?");
    const text = t.out.join("\n\n");
    expect(text).toContain("Booking requests are free.");
    expect(text).toMatch(/What date would you prefer\?/);
    expect(text).not.toMatch(/precise answer|Please choose a convenient time/);
    expect(t.conv.state).not.toBe(S.Escalated);
    expect(t.conv.pending_action).toMatch(/^booking:/);
  });
});

// Reported 16 Nov (client test): after the booking, the plan was recommended twice, "Okay" got "main benefit or
// price first?", the price never came, and "I need know about price" ended in a callback. Replayed here.
describe("plan choice and price after the booking (no repeats, no callback for the price)", () => {
  const spend20k = () => ({ annual_medical_spend: 20000, healthcare_need: "consultations", save: async () => undefined });
  const lastBot = (body: string) =>
    jest
      .spyOn(message, "findOne")
      .mockImplementation((async (o: any) => (o?.where?.reply_to_wa_message_id ? null : { body })) as never);
  const ageSaved = () =>
    jest.spyOn(jest.requireActual("@Database/Table/Oxxy/customer").customer, "update").mockResolvedValue({} as never);

  it('"20k" with no age: only the age question (the LLM\'s own "I recommend Vital" is not sent), then the answer is read', async () => {
    const opts: Record<string, unknown> = { needRow: spend20k(), age: null, recommend: { status: "ask_age" } };
    const t = setup(
      [draft("Thanks. I recommend an Oxxy plan for ongoing support.", { intent: "recommend", extracted_fields: { annual_medical_spend: 20000 } })],
      opts,
    );
    await t.run("20k");
    expect(t.out).toEqual(["To suggest the right plan, may I know the patient's age?"]);
    expect(t.conv.pending_action).toBe("plan_age");

    // "50+": read here (no LLM), ONE plan with its price, and honest because 20k a year is below break-even
    ageSaved();
    opts.recommend = { status: "not_worth_it", plan: "vital", price: 20000, spend: 20000 };
    t.out.length = 0;
    await t.run("50+");
    expect(t.generate).toHaveBeenCalledTimes(1);
    expect(t.out).toHaveLength(1);
    expect(t.out[0]).toMatch(/^Based on what you shared, the Vital plan fits best, at ₹999 \+ GST ₹180 = ₹1,179 monthly or ₹10,000 \+ GST ₹1,800 = ₹11,800 yearly/);
    expect(t.out[0]).toMatch(/may not pay for itself/);
    expect(t.out[0]).toMatch(/\?$/); // one question at the end, so "Okay" next is an answer
    expect(t.conv.recommended_plan).toBe("vital");
  });

  it('"Okay" right after a question is an answer (the normal reply), not the "main benefit or price first?" line', async () => {
    const t = setup([draft("Great.")], { recommended: "vital" });
    lastBot("Would you like to proceed with activating the Oxxy Vital plan?");
    await t.run("Okay");
    // the activation itself starts (price, GST, renewal first), not an LLM guess
    expect(t.generate).not.toHaveBeenCalled();
    expect(t.out.length).toBeGreaterThan(0);
    expect(t.out.join(" ")).not.toMatch(/main benefit or the price/);
  });

  it('"I need know about price": the price from the catalogue, no LLM, no callback', async () => {
    const t = setup([], { recommended: "vital" });
    await t.run("I need know about price");
    expect(t.generate).not.toHaveBeenCalled();
    expect(t.out[0]).toBe(
      "The current price of the Vital plan is ₹999 + GST ₹180 = ₹1,179 monthly or ₹10,000 + GST ₹1,800 = ₹11,800 yearly. Would you like the official plan details or help activating it?",
    );
    expect(t.out.join(" ")).not.toMatch(/precise answer|convenient time/);
    expect(t.conv.state).not.toBe(S.Escalated);
  });

  it('"Yes" to the bot\'s "would you like to know the price now?" gets the price', async () => {
    const t = setup([], { recommended: "vital" });
    lastBot("No problem! The Vital plan helps with consultations. Would you like to know the price now?");
    await t.run("Yes");
    expect(t.generate).not.toHaveBeenCalled();
    expect(t.out[0]).toMatch(/^The current price of the Vital plan is/);
  });

  it("word rules: price questions, ages", () => {
    const { asksPrice, parsePatientAge, isShortYes } = jest.requireActual("@Helper/PlanReplies");
    expect(asksPrice("I need know about price")).toBe(true);
    expect(asksPrice("how much is vital plan")).toBe(true);
    expect(asksPrice("too expensive")).toBe(false);
    expect(asksPrice("is there any charge for this booking")).toBe(false); // the centre's fee, not ours
    expect(asksPrice("price for my parents also?")).toBe(false); // family pricing has its own answer
    expect(parsePatientAge("50+")).toBe(50);
    expect(parsePatientAge("he is 62 years")).toBe(62);
    expect(parsePatientAge("20k")).toBeNull();
    expect(parsePatientAge("not sure")).toBeNull();
    expect(isShortYes("Yes")).toBe(true);
    expect(isShortYes("yes but later")).toBe(false);
  });
});

// Reported 16 Nov afternoon (two test chats): the price reply looping on "yes", the bot taking "GPay", the
// booking stuck asking the specialisation ten times, "1. 2. 3." empty lists, a booking "noted" that was not.
describe("16 Nov test chats: no loops, no false promises", () => {
  const KMCH = { id: "ctrK", name: "KMCH HOSPITAL", branch: "CHITRA", city: "Coimbatore", verified: true, active: true };
  const lastBot = (body: string) =>
    jest
      .spyOn(message, "findOne")
      .mockImplementation((async (o: any) => (o?.where?.reply_to_wa_message_id ? null : { body })) as never);
  const PRICE_Q =
    "The current price of the Vital plan is ₹1,999 + GST ₹360 = ₹2,359 monthly or ₹20,000 + GST ₹3,600 = ₹23,600 yearly. Would you like the official plan details or help activating it?";

  it('"yes" to "plan details or help activating it?" starts the activation, never the price again', async () => {
    const t = setup([], { recommended: "vital" });
    lastBot(PRICE_Q);
    await t.run("yes");
    expect(t.generate).not.toHaveBeenCalled();
    expect(t.out.join(" ")).not.toContain("The current price of the Vital plan is");
    expect(t.conv.pending_action).toMatch(/^send_activation_link:/); // price, GST, renewal shown; link after YES
  });

  it('"Ok" after "… against a plan price of ₹10,000. Would you like the plan details?" = the plan details', async () => {
    const t = setup([], { recommended: "everyday" });
    lastBot("You mentioned a yearly healthcare spend of about ₹3,00,000. As an easy illustration, the Everyday plan could help you save about ₹60,000 a year, against a plan price of ₹10,000 plus GST. Would you like the plan details?");
    await t.run("Ok");
    expect(t.out[0]).toMatch(/^The Everyday plan covers routine OPD visits/);
    expect(t.out[0]).toMatch(/Would you like help activating it\?$/);
  });

  it('"I apoy this plan" = activate; the LLM never asks for a payment method', async () => {
    const t = setup([], { recommended: "everyday" });
    await t.run("I apoy this plan");
    expect(t.generate).not.toHaveBeenCalled();
    expect(t.conv.pending_action).toMatch(/^send_activation_link:/);
    const { draftProblem } = jest.requireActual("./ChatPipeline.service");
    expect(draftProblem("Great choice! Please confirm your preferred payment method so I can assist.", false)).toMatch(/never ask how they will pay/);
    expect(draftProblem("I will now initiate the activation process for the Everyday plan using GPay.", false)).toBeTruthy();
    expect(draftProblem("No problem! Your booking request for tomorrow at 11 AM is noted.", true)).toMatch(/NOT made yet/);
    expect(draftProblem("What specific medicines do they need?", false)).toMatch(/medicines/);
    expect(draftProblem("Oxxy helps with eligible bills.", true)).toBeNull();
  });

  const atSpec = (cn: string, u: boolean) =>
    `booking:${JSON.stringify({ step: "specialisation", c: u ? null : "ctrP", cn, u, ok: true, l: u ? "-" : null })}`;

  it('"Kmch" from the list while the request is for the typed centre: the booking moves to KMCH', async () => {
    const t = setup([], {
      pending: atSpec("Oxxy Healthcare", true),
      needRow: { suggested_centre_ids: ["ctrK"], save: async () => undefined },
      centres: [KMCH],
    });
    await t.run("Kmch");
    expect(t.out[0]).toContain("Done, the booking request is now for KMCH HOSPITAL, CHITRA.");
    expect(t.conv.pending_action).toContain('"c":"ctrK"');
  });

  it('"I don\'t know which doctor": marked not sure, the next step comes (never the same question ten times)', async () => {
    const needRow: Record<string, unknown> = { save: async () => undefined };
    const t = setup([], { pending: atSpec("PSG HOSPITAL, PEELAMEDU", false), needRow, centres: [] });
    await t.run("i do not kow whci doctor could you tell me that");
    expect(t.generate).not.toHaveBeenCalled();
    expect(needRow.specialisation).toBe("Not sure - please advise");
    expect(t.out.join(" ")).toMatch(/the centre will suggest the right doctor/);
    expect(t.out.join(" ")).toMatch(/What date would you prefer\?/);
  });

  it('"Tomorrow 11 am" at the specialisation step: the date rule now, the time kept, never "noted"', async () => {
    const t = setup([], { pending: atSpec("PSG HOSPITAL, PEELAMEDU", false), needRow: { save: async () => undefined } });
    await t.run("Tomorrow 11 am");
    expect(t.out.join(" ")).toMatch(/A booking request needs at least 3 days/);
    expect(t.out.join(" ")).toMatch(/Which doctor specialisation/);
    expect(t.out.join(" ")).not.toMatch(/noted/i);
    expect(t.conv.pending_action).toContain('"t":"11 am"');
  });

  it('a valid early date is kept, so the date is never asked again ("I already said …")', async () => {
    const t = setup([], { pending: atSpec("PSG HOSPITAL, PEELAMEDU", false), needRow: { save: async () => undefined } });
    const d = new Date(Date.now() + 5.5 * 3600000 + 5 * 86400000);
    const dd = `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
    await t.run(`${dd} 11 am`);
    expect(t.out[0]).toMatch(/^Noted /);
    expect(t.conv.pending_action).toContain('"d":"');
  });

  it("no distance given (\"I want the hospital details\"): the list within about 10 km, not the question again", async () => {
    const needRow: Record<string, unknown> = { city: "Coimbatore", locality: "Peelamedu", save: async () => undefined };
    const t = setup([], {
      pending: "centre_radius",
      needRow,
      found: () => [{ id: "ctr9", name: "ABC Hospital", locality: "Peelamedu", city: "Coimbatore", centre_type: "multispeciality", verified: true, active: true }],
    });
    await t.run("what is this i wan the hospital detail");
    expect(t.out[0]).toMatch(/^Here are verified options within about 10 km/);
    expect(t.out[0]).toContain("ABC Hospital");
    expect(needRow.travel_radius_km).toBe(10);
  });

  it('the LLM\'s empty "1. 2. 3." in front of a sentence goes', () => {
    const { withoutEmptyNumbering } = jest.requireActual("@Helper/ReplyTidy");
    expect(withoutEmptyNumbering("1. 2. 3. If yes, please share your preferred date for the check-up.")).toBe(
      "If yes, please share your preferred date for the check-up.",
    );
  });
});

// "ellamae fix pannu" (16 Nov): Tamil / Tanglish words, voice notes and photos, no re-asking known answers
describe("Tamil customers, media, known answers", () => {
  it("Tanglish and typo dates: naalaikku, tmrw, 17 Now", () => {
    const { parseCustomerDate } = jest.requireActual("./BookingFlow");
    const now = new Date("2026-11-16T06:00:00Z");
    expect(parseCustomerDate("naalaikku 11 am", now)).toBe("2026-11-17");
    expect(parseCustomerDate("tmrw", now)).toBe("2026-11-17");
    expect(parseCustomerDate("inniku", now)).toBe("2026-11-16");
    expect(parseCustomerDate("17 Now 2026 11 am", now)).toBe("2026-11-17");
    expect(parseCustomerDate("I am free now", now)).toBeNull();
  });

  it('"ok" stays unclear outside the notice (a Cut Medi Bills question is asked again, never read as yes)', () => {
    const { parseConsentAnswer } = jest.requireActual("./HealthConsent");
    expect(parseConsentAnswer("ok")).toBe("unclear");
    expect(parseConsentAnswer("ok", true)).toBe("yes");
    expect(parseConsentAnswer("aama")).toBe("yes");
    expect(parseConsentAnswer("vendam")).toBe("no");
  });

  it("a voice note gets 'please type', no LLM; a photo is answered and becomes a team task", async () => {
    const t = setup([]);
    await t.run("", undefined, "audio");
    expect(t.out[0]).toMatch(/^Sorry, I cannot listen to voice notes yet/);
    expect(t.generate).not.toHaveBeenCalled();
    const p = setup([]);
    await p.run("", undefined, "image");
    expect(p.out[0]).toMatch(/I have received your file/);
    expect(p.saved.some((r) => /Customer sent a image/.test(String(r.summary)))).toBe(true);
    expect(p.generate).not.toHaveBeenCalled();
  });

  it("the LLM may not ask again what the customer already answered", () => {
    const { asksKnownAgain } = jest.requireActual("./ChatPipeline.service");
    expect(asksKnownAgain("Thanks! Is this for you or a family member?", { beneficiary: "self" })).toMatch(/already known/);
    expect(asksKnownAgain("What specific consultation, test, medicine, treatment, or surgery do you need help with?", { healthcare_need: "blood test" })).toMatch(/already known/);
    expect(asksKnownAgain("Which city and locality do you live in?", { city: "Tiruppur", locality: "Avinashi" })).toMatch(/already known/);
    expect(asksKnownAgain("Which city and locality do you live in?", { city: "Tiruppur" })).toMatch(/only the area or locality in Tiruppur/); // the city is never asked again (client, 17 Nov)
    expect(asksKnownAgain("Which area of Tiruppur do you live in?", { city: "Tiruppur" })).toBeNull(); // the area alone may be asked
    expect(asksKnownAgain("Is this for you or a family member?", {})).toBeNull();
  });
});

// Client, 16 Nov: "first it asked the expenses, then the patient's age; I said 60; again it asked the expenses"
describe("spend -> age -> plan, never the spend twice", () => {
  it("the spend answer is read and kept (even '5000' with no period), then the age, then ONE plan", async () => {
    const needRow: Record<string, unknown> = { save: async () => undefined };
    jest.spyOn(jest.requireActual("@Database/Table/Oxxy/customer").customer, "update").mockResolvedValue({} as never);
    const opts: Record<string, unknown> = {
      pending: "soft_activation",
      planRow: null,
      needRow,
      age: null,
      recommend: { status: "ask_age" },
    };
    const t = setup([], opts);
    await t.run("yes");
    expect(t.out[0]).toMatch(/roughly how much does your family spend on healthcare in a year\?/);
    expect(t.conv.pending_action).toBe("plan_spend:activate"); // asked because the customer wants to activate

    t.out.length = 0;
    await t.run("5000");
    expect(needRow.annual_medical_spend).toBe(5000);
    expect(t.out[0]).toBe("To suggest the right plan, may I know the patient's age?");
    expect(t.conv.pending_action).toBe("plan_age:activate");

    t.out.length = 0;
    opts.recommend = { status: "not_worth_it", plan: "everyday", price: 10000, spend: 5000 };
    await t.run("60");
    expect(t.out).toHaveLength(1);
    expect(t.out[0]).toMatch(/^Based on what you shared, the Everyday plan fits best/);
    expect(t.out.join(" ")).not.toMatch(/how much does your family spend/);
    expect(t.generate).not.toHaveBeenCalled();
  });

  it("spend answers people actually type", () => {
    const { spendAnswer, asksSpend } = jest.requireActual("@Helper/PlanReplies");
    expect(spendAnswer("5000")).toBe(5000);
    expect(spendAnswer("5k")).toBe(5000);
    expect(spendAnswer("monthly 5000")).toBe(60000);
    expect(spendAnswer("5000 per month")).toBe(60000);
    expect(spendAnswer("2 lakh")).toBe(200000);
    expect(spendAnswer("more than one lakh")).toBe(100000);
    expect(spendAnswer("3 lacks")).toBe(300000);
    expect(spendAnswer("about 17500 a year")).toBe(17500);
    expect(spendAnswer("60")).toBeNull(); // an age, not money
    expect(spendAnswer("how much is the plan?")).toBeNull();
    expect(asksSpend("Happy to help. Roughly how much does your family spend on healthcare in a year?")).toBe(true);
    expect(asksSpend("What are your monthly medical expenses?")).toBe(true); // the client saw this wording
    expect(asksSpend("How much do you spend on medicines every month?")).toBe(true);
  });
});

// Client feedback, 17 Nov 2026
describe("17 Nov client feedback", () => {
  const twoCentres = [
    { id: "k1", name: "KMCH", branch: "Peelamedu", locality: "Peelamedu", city: "Coimbatore", verified: true, active: true },
    { id: "p1", name: "PSG Hospitals", branch: "Avinashi Road", locality: "Peelamedu", city: "Coimbatore", verified: true, active: true },
  ];

  it("the centre typed by name and branch after the list is picked: the booking starts, no list again", async () => {
    const t = setup([], {
      pending: "centre_pick",
      centres: twoCentres,
      needRow: { suggested_centre_ids: ["p1", "k1"], save: async () => undefined },
    });
    await t.run("KMCH Peelamedu");
    expect(t.generate).not.toHaveBeenCalled();
    expect(t.out.join("\n")).toMatch(/KMCH, Peelamedu/);
    expect(t.out.join("\n")).not.toMatch(/Reply with 1/); // not the list again
  });

  it("'the second one' picks the second centre; two centres with the same name word ask for the number", async () => {
    const t = setup([], {
      pending: "centre_pick",
      centres: twoCentres,
      needRow: { suggested_centre_ids: ["p1", "k1"], save: async () => undefined },
    });
    await t.run("the second one");
    expect(t.out.join("\n")).toMatch(/KMCH, Peelamedu/);

    const { pickFromList } = jest.requireActual("@Helper/CentreReplies");
    const apollos = [
      { name: "Apollo Clinic", branch: "Anna Nagar", locality: "Anna Nagar" },
      { name: "Apollo Clinic", branch: "T Nagar", locality: "T Nagar" },
    ];
    expect(pickFromList("apollo", apollos)).toBe("tie");
    expect(pickFromList("Apollo T Nagar", apollos)).toBe(1);
    expect(pickFromList("anna nagar", apollos)).toBeNull(); // the place alone may be a new area
    expect(pickFromList("which one is cheaper?", apollos)).toBeNull();
    expect(pickFromList("2", apollos)).toBe(1);
    expect(pickFromList("7", apollos)).toBeNull();
  });

  it("the centre list shows the names once: in the rows, not again in the text", () => {
    const { interactiveFor } = jest.requireActual("@Helper/Choices");
    const text =
      "Based on the patient's area, here are suitable options:\n" +
      "1. Kovai Medical Center and Hospital, Avinashi Road - Peelamedu | Multispeciality | about 2.3 km\n" +
      "2. PSG Hospitals - Peelamedu | Multispeciality\n" +
      "I found only 2 verified option(s) in that area.\n\n" +
      "I have included specialist and multispeciality choices where relevant. Reply with 1 or 2, or send the name of another centre you prefer.";
    const m = interactiveFor(text);
    expect(m.kind).toBe("list");
    expect(m.body).not.toMatch(/Kovai|PSG/);
    expect(m.body).toMatch(/^Based on the patient's area/);
    expect(m.body).toMatch(/Reply with 1 or 2/);
    expect(m.rows[0]).toEqual({
      id: "1",
      title: "Kovai Medical Center an…",
      description: "Avinashi Road - Peelamedu | Multispeciality | about 2.3 km", // too long with the full name
    });
    expect(m.rows[1]).toEqual({ id: "2", title: "PSG Hospitals", description: "Peelamedu | Multispeciality" });
    const long = interactiveFor(text.replace(" | Multispeciality | about 2.3 km", ""));
    expect(long.rows[0].description).toBe("Kovai Medical Center and Hospital | Avinashi Road - Peelamedu");
    expect(m.log).toBe(text); // the chat history keeps the full list
  });

  it("'activate' -> spend -> age -> plan: the activation step follows at once, not 'Would you like the plan details?'", async () => {
    const needRow: Record<string, unknown> = { save: async () => undefined };
    jest.spyOn(jest.requireActual("@Database/Table/Oxxy/customer").customer, "update").mockResolvedValue({} as never);
    const opts: Record<string, unknown> = {
      pending: "soft_activation",
      needRow,
      age: null,
      recommend: { status: "ask_age" },
    };
    const t = setup([], opts);
    await t.run("yes");
    await t.run("50000");
    expect(t.conv.pending_action).toBe("plan_age:activate");
    t.out.length = 0;
    opts.recommend = { status: "recommend", plan: "everyday", saving: 12000, price: 10000, rate: 20 };
    await t.run("45");
    const text = t.out.join("\n\n");
    expect(text).toContain("I recommend the Everyday plan");
    expect(text).not.toMatch(/Would you like the plan details/);
    expect(text).toMatch(/Shall I send the official secure activation link\? Reply YES or NO\.$/);
    expect(t.conv.pending_action).toBe("send_activation_link:cat-everyday-y");
    expect(t.generate).not.toHaveBeenCalled();
  });

  it("'activate' read by the LLM with the spend known: the plan and the activation step in one reply", async () => {
    const t = setup([draft("Sure, let me help you activate.", { intent: "activate" })], {
      recommend: { status: "recommend", plan: "everyday", saving: 12000, price: 10000, rate: 20 },
      needRow: { annual_medical_spend: 60000, healthcare_need: "check-ups", save: async () => undefined },
    });
    await t.run("I want to activate");
    const text = t.out.join("\n\n");
    expect(text).toContain("I recommend the Everyday plan");
    expect(text).not.toMatch(/Would you like the plan details/);
    expect(text).toMatch(/Shall I send the official secure activation link\?/);
    expect(t.conv.pending_action).toBe("send_activation_link:cat-everyday-y");
  });

  it("the spend is known: the LLM may not ask the expenses again in any wording; its own age question is read", async () => {
    const { asksKnownAgain, asksAge } = jest.requireActual("./ChatPipeline.service");
    const known = { annual_medical_spend: 50000 };
    expect(asksKnownAgain("Thanks! What are your monthly medical expenses?", known)).toMatch(/already known/);
    expect(asksKnownAgain("Could you share your yearly healthcare expenses?", known)).toMatch(/already known/);
    expect(asksKnownAgain("Could you share your yearly healthcare expenses?", {})).toBeNull();
    expect(asksAge("Thanks. May I know the patient's age?")).toBe(true);
    expect(asksAge("How old is your mother?")).toBe(true);
    expect(asksAge("Which city do you live in?")).toBe(false);

    const t = setup([draft("Thanks for sharing. May I know the patient's age?", { intent: "collect_needs" })], {
      needRow: { annual_medical_spend: 50000, save: async () => undefined },
      age: null,
    });
    await t.run("for my mother");
    expect(t.conv.pending_action).toBe("plan_age"); // the next "62" picks the plan, the spend is not asked again
  });
});

// Client feedback, 17 Nov 2026 (second list)
describe("17 Nov client feedback, second list", () => {
  it("1. one callback per chat: a time already chosen stands, same time and reference, no new options", async () => {
    const t = setup([draft("I am not sure about that.", { needs_human: true })]);
    const from = new Date(Date.now() + 3 * 3600 * 1000);
    jest.spyOn(task, "find").mockResolvedValue([
      { id: "1a1b5949-0000-4000-8000-000000000000", callback_from: from, callback_to: new Date(from.getTime() + 7200000), task_status: "open" },
    ] as never);
    await t.run("my uncle wants something special arranged");
    const text = t.out.join("\n\n");
    expect(text).toContain("CB-1A1B5949");
    expect(text).not.toContain("Please choose a convenient time");
  });

  it("6. 'I want to discuss this with my family' at the activation question: the summary and a follow-up time, not the next step", async () => {
    const t = setup([], { pending: "send_activation_link:cat-everyday-y", recommended: "everyday" });
    await t.run("I want to discuss this with my family");
    const text = t.out.join("\n\n");
    expect(text).toContain("Here is a concise summary for your discussion");
    expect(text).not.toMatch(/official secure activation link/);
    expect(t.generate).not.toHaveBeenCalled();
    const { detectObjection } = jest.requireActual("./RecoveryFlow");
    expect(detectObjection("family kitta pesitu solren")).toBe("family");
    expect(detectObjection("I will consult my husband first")).toBe("family");
    expect(detectObjection("ghar pe baat karke batata hoon")).toBe("family");
    expect(detectObjection("I need some time")).toBe("think");
  });

  it("4. 'ok thank you' at the end: the details summary (plan and price) once, then 'message here any time'", async () => {
    const t = setup([], { recommended: "everyday", needRow: { beneficiary: "mother", city: "Coimbatore", locality: "Peelamedu", save: async () => undefined } });
    await t.run("ok thank you");
    const text = t.out.join("\n\n");
    expect(text).toMatch(/^Thank you\. Here is a summary of our chat:/);
    expect(text).toContain("For: mother. Area: Peelamedu, Coimbatore.");
    expect(text).toContain("Price: ₹999 + GST ₹180 = ₹1,179 monthly or ₹10,000 + GST ₹1,800 = ₹11,800 yearly.");
    expect(text).toContain("You may message Oxxy whenever healthcare support is needed.");
    expect(t.generate).not.toHaveBeenCalled();
    const { isClosingMessage } = jest.requireActual("./ChatPipeline.service");
    expect(isClosingMessage("Thanks")).toBe(true);
    expect(isClosingMessage("ok bye")).toBe(true);
    expect(isClosingMessage("romba nandri")).toBe(true);
    expect(isClosingMessage("thanks, what is the price?")).toBe(false);
    expect(isClosingMessage("I want to book")).toBe(false);
  });

  it("2. after the activation was declined, a draft offering it again is not sent", async () => {
    const t = setup([
      draft("You're welcome! Would you like to activate the Everyday plan now?"),
      draft("You're welcome! Shall I send the activation link?"),
    ], { recommended: "everyday" });
    (t.conv as Record<string, unknown>).outcome = "activation_declined";
    await t.run("can you tell me about dental care near me");
    const text = t.out.join("\n\n");
    expect(text).toContain("You're welcome!");
    expect(text).not.toMatch(/activat|activation link/i);
    expect(String((t.generate.mock.calls[1] as unknown[])[2])).toMatch(/do not offer the activation/);
    const { repitchProblem } = jest.requireActual("./ChatPipeline.service");
    expect(repitchProblem("Would you like to activate it?", "declined", "what is the price?")).toBeNull(); // they asked
    expect(repitchProblem("Would you like to activate it?", null, "hi")).toBeNull(); // nothing settled
  });

  it("3. 'activate' with the spend already known: never the spend question again", async () => {
    const t = setup([], {
      pending: "soft_activation",
      needRow: { annual_medical_spend: 50000, save: async () => undefined },
      recommend: { status: "recommend", plan: "everyday", saving: 12000, price: 10000, rate: 20 },
    });
    await t.run("yes");
    const text = t.out.join("\n\n");
    expect(text).not.toMatch(/how much does your family spend/);
    expect(text).toContain("I recommend the Everyday plan");
    expect(text).toMatch(/Shall I send the official secure activation link\?/);
  });
});
