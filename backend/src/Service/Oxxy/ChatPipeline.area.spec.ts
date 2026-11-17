// Client chats, 17 Nov: "near peelamedu", "near sitra", "Delhi" were typed, and every reply said "I still do
// not have a verified centre in Neelambur, Coimbatore". The new area was left to the LLM, which saw the old
// one as "known" and did not return it; nothing within 5 km gave a dead end although centres were ~8 km away.
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
  opts: { needRow: object; found: (q: Record<string, unknown>) => unknown[]; maps?: unknown },
) {
  const conv = { id: "v1", state: S.CentreSearch, selected_product: null, recommended_plan: null, pending_action: null as string | null };
  const out: string[] = [];
  let replied = false;
  const send = jest.fn(async (...a: unknown[]) => {
    out.push(String((a[1] as { body: string; log?: string }).log ?? (a[1] as { body: string }).body));
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
  stub(plan_catalog, "find", async () => []);
  stub(plan_catalog, "findOne", async () => null);
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
    customer: { id: "c1", language: "en", active_product: null, age: 55, save: async () => undefined },
    conversation: conv,
  } as never;
  const run = (text: string) => {
    replied = false;
    return pipeline.process({ waNumber: "919800000001", waMessageId: "wamid.IN1", text }, s);
  };
  return { run, out, conv };
}

afterEach(() => jest.restoreAllMocks());

const KMCH = { id: "ctr1", name: "KMCH Hospital", branch: "SITRA", locality: "Peelamedu", city: "Coimbatore", centre_type: "multispeciality", latitude: 11.03, longitude: 77.03, verified: true, active: true };
const neelambur = (): Record<string, unknown> => ({ city: "Coimbatore", locality: "Neelambur", travel_radius_km: 5, save: async () => undefined });

describe("17 Nov: a new area typed in a sentence is searched, never the old one in a loop", () => {
  it("Neelambur stored, 'near peelamedu, Coimbatore, within 5 km' typed: saved and searched there", async () => {
    const needRow = neelambur();
    const t = setup([draft("Sure, let me check.", { intent: "find_centre" })], {
      needRow,
      found: (q) => (q.locality === "Peelamedu" ? [{ ...KMCH }] : []),
    });
    await t.run("i would like to know the available healthcare centre options near peelamedu, Coimbatore, preferably within a 5 km radius.");
    expect(needRow).toMatchObject({ locality: "Peelamedu", city: "Coimbatore" });
    expect(t.out.join("\n")).toContain("KMCH Hospital");
    expect(t.out.join("\n")).not.toContain("Neelambur");
  });

  it("'in the SITRA area of Coimbatore': SITRA is the area, even when the LLM leaves it out", async () => {
    const needRow = neelambur();
    const t = setup([draft("Let me check.", { intent: "find_centre" })], { needRow, found: () => [{ ...KMCH }] });
    await t.run("Please check for available healthcare centres in the SITRA area of Coimbatore.");
    expect(needRow).toMatchObject({ locality: "SITRA", city: "Coimbatore" });
  });

  it("another city from the LLM: the old locality is dropped ('Neelambur, Delhi' is never searched)", async () => {
    const needRow = neelambur();
    const t = setup([draft("Let me check Delhi.", { intent: "find_centre", extracted_fields: { city: "Delhi" } })], {
      needRow,
      found: () => [],
    });
    await t.run("Delhi, North India. Please help me with the booking there.");
    expect(needRow).toMatchObject({ city: "Delhi", locality: null });
    expect(t.out.join("\n")).toContain("I do not have a verified centre in Delhi yet");
  });

  it("nothing within 5 km: the nearest verified centres with their distance, not 'no centre' again", async () => {
    const maps = {
      enabled: true,
      geocode: jest.fn(async () => ({ latitude: 11.08, longitude: 77.08, locality: "Neelambur", city: "Coimbatore", approximate: false })),
      travel: jest.fn(async (_o: unknown, d: unknown[]) => d.map(() => ({ distance_km: 8.4, minutes: 16 }))),
      nearbyCandidates: jest.fn(async () => []),
    };
    const t = setup([draft("Let me check.", { intent: "find_centre" })], {
      needRow: neelambur(),
      found: (q) => (Number(q.radiusKm) <= 5 ? [] : [{ ...KMCH }]),
      maps,
    });
    await t.run("Okay suggest me good health care centre dermatologist");
    const text = t.out.join("\n");
    expect(text).toContain("There is no verified centre within 5 km of Neelambur, Coimbatore. These are the nearest verified options:");
    expect(text).toContain("1. KMCH Hospital, SITRA - Peelamedu | Multispeciality | about 8.4 km, 16 min");
    expect(text).not.toContain("do not have a verified centre");
    expect(t.conv.pending_action).toBe("centre_pick");
  });
});
