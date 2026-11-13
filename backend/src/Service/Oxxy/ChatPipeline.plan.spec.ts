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
  LINK_DECLINED,
} from "@Helper/PlanReplies";
import { message } from "@Database/Table/Oxxy/message";
import { consent } from "@Database/Table/Oxxy/consent";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { need } from "@Database/Table/Oxxy/need";
import { task } from "@Database/Table/Oxxy/task";
import { booking_request } from "@Database/Table/Oxxy/booking_request";
import { activation } from "@Database/Table/Oxxy/activation";
import { plan_catalog } from "@Database/Table/Oxxy/plan_catalog";

type Fn = (...a: unknown[]) => unknown;
const stub = (cls: unknown, name: string, impl: Fn) =>
  jest.spyOn(cls as Record<string, Fn>, name).mockImplementation(impl);

const everydayYearly = {
  id: "cat-everyday-y",
  product: "oxxy",
  plan: "everyday",
  billing: "yearly",
  price: 10000,
  version: 1,
  renewal_terms: "[CONFIRM] renewal terms",
  activation_time: "[CONFIRM] activation time",
  activation_link: "https://example.com/oxxy/activate/everyday-yearly",
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
    selected_product: opts.recommended ? "oxxy" : (null as string | null),
    recommended_plan: opts.recommended ?? (null as string | null),
    pending_action: opts.pending ?? (null as string | null),
  };
  const out: string[] = [];
  const saved: Record<string, unknown>[] = [];
  const send = jest.fn(async (...a: unknown[]) => {
    out.push(String((a[1] as { body: string }).body));
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

  stub(message, "findOne", async () => null);
  stub(message, "find", async () => []);
  stub(consent, "findOne", async () => cons);
  stub(conversation, "update", async () => undefined);
  stub(task, "findOne", async () => null);
  stub(booking_request, "findOne", async () => null);
  stub(activation, "findOne", async () => null);
  stub(plan_catalog, "find", async () => []);
  stub(plan_catalog, "findOne", async () => everydayYearly);
  jest.spyOn(need, "findOne").mockResolvedValue((opts.needRow ?? null) as never);
  jest
    .spyOn(need, "create")
    .mockImplementation(((v: object) => ({ ...v, save: async () => undefined })) as never);

  const pipeline = new ChatPipelineService(
    new GuardrailService(),
    { generate } as never,
    new ReplyValidatorService(),
    { send } as never,
    {
      recommend: async () => opts.recommend ?? null,
      prices: async () => ({ monthly: 999, yearly: 10000 }),
    } as never,
    { search: async () => [] } as never,
    {} as never,
    {} as never,
    { transaction: async (fn: Fn) => fn(mg) } as never,
    { enqueue, dispatch: jest.fn() } as never,
    { transition } as never,
  );
  const s = {
    customer: {
      id: "c1",
      language: "en",
      active_product: null,
      age: opts.age === undefined ? 40 : opts.age,
      save: async () => undefined,
    },
    conversation: conv,
  } as never;
  const run = (text: string) =>
    pipeline.process({ waNumber: "919800000001", waMessageId: "wamid.IN1", text }, s);
  return { run, out, generate, conv, saved, enqueue, mg };
}

afterEach(() => jest.restoreAllMocks());

describe("plan choice (12.3)", () => {
  const spendNeed = { annual_medical_spend: 60000, healthcare_need: "routine check-up" };

  it("asks the age before naming any plan", async () => {
    const t = setup([draft("Thanks for sharing.", { intent: "recommend" })], {
      recommend: { status: "ask_age" },
      needRow: spendNeed,
      age: null,
    });
    await t.run("we spend about 60000 a year");
    expect(t.out[0]).toContain(ASK_AGE);
    expect(t.out[0]).not.toMatch(/₹/);
  });

  it("shows the prices and the easy illustration from the catalog", async () => {
    const t = setup([draft("Thanks for sharing.", { intent: "recommend" })], {
      recommend: { status: "recommend", plan: "everyday", saving: 12000, price: 10000, rate: 20 },
      needRow: spendNeed,
    });
    await t.run("we spend about 60000 a year");
    expect(t.out[0]).toContain("I recommend the Everyday plan");
    expect(t.out[0]).toContain("₹999 monthly or ₹10,000 yearly plus applicable GST");
    expect(t.out[0]).toContain(
      "save about ₹12,000 a year, against a plan price of ₹10,000 plus GST",
    );
    expect(t.conv.recommended_plan).toBe("everyday");
  });

  it("gives the honest answer when no plan pays for itself", async () => {
    const t = setup([draft("Thanks.", { intent: "recommend" })], {
      recommend: { status: "not_worth_it", plan: "everyday", price: 10000, spend: 15000 },
      needRow: { annual_medical_spend: 15000, healthcare_need: "fever" },
    });
    await t.run("about 15000 a year");
    expect(t.out[0]).toContain("may not pay for itself in savings alone");
    expect(t.out[0]).not.toMatch(/save about/);
  });
});

describe("insurance questions get the approved fixed answer, never a Claude draft", () => {
  it("Trigger B: is Oxxy insurance?", async () => {
    const t = setup([]);
    await t.run("Is Oxxy insurance?");
    expect(t.out).toEqual([INSURANCE_ANSWER]);
    expect(t.generate).not.toHaveBeenCalled();
  });
  it("Trigger J: the customer has insurance", async () => {
    const t = setup([]);
    await t.run("My father has health insurance for this surgery");
    expect(t.out).toEqual([INSURANCE_COORDINATION]);
  });
});

describe("centre search (12.4)", () => {
  it("asks for the city instead of listing centres from anywhere", async () => {
    const t = setup([draft("Let me find centres.", { intent: "find_centre" })]);
    await t.run("find a hospital");
    expect(t.out[0]).toContain(ASK_CITY);
  });
});

describe("activation (12.5): disclosure first, link only after YES", () => {
  it("shows price, GST, renewal and asks before sending any link", async () => {
    const t = setup([draft("Sure.", { intent: "activate" })], {
      state: S.PlanFit,
      recommended: "everyday",
    });
    await t.run("I want to activate");
    expect(t.out[0]).toContain("Price: ₹10,000 yearly plus applicable GST");
    expect(t.out[0]).toContain("Renewal:");
    expect(t.out[0]).toContain("Shall I send the official secure activation link?");
    expect(t.out[0]).not.toContain("https://");
    expect(t.conv.pending_action).toBe("send_activation_link:cat-everyday-y");
  });

  it("YES sends only that product's official link and records the activation", async () => {
    const t = setup([], {
      state: S.Activation,
      recommended: "everyday",
      pending: "send_activation_link:cat-everyday-y",
    });
    await t.run("yes");
    expect(t.out[0]).toContain(everydayYearly.activation_link);
    expect(t.saved.some((r) => r.activation_status === "link_sent" && r.plan === "everyday")).toBe(
      true,
    );
    expect(t.conv.state).toBe(S.AwaitingPayment);
    expect(t.mg.update).toHaveBeenCalled(); // an earlier unpaid link is cancelled first
    expect(t.generate).not.toHaveBeenCalled();
  });

  it("NO sends no link", async () => {
    const t = setup([], {
      state: S.Activation,
      recommended: "everyday",
      pending: "send_activation_link:cat-everyday-y",
    });
    await t.run("no");
    expect(t.out).toEqual([LINK_DECLINED]);
    expect(t.saved.length).toBe(0);
  });
});
