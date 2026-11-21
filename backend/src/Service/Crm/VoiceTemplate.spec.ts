// The client's voice-call templates (21 Nov): during the call the voice agent sends oxxy_verification_links or
// plan_recommendation_status (POST /Actions/SendTemplate). Word for word as the client made them; checked like
// every send; what the agent fills in is checked too.
import { BotActionsService } from "./BotActions.service";
import { customer } from "@Database/Table/Oxxy/customer";
import { consent } from "@Database/Table/Oxxy/consent";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { need } from "@Database/Table/Oxxy/need";
import { message } from "@Database/Table/Oxxy/message";
import { trigger_event } from "@Database/Table/Oxxy/trigger_event";
import { DateWindowService } from "@Service/Oxxy/DateWindow.service";
import { metaTemplateBody, TEMPLATES } from "@Helper/TemplateDefinitions";
import { buildPayload, validateMessage } from "@Service/Oxxy/WhatsappPayload";
import {
  badParam,
  isNewsTap,
  isPlanLinkTap,
  pendingVoicePlan,
  readPlanName,
  voiceTemplateParams,
  wantsPlanLink,
} from "@Service/Oxxy/VoiceTemplates";

const C = "11111111-2222-4333-8444-555555555555";
const DAY = new Date("2026-11-21T06:00:00Z"); // 11:30 IST
const NIGHT = new Date("2026-11-21T17:00:00Z"); // 22:30 IST
const LOGO = "https://oxxy.example/oxxy-logo.png";
const PLAN_BODY = {
  wa_number: "9840012345",
  template: "plan_recommendation_status",
  params: { customer_name: "Priya", requirement: "OPD consultations for your parents", plan: "Vital", reason: "it covers members up to 75 years." },
  whatsapp_consent: true,
  consent_source: "voice_call",
  call_id: "call_1",
};

function setup(opts: { conv?: Record<string, unknown>; found?: boolean; cons?: Record<string, unknown>; recent?: boolean; at?: Date } = {}) {
  jest.useFakeTimers().setSystemTime(opts.at ?? DAY);
  process.env.OXXY_WELCOME_IMAGE_URL = LOGO;
  const c = { id: C, wa_number: "919840012345", first_name: "Priya", language: "en", active_product: null };
  jest.spyOn(customer, "findOne").mockResolvedValue((opts.found === false ? null : c) as never);
  const custSave = jest.spyOn(customer, "save").mockResolvedValue(c as never);
  jest.spyOn(customer, "create").mockImplementation(((v: unknown) => v) as never);
  jest.spyOn(customer, "update").mockResolvedValue({} as never);
  const consSave = jest.fn(async () => undefined);
  jest.spyOn(consent, "findOne").mockResolvedValue({ save: consSave, ...(opts.cons ?? {}) } as never);
  const convSave = jest.spyOn(conversation, "save").mockImplementation((async (v: unknown) => v) as never);
  const convUpdate = jest.spyOn(conversation, "update").mockResolvedValue({} as never);
  jest.spyOn(need, "findOne").mockResolvedValue(null);
  jest.spyOn(need, "create").mockImplementation(((v: unknown) => ({ ...(v as object) })) as never);
  jest.spyOn(need, "save").mockImplementation((async (v: unknown) => v) as never);
  const msgFind = jest
    .spyOn(message, "findOne")
    .mockResolvedValue((opts.recent ? { wa_message_id: "wamid.old" } : null) as never);
  jest.spyOn(trigger_event, "findOne").mockResolvedValue(null);
  jest.spyOn(trigger_event, "create").mockImplementation(((v: unknown) => v) as never);
  const trig = jest.spyOn(trigger_event, "save").mockImplementation((async (v: unknown) => v) as never);
  const theConv = { id: "v1", state: "new", pending_action: null, last_customer_message_at: null, selected_product: null, ...opts.conv };
  const transition = jest.fn(async (_id: string, to: string) => ({ state: to }));
  const outbox = { emit: jest.fn(async () => undefined) };
  const wa = { send: jest.fn(async () => "wamid.1") };
  const svc = new BotActionsService(
    {} as never,
    outbox as never,
    { findOpenByCustomer: async () => theConv, openNew: async () => theConv, transition } as never,
    {} as never,
    {} as never,
    new DateWindowService(),
    {} as never,
    wa as never,
  );
  return { svc, wa, outbox, convSave, convUpdate, consSave, custSave, msgFind, trig, transition, theConv };
}

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  delete process.env.OXXY_WELCOME_IMAGE_URL;
});

describe("the client's two templates, word for word", () => {
  const t = (n: string) => TEMPLATES.find((x) => x.name === n)!;

  it("oxxy_verification_links: UTILITY, body 191 characters, URL buttons before the quick reply", () => {
    const v = t("oxxy_verification_links");
    expect(v.category).toBe("UTILITY");
    expect(v.body.length).toBe(191);
    expect(v.headerImage).toBeUndefined();
    const b = metaTemplateBody(v).components.find((x: any) => x.type === "BUTTONS") as any;
    expect(b.buttons).toEqual([
      { type: "URL", text: "Customer testimonials", url: "https://www.oxxy.in/customer_stories" },
      { type: "URL", text: "View Policies", url: "https://www.oxxy.in/policies" },
      { type: "QUICK_REPLY", text: "News Articles" },
    ]);
  });

  it("plan_recommendation_status: UTILITY, logo header, body 279 characters, 4 variables", () => {
    const p = t("plan_recommendation_status");
    expect(p.category).toBe("UTILITY");
    expect(p.body.length).toBe(279);
    expect(p.headerImage).toBeDefined();
    expect(p.examples).toHaveLength(4);
    const body = metaTemplateBody(p, "HANDLE");
    expect(body.components[0]).toMatchObject({ type: "HEADER", format: "IMAGE" });
    const b = body.components.find((x: any) => x.type === "BUTTONS") as any;
    expect(b.buttons).toEqual([
      { type: "URL", text: "Website", url: "http://www.oxxy.in/" },
      { type: "QUICK_REPLY", text: "https://www.oxxy.in/#plan" },
    ]);
  });

  it("the older templates keep quick replies first", () => {
    const b = metaTemplateBody(t("oxxy_verify_services"), "H").components.find((x: any) => x.type === "BUTTONS") as any;
    expect(b.buttons[0].type).toBe("QUICK_REPLY");
  });

  it("a template send carries the header picture and the body values", () => {
    const m = { kind: "template" as const, name: "plan_recommendation_status", languageCode: "en", params: ["a", "b", "c", "d"], headerImage: LOGO };
    validateMessage(m);
    expect((buildPayload("91", m) as any).template.components).toEqual([
      { type: "header", parameters: [{ type: "image", image: { link: LOGO } }] },
      { type: "body", parameters: ["a", "b", "c", "d"].map((text) => ({ type: "text", text })) },
    ]);
    expect(() => validateMessage({ ...m, headerImage: "http://x/y.png" })).toThrow(/https/);
    // no header, no params: as before
    expect((buildPayload("91", { kind: "template", name: "x", languageCode: "en" }) as any).template.components).toBeUndefined();
  });
});

describe("what the voice agent fills in", () => {
  it("plan names", () => {
    expect(readPlanName("Vital")).toBe("vital");
    expect(readPlanName("oxxy infinity plan")).toBe("infinity");
    expect(readPlanName("gold")).toBeNull();
    expect(readPlanName("Vital at Rs 999")).toBeNull();
  });

  it("no price, guarantee, address or Meta-breaking text", () => {
    expect(badParam("it covers members up to 75 years", 200)).toBeNull();
    expect(badParam("it costs ₹999 a month", 200)).toMatch(/price/);
    expect(badParam("only Rs 999", 200)).toMatch(/price/);
    expect(badParam("guaranteed savings", 200)).toMatch(/guarantee/);
    expect(badParam("see www.oxxy.in", 200)).toMatch(/web address/);
    expect(badParam("line one\nline two", 200)).toMatch(/new line/);
    expect(badParam("", 200)).toMatch(/empty/);
  });

  it("the four body values in order; the name falls back to what we have, then 'there'", () => {
    expect(voiceTemplateParams("plan_recommendation_status", PLAN_BODY.params, null)).toEqual({
      params: ["Priya", "OPD consultations for your parents", "Oxxy Vital", "it covers members up to 75 years"],
      plan: "vital",
    });
    expect(voiceTemplateParams("oxxy_verification_links", {}, null)).toEqual({ params: ["there"], plan: null });
    expect(voiceTemplateParams("oxxy_verification_links", {}, "Ravi")).toEqual({ params: ["Ravi"], plan: null });
    const bad = voiceTemplateParams("plan_recommendation_status", { plan: "gold", requirement: "x", reason: "₹500 off" }, null);
    expect((bad as any).problems).toEqual(expect.arrayContaining([expect.stringMatching(/plan must be/), expect.stringMatching(/reason has a price/)]));
  });
});

describe("POST /Actions/SendTemplate during the call", () => {
  it("plan template: sent at once with the logo, the plan saved, a 'yes' waits for the link step, no first cards", async () => {
    const { svc, wa, convSave, convUpdate, consSave, transition, outbox, trig } = setup();
    const r = await svc.sendVoiceTemplate(PLAN_BODY);
    expect(r).toMatchObject({ status: "sent", template: "plan_recommendation_status", wa_message_id: "wamid.1", recommended_plan: "vital" });
    expect(wa.send).toHaveBeenCalledWith(
      C,
      expect.objectContaining({
        kind: "template",
        name: "plan_recommendation_status",
        languageCode: "en",
        params: ["Priya", "OPD consultations for your parents", "Oxxy Vital", "it covers members up to 75 years"],
        headerImage: LOGO,
        log: expect.stringContaining("recommended option for you is Oxxy Vital because it covers members up to 75 years."),
      }),
      "reply",
    );
    expect(consSave).toHaveBeenCalled();
    // call context on the chat: no 60-second call, and the chat knows the plan
    expect(convSave).toHaveBeenCalledWith(
      expect.objectContaining({ call_context: expect.stringContaining("plan details"), selected_product: "oxxy", recommended_plan: "vital" }),
    );
    expect(convUpdate).toHaveBeenCalledWith("v1", expect.objectContaining({ pending_action: "voice_plan:vital" }));
    expect(transition).toHaveBeenCalledWith("v1", "intent_menu", expect.anything());
    expect(trig).toHaveBeenCalledWith(expect.objectContaining({ trigger_id: "VT" }));
    expect(outbox.emit).toHaveBeenCalledWith("log_event", C, expect.objectContaining({ event: "voice_template_sent", call_id: "call_1" }));
  });

  it("verification links: no header, the name we know", async () => {
    const { svc, wa, convUpdate } = setup();
    await svc.sendVoiceTemplate({ wa_number: "9840012345", template: "oxxy_verification_links", whatsapp_consent: true, consent_source: "voice_call" });
    expect(wa.send).toHaveBeenCalledWith(
      C,
      expect.objectContaining({ name: "oxxy_verification_links", params: ["Priya"] }),
      "reply",
    );
    expect((wa.send.mock.calls[0] as any[])[1].headerImage).toBeUndefined();
    expect(convUpdate).not.toHaveBeenCalledWith("v1", expect.objectContaining({ pending_action: expect.anything() }));
  });

  it("a new number becomes a customer", async () => {
    const { svc, custSave } = setup({ found: false });
    await svc.sendVoiceTemplate({ ...PLAN_BODY, first_name: "Priya" });
    expect(custSave).toHaveBeenCalledWith(expect.objectContaining({ wa_number: "919840012345", first_name: "Priya" }));
  });

  it("a chat in the middle of another step keeps its step", async () => {
    const { svc, convUpdate } = setup({ conv: { state: "intent_menu", pending_action: "bill_amount" } });
    await svc.sendVoiceTemplate(PLAN_BODY);
    expect(convUpdate).not.toHaveBeenCalledWith("v1", expect.objectContaining({ pending_action: expect.anything() }));
  });

  it("refused: unknown template, no consent, bad params, opted out, privacy, safety pause, repeat", async () => {
    const code = async (p: Promise<unknown>) => {
      try {
        await p;
        return "sent";
      } catch (e: any) {
        return `${e.getStatus()} ${e.getResponse().code}`;
      }
    };
    let t = setup();
    expect(await code(t.svc.sendVoiceTemplate({ ...PLAN_BODY, template: "lead_intro" }))).toBe("400 unknown_template");
    expect(await code(t.svc.sendVoiceTemplate({ ...PLAN_BODY, whatsapp_consent: false }))).toBe("400 consent_required");
    expect(await code(t.svc.sendVoiceTemplate({ ...PLAN_BODY, params: { ...PLAN_BODY.params, reason: "only ₹999" } }))).toBe("422 invalid_params");
    jest.restoreAllMocks();
    t = setup({ cons: { opt_out_at: new Date() } });
    expect(await code(t.svc.sendVoiceTemplate(PLAN_BODY))).toBe("403 opted_out");
    jest.restoreAllMocks();
    t = setup({ cons: { privacy_request_at: new Date() } });
    expect(await code(t.svc.sendVoiceTemplate(PLAN_BODY))).toBe("403 privacy_request_open");
    jest.restoreAllMocks();
    t = setup({ conv: { state: "pause" } });
    expect(await code(t.svc.sendVoiceTemplate(PLAN_BODY))).toBe("409 safety_event_open");
    jest.restoreAllMocks();
    t = setup({ recent: true });
    expect(await code(t.svc.sendVoiceTemplate(PLAN_BODY))).toBe("409 duplicate");
    expect(t.wa.send).not.toHaveBeenCalled();
  });

  it("a call at night still gets it: the customer asked on the call (sent as a reply, no blackout)", async () => {
    const t = setup({ at: NIGHT });
    await expect(t.svc.sendVoiceTemplate(PLAN_BODY)).resolves.toMatchObject({ status: "sent" });
    expect((t.wa.send.mock.calls[0] as any[])[2]).toBe("reply");
  });

  it("the plan template needs the public logo address", async () => {
    const t = setup();
    delete process.env.OXXY_WELCOME_IMAGE_URL;
    await expect(t.svc.sendVoiceTemplate(PLAN_BODY)).rejects.toMatchObject({ response: expect.objectContaining({ code: "not_configured" }) });
  });
});

describe("the customer's replies", () => {
  it("quick replies and a 'yes'", () => {
    expect(isPlanLinkTap("https://www.oxxy.in/#plan")).toBe(true);
    expect(isPlanLinkTap("www.oxxy.in/#plan")).toBe(true);
    expect(isPlanLinkTap("https://www.oxxy.in/")).toBe(false);
    expect(isNewsTap("News Articles")).toBe(true);
    expect(isNewsTap("show me news articles about oxxy")).toBe(false);
    for (const y of ["Yes", "yes please", "Please share the link", "send link", "ok", "go ahead"]) expect(wantsPlanLink(y)).toBe(true);
    for (const n of ["No", "not now", "what is the price?", "yes but is it insurance?", "later"]) expect(wantsPlanLink(n)).toBe(false);
    expect(pendingVoicePlan("voice_plan:vital")).toBe("vital");
    expect(pendingVoicePlan("voice_plan:gold")).toBeNull();
    expect(pendingVoicePlan("bill_plan")).toBeNull();
  });
});
