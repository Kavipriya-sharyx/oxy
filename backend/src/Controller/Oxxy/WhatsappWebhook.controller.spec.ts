import { ConfigService } from "@nestjs/config";
import { Response } from "express";
import { createHmac } from "crypto";
import { WhatsappWebhookController } from "./WhatsappWebhook.controller";
import { WhatsappInboundService } from "@Service/Oxxy/WhatsappInbound.service";
import { ChatPipelineService } from "@Service/Oxxy/ChatPipeline.service";
import { InboundQueueService } from "@Service/Oxxy/InboundQueue.service";
import { InboundJob, WaWebhookBody } from "@Service/Oxxy/WhatsappTypes";
import { message } from "@Database/Table/Oxxy/message";
import { customer } from "@Database/Table/Oxxy/customer";
import { conversation } from "@Database/Table/Oxxy/conversation";

type Fn = (...a: unknown[]) => unknown;
const stub = (cls: unknown, name: string, impl: Fn) =>
  jest.spyOn(cls as Record<string, Fn>, name).mockImplementation(impl);

const SECRET = "app-secret";
const sign = (raw: Buffer) => "sha256=" + createHmac("sha256", SECRET).update(raw).digest("hex");
const config = {
  get: (k: string) => ({ "Whatsapp.VerifyToken": "tok", "Whatsapp.AppSecret": SECRET })[k],
} as unknown as ConfigService;

const payload = (id: string): WaWebhookBody => ({
  entry: [
    {
      changes: [
        {
          value: {
            contacts: [{ wa_id: "919876543210", profile: { name: "Asha" } }],
            messages: [{ id, from: "919876543210", timestamp: "1760000000", type: "text", text: { body: "hello" } }],
          },
        },
      ],
    },
  ],
});

function setup(saveImpl?: Fn) {
  const rows: Record<string, unknown>[] = [];
  const jobs: { data: InboundJob; wamid: string }[] = [];

  stub(message, "findOne", async (...a) => {
    const where = (a[0] as { where: Record<string, unknown> }).where;
    return rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null;
  });
  stub(message, "create", (v) => v);
  stub(message, "save", saveImpl ?? (async (v) => {
    const row = { ...(v as object), id: `m${rows.length + 1}` };
    rows.push(row);
    return row;
  }));
  stub(customer, "findOne", async () => ({ id: "c1", wa_number: "919876543210", first_name: "Asha" }));
  stub(conversation, "findOne", async () => ({ id: "v1", save: async () => undefined }));

  const dataSource = { transaction: jest.fn() };
  const outbox = { enqueue: jest.fn(), dispatch: jest.fn() };
  const pipeline = new ChatPipelineService(
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    dataSource as never,
    outbox as never,
  );
  const queue = {
    enqueue: jest.fn(async (data: InboundJob, wamid: string) => void jobs.push({ data, wamid })),
  } as unknown as InboundQueueService;
  const inbound = new WhatsappInboundService(config, pipeline, queue);
  const controller = new WhatsappWebhookController(config, inbound);
  const res = { status: jest.fn().mockReturnThis(), type: jest.fn().mockReturnThis(), send: jest.fn() };
  return { rows, jobs, controller, res: res as unknown as Response, raw: res };
}

const post = (c: WhatsappWebhookController, res: Response, body: WaWebhookBody, badSig = false) => {
  const raw = Buffer.from(JSON.stringify(body));
  return c.receive({ rawBody: raw }, res, badSig ? "sha256=deadbeef" : sign(raw), body);
};

afterEach(() => jest.restoreAllMocks());

describe("WhatsApp webhook POST", () => {
  it("valid signature: message saved, one job queued", async () => {
    const t = setup();
    const out = await post(t.controller, t.res, payload("wamid.A"));
    expect(out).toEqual({ status: "ok" });
    expect(t.raw.status).not.toHaveBeenCalled();
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0]).toMatchObject({ wa_message_id: "wamid.A", direction: "in", type: "text", body: "hello", message_status: "received" });
    expect(t.jobs).toHaveLength(1);
    expect(t.jobs[0]).toEqual({ wamid: "wamid.A", data: { messageId: "m1", conversationId: "v1", customerId: "c1" } });
  });

  it("same wa_message_id sent twice: one row, one job", async () => {
    const t = setup();
    await post(t.controller, t.res, payload("wamid.B"));
    await post(t.controller, t.res, payload("wamid.B"));
    expect(t.rows).toHaveLength(1);
    expect(t.jobs).toHaveLength(1);
  });

  it("unique-constraint error on save is skipped quietly, no job", async () => {
    const t = setup(async () => {
      throw Object.assign(new Error("dup"), { code: "23505" });
    });
    const out = await post(t.controller, t.res, payload("wamid.C"));
    expect(out).toEqual({ status: "ok" });
    expect(t.jobs).toHaveLength(0);
  });

  it("bad signature: 403, nothing saved", async () => {
    const t = setup();
    await post(t.controller, t.res, payload("wamid.D"), true);
    expect(t.raw.status).toHaveBeenCalledWith(403);
    expect(t.rows).toHaveLength(0);
    expect(t.jobs).toHaveLength(0);
  });

  it("non-text message is saved with its type and an empty body, and queued", async () => {
    const t = setup();
    const body = payload("wamid.E");
    const m = body.entry![0].changes![0].value!.messages![0];
    m.type = "image";
    delete m.text;
    await post(t.controller, t.res, body);
    expect(t.rows[0]).toMatchObject({ type: "image", body: "" });
    expect(t.jobs).toHaveLength(1);
  });

  it("interactive reply (button or list) is saved with type interactive and the tapped id", async () => {
    const t = setup();
    const btn = payload("wamid.BTN");
    const m1 = btn.entry![0].changes![0].value!.messages![0];
    m1.type = "interactive";
    delete m1.text;
    m1.interactive = { button_reply: { id: "dev_yes", title: "Yes" } };
    await post(t.controller, t.res, btn);

    const lst = payload("wamid.LST");
    const m2 = lst.entry![0].changes![0].value!.messages![0];
    m2.type = "interactive";
    delete m2.text;
    m2.interactive = { list_reply: { id: "dev_vital", title: "Vital" } };
    await post(t.controller, t.res, lst);

    expect(t.rows[0]).toMatchObject({ type: "interactive", body: "dev_yes" });
    expect(t.rows[1]).toMatchObject({ type: "interactive", body: "dev_vital" });
    expect(t.jobs).toHaveLength(2);
  });

  it("status event only updates the outbound message and never queues", async () => {
    const t = setup();
    t.rows.push({ wa_message_id: "wamid.OUT", direction: "out", message_status: "sent", save: async () => undefined });
    await post(t.controller, t.res, {
      entry: [{ changes: [{ value: { statuses: [{ id: "wamid.OUT", status: "delivered" }] } }] }],
    });
    expect(t.rows[0].message_status).toBe("delivered");
    expect(t.jobs).toHaveLength(0);
  });
});

describe("WhatsApp webhook GET verify", () => {
  it("correct token returns the challenge", () => {
    const t = setup();
    t.controller.verify("subscribe", "tok", "12345", t.res);
    expect(t.raw.status).toHaveBeenCalledWith(200);
    expect(t.raw.send).toHaveBeenCalledWith("12345");
  });
  it("wrong token returns 403", () => {
    const t = setup();
    t.controller.verify("subscribe", "nope", "12345", t.res);
    expect(t.raw.status).toHaveBeenCalledWith(403);
  });
});
