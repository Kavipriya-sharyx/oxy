// Client sequences 2 and 3 (20 Nov): the "Why Overpay" first card and the "Book Appointment" booking, through the
// real pipeline (centre search, Google Maps, booking service and CRM outbox mocked).
import { ChatPipelineService } from "./ChatPipeline.service";
import { GuardrailService } from "./Guardrail.service";
import { assertTransition } from "./ConversationStateMachine";
import { ConversationState as S } from "@Helper/Enum/ConversationState";
import { NOTICE_VERSION } from "@Helper/FixedReplies";
import { DateWindowService } from "./DateWindow.service";
import { OVERPAY_CARD_TEXT } from "./BookCard";
import { BILL_CARD_TEXT } from "./BillCard";
import { message } from "@Database/Table/Oxxy/message";
import { consent } from "@Database/Table/Oxxy/consent";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { need } from "@Database/Table/Oxxy/need";
import { task } from "@Database/Table/Oxxy/task";
import { booking_request } from "@Database/Table/Oxxy/booking_request";
import { activation } from "@Database/Table/Oxxy/activation";
import { centre } from "@Database/Table/Oxxy/centre";
import { plan_catalog } from "@Database/Table/Oxxy/plan_catalog";
import { trigger_event } from "@Database/Table/Oxxy/trigger_event";

type Fn = (...a: unknown[]) => unknown;
const stub = (cls: unknown, name: string, impl: Fn) =>
  jest.spyOn(cls as Record<string, Fn>, name).mockImplementation(impl);

const PARTNER = {
  id: "ctr-1",
  name: "Moolchand Hospital",
  branch: null,
  locality: "Lajpat Nagar",
  city: "New Delhi",
  verified: true,
};

function setup(
  opts: { state?: S; maps?: boolean; callContext?: string; consented?: boolean } = {},
) {
  const cons = {
    opt_out_at: null,
    whatsapp_consent: false,
    health_data_consent: opts.consented ?? true,
    notice_version: (opts.consented ?? true) ? NOTICE_VERSION : null,
    consent_timestamp: (opts.consented ?? true) ? new Date() : null,
    consent_source: null as string | null,
    health_refused_at: null,
    health_refused_version: null,
    notice_sent_at: null,
    notice_sent_version: null,
  };
  const conv: Record<string, unknown> = {
    id: "v1",
    state: opts.state ?? S.New,
    pending_action: null,
    call_context: opts.callContext ?? null,
  };
  const out: Record<string, unknown>[] = [];
  const send = jest.fn(async (...a: unknown[]) => {
    const msg = a[1] as { kind: string; body: string };
    out.push({ direction: "out", reply_to_wa_message_id: a[3], text: msg.body, msg });
    return "wamid.OUT";
  });
  const generate = jest.fn(async () => ({
    reply_text: "Sure.",
    intent: "other",
    extracted_fields: {},
    needs_human: false,
  }));
  const transition = jest.fn(async (_id: unknown, to: unknown) => {
    assertTransition(conv.state as string, to as string);
    conv.state = to as S;
    return conv;
  });
  const mg = {
    save: jest.fn(async (v: unknown) => ({ id: "row1", ...(v as object) })),
    create: (_c: unknown, v: unknown) => v,
    update: jest.fn(async () => undefined),
    findOne: jest.fn(async () => null),
    insert: jest.fn(async () => undefined),
  };
  const emit = jest.fn(async () => undefined);
  const enqueue = jest.fn(async () => null);
  const createBooking = jest.fn(async (v: unknown) => ({ id: "b1", ...(v as object) }));
  const search = jest.fn(async () => [PARTNER]);
  const maps = {
    enabled: opts.maps ?? true,
    geocode: jest.fn(async (q: string) =>
      /nowhere/i.test(q)
        ? null
        : { latitude: 28.57, longitude: 77.24, locality: "Lajpat Nagar", city: "New Delhi" },
    ),
    reverseGeocode: jest.fn(async () => ({ locality: "Saket", city: "New Delhi" })),
    nearbyCandidates: jest.fn(async () => [
      {
        name: "Moolchand Hospital",
        address: "Lajpat Nagar, New Delhi, Delhi",
        latitude: 1,
        longitude: 1,
        maps_url: null,
      },
      {
        name: "Sunrise Diagnostics",
        address: "Defence Colony, New Delhi, Delhi 110024",
        latitude: 1,
        longitude: 1,
        maps_url: null,
      },
    ]),
  };

  stub(message, "findOne", async (...a) => {
    const where = (a[0] as { where: Record<string, unknown> }).where;
    return out.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null;
  });
  stub(message, "find", async () => []);
  stub(consent, "findOne", async () => cons);
  stub(conversation, "update", async (...a) => {
    Object.assign(conv, a[1] as object);
    return undefined;
  });
  stub(conversation, "findOne", async () => conv);
  stub(need, "findOne", async () => null);
  stub(task, "findOne", async () => null);
  stub(task, "find", async () => []);
  stub(trigger_event, "findOne", async () => null);
  stub(trigger_event, "save", async (v) => v);
  stub(trigger_event, "create", (v) => v);
  const needRow = { specialisation: null as string | null, save: async () => undefined };
  stub(need, "create", () => needRow);
  stub(booking_request, "findOne", async () => null);
  stub(booking_request, "find", async () => []);
  stub(activation, "findOne", async () => null);
  stub(centre, "findOne", async () => PARTNER);
  const ROW = (plan: string, billing: string) => ({
    id: `pc-${plan}-${billing}`,
    product: "oxxy",
    plan,
    billing,
    price: billing === "yearly" ? 30000 : 2999,
    status: true,
    gst_rate: 0.18,
    activation_link: `https://www.oxxy.in/healthplan?plan_name=oxxy_${plan}`,
    renewal_terms: "One-time payment, valid for one year",
    activation_time: "5 to 10 working days",
  });
  stub(plan_catalog, "find", async (...a) => {
    const w = (a[0] as { where: { plan: string } }).where;
    return [ROW(w.plan, "yearly"), ROW(w.plan, "monthly")];
  });
  stub(plan_catalog, "findOne", async (...a) => {
    const w = (a[0] as { where: { id?: string; plan?: string; billing?: string } }).where;
    return w.id ? ROW("thrive", "yearly") : ROW(w.plan ?? "thrive", w.billing ?? "yearly");
  });

  const pipeline = new ChatPipelineService(
    new GuardrailService(),
    { generate } as never,
    { validate: async () => ({ ok: true, reasons: [] }) } as never,
    { send } as never,
    {} as never,
    { search } as never,
    { create: createBooking } as never,
    new DateWindowService(),
    { transaction: async (fn: Fn) => fn(mg) } as never,
    { enqueue, dispatch: jest.fn(), emit } as never,
    { transition } as never,
    undefined,
    undefined,
    undefined,
    maps as never,
  );
  const saved = {
    customer: { id: "c1", wa_number: "919800000001", language: "en", save: async () => undefined },
    conversation: conv,
  } as never;
  let n = 0;
  const run = (text: string, extra: Record<string, unknown> = {}) =>
    pipeline.process(
      { waNumber: "919800000001", waMessageId: `wamid.IN${++n}`, text, ...extra } as never,
      saved,
    );
  return { run, conv, out, emit, enqueue, createBooking, search, maps, generate };
}

afterEach(() => jest.restoreAllMocks());

const last = (t: { out: Record<string, unknown>[] }) => t.out[t.out.length - 1];
const msg = <T>(t: { out: Record<string, unknown>[] }) => last(t).msg as T;
/** a date inside the booking window (3 days to 6 months ahead), as the customer types it */
const inTenDays = () => {
  const d = new Date(Date.now() + 10 * 86400000 + 5.5 * 3600000);
  return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`;
};

describe("client sequence 3: the Why Overpay first card (20 Nov)", () => {
  it("hi -> the first card with ① Reduce My Bill ② Book Appointment, and the voice AI is asked to call", async () => {
    const t = setup();
    await t.run("hi");
    const card = msg<{ kind: string; body: string; buttons: { id: string; title: string }[] }>(t);
    expect(card.kind).toBe("buttons");
    expect(card.body).toBe(OVERPAY_CARD_TEXT("en"));
    expect(card.buttons.map((b) => b.title)).toEqual(["Reduce My Bill", "Book Appointment"]);
    expect(t.conv.state).toBe(S.IntentMenu);
    expect(t.generate).not.toHaveBeenCalled();
    // client general rule: an AI bot call in 60 seconds (the CRM / voice AI places it)
    const call = t.emit.mock.calls.find(
      (c) =>
        (c as unknown[])[2] &&
        ((c as unknown[])[2] as { event: string }).event === "voice_call_requested",
    );
    expect(call).toBeTruthy();
    const data = (call as unknown[])[2] as { call_at: string; whatsapp_number: string };
    expect(data.whatsapp_number).toBe("919800000001");
    expect(new Date(data.call_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("no call request for a chat the voice AI started (the customer is already on the phone)", async () => {
    const t = setup({ callContext: "asked about knee surgery" });
    await t.run("hi");
    expect(
      t.emit.mock.calls.some(
        (c) => ((c as unknown[])[2] as { event: string })?.event === "voice_call_requested",
      ),
    ).toBe(false);
  });

  it("① Reduce My Bill opens the bill card (sequence 1); ② Book Appointment opens the booking card", async () => {
    const t = setup({ state: S.IntentMenu });
    await t.run("home_reduce");
    expect(last(t).text).toBe(BILL_CARD_TEXT("en"));
    await t.run("home_book");
    const card = msg<{ body: string; buttons: { id: string }[] }>(t);
    expect(card.body).toMatch(/\*Book Appointment\*/);
    expect(card.buttons.map((b) => b.id)).toEqual(["appt_start"]);
  });
});

describe("client sequence 2: Book Appointment (20 Nov)", () => {
  it("another option in the middle of the booking leaves it: Talk to Us is never read as an area", async () => {
    const t = setup({ state: S.IntentMenu });
    await t.run("appt_start");
    expect(msg<{ kind: string }>(t).kind).toBe("location_request");
    await t.run("Talk to Us");
    expect(String(last(t).text)).toMatch(/advisor/i);
    expect(String(last(t).text)).not.toMatch(/could not find that place/i);
    await t.run("appt_start");
    await t.run("Calculate Your Savings");
    expect(String(last(t).text)).toMatch(/bill amount/i);
  });

  it("typed area -> directory first, then Google places, no tie-up word -> pick -> for -> specialisation -> date -> time -> saved -> Later", async () => {
    const t = setup({ state: S.IntentMenu });
    await t.run("appt_start");
    expect(msg<{ kind: string }>(t).kind).toBe("location_request");
    await t.run("Lajpat Nagar, New Delhi");
    const list = msg<{
      kind: string;
      body: string;
      rows: { id: string; title: string; description: string }[];
    }>(t);
    expect(list.kind).toBe("list");
    // the directory centre, then the Google place (Moolchand from Google is the same name: shown once), "Other"
    expect(list.rows.map((r) => r.id)).toEqual(["appt_opt_0", "appt_opt_1", "appt_other"]);
    expect(list.rows[1].title).toBe("Sunrise Diagnostics");
    // Playbook 2.1 / Trigger D: never a word about tie-up, partner or discount status
    expect(JSON.stringify(list)).not.toMatch(/partner|tie-?up|network|discount/i);
    await t.run("appt_opt_0");
    expect(last(t).text).toMatch(/Hospital: Moolchand Hospital[\s\S]*Who is this booking for/);
    await t.run("appt_family");
    // Playbook 11.1 step 2: the specialisation (the health consent is given here)
    expect(last(t).text).toMatch(/Which doctor specialisation, test or healthcare service/);
    await t.run("cardiologist");
    expect(last(t).text).toMatch(/When do you want to go/);
    await t.run("tomorrow");
    expect(last(t).text).not.toMatch(/What time suits you/); // inside 3 days: the booking window rule
    await t.run(inTenDays());
    expect(last(t).text).toMatch(/What time suits you/);
    await t.run("11 am");
    expect(t.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({ centre_id: "ctr-1", preferred_time: "11:00 AM" }),
    );
    const done = msg<{ body: string; buttons: { id: string }[] }>(t);
    // Trigger H + Playbook 11.2: pending confirmation, then ONE soft suggestion, no pressure
    expect(done.body).toMatch(
      /Your booking request has been made for .+Moolchand Hospital.+pending confirmation/,
    );
    expect(done.body).toMatch(/There is no pressure; your booking request is already recorded/);
    expect(done.body).not.toMatch(/confirmed\b|partner/i);
    expect(done.buttons.map((b) => b.id)).toEqual(["appt_activate", "appt_later"]);
    expect(
      t.emit.mock.calls.some(
        (c) =>
          ((c as unknown[])[2] as { event: string; booking_for: string })?.booking_for === "family",
      ),
    ).toBe(true);
    await t.run("appt_later");
    expect(last(t).text).toMatch(/^Absolutely, no problem. Your booking request is recorded/);
    expect((last(t).msg as { buttons: { id: string }[] }).buttons.map((b) => b.id)).toEqual([
      "flow_menu",
    ]);
    expect(t.generate).not.toHaveBeenCalled();
  });

  it("a shared pin works too; a Google place is booked for the team to check (Playbook 10.2)", async () => {
    const t = setup({ state: S.IntentMenu });
    await t.run("appt_start");
    await t.run("", { type: "location", location: { latitude: 28.52, longitude: 77.21 } });
    expect(t.maps.nearbyCandidates).toHaveBeenCalled();
    expect(String(last(t).text)).toMatch(
      /private healthcare centres near you \(Saket, New Delhi\)/,
    );
    await t.run("appt_opt_1");
    await t.run("appt_self");
    await t.run("skip");
    await t.run(inTenDays());
    await t.run("evening");
    expect(t.createBooking).not.toHaveBeenCalled(); // not a directory centre: a task for the team
    const done = msg<{ body: string }>(t);
    expect(done.body).toMatch(/Sunrise Diagnostics/);
    expect(done.body).toMatch(/Our team will first check the centre and branch/);
  });

  it("Other hospital -> the typed name, city, state; Activate -> the plans", async () => {
    const t = setup({ state: S.IntentMenu });
    await t.run("appt_start");
    await t.run("Lajpat Nagar, New Delhi");
    await t.run("appt_other");
    expect(last(t).text).toMatch(/hospital or diagnostic centre name, city and state/);
    await t.run("Moolchand, New Delhi, Delhi");
    expect(last(t).text).toMatch(/Who is this booking for/);
    await t.run("my mother");
    await t.run("eye check-up");
    await t.run(inTenDays());
    await t.run("10:30 am");
    await t.run("appt_activate");
    expect(msg<{ kind: string }>(t).kind).toBe("list"); // the four plans
  });

  it("a place that is not found asks again; a question in the middle goes to the normal conversation", async () => {
    const t = setup({ state: S.IntentMenu });
    await t.run("appt_start");
    await t.run("nowhere land");
    expect(last(t).text).toMatch(/could not find that place/);
    // (the LLM answer path needs the database, not mocked here: only who answers is checked)
    await t.run("is the discount available for surgery?").catch(() => undefined);
    expect(t.generate).toHaveBeenCalled();
  });
});

describe("live chat 20 Nov: Activate Yearly -> yes must send the link", () => {
  it("before the health consent, the YES to the link is the link's answer, not the notice's", async () => {
    const t = setup({ state: S.IntentMenu, consented: false });
    await t.run("bill_activate");
    await t.run("plan_thrive");
    await t.run("act_yearly");
    expect(String(t.conv.pending_action)).toMatch(/^send_activation_link:/);
    const before = t.out.length;
    await t.run("yes").catch((e) => console.log("ERR", (e as Error).message));
    const after = t.out.slice(before).map((o) => String(o.text));
    expect(after.join(" ")).toMatch(/oxxy\.in\/healthplan\?plan_name=oxxy_thrive/);
    expect(after[0]).not.toMatch(/Before sharing health details/);
  });

  it("'I want to book' starts the client's booking flow", async () => {
    const t = setup({ state: S.IntentMenu });
    await t.run("I want to book");
    expect((last(t).msg as { kind: string }).kind).toBe("location_request");
  });
});

describe("doc check 20 Nov: centre list rules (Playbook 10)", () => {
  it("at most five centres, government facilities left out", async () => {
    const t = setup({ state: S.IntentMenu });
    t.maps.nearbyCandidates.mockImplementation(async () =>
      [
        "Govt District Hospital",
        "AIIMS Delhi",
        "ESIC Hospital",
        "City Care",
        "Apex Clinic",
        "Sun Labs",
        "Max Eye",
        "Blue Dental",
        "Hope Hospital",
      ].map((name) => ({
        name,
        address: "Saket, New Delhi",
        latitude: 1,
        longitude: 1,
        maps_url: null,
      })),
    );
    await t.run("appt_start");
    await t.run("Saket, New Delhi");
    const rows = (last(t).msg as { rows: { title: string }[] }).rows.map((r) => r.title);
    expect(rows).toHaveLength(6); // 5 + Other hospital
    expect(rows.join(" ")).not.toMatch(/Govt|AIIMS|ESIC/);
  });
});
