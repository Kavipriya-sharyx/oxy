import axios from "axios";
import Configuration from "../../Config/Configuration";
import { ConfigService } from "@nestjs/config";
import { WhatsappClient, mapMetaError } from "./WhatsappClient.service";
import {
  WhatsappApiError,
  WindowClosedError,
  QuietHoursError,
  InvalidMessageError,
} from "@Helper/WhatsappErrors";
import { customer } from "@Database/Table/Oxxy/customer";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { message } from "@Database/Table/Oxxy/message";

type Fn = (...a: unknown[]) => unknown;
const stub = (cls: unknown, name: string, impl: Fn) =>
  jest.spyOn(cls as Record<string, Fn>, name).mockImplementation(impl);

const metaErr = (status: number, code?: number, msg = "boom") => ({
  isAxiosError: true,
  message: "Request failed",
  response: { status, data: { error: { code, message: msg } } },
});

describe("Meta error mapping", () => {
  it("131047 -> WindowClosedError", () => {
    expect(mapMetaError(metaErr(400, 131047))).toBeInstanceOf(WindowClosedError);
  });
  it("190 -> WhatsappApiError about the expired token, not retryable", () => {
    const e = mapMetaError(metaErr(401, 190)) as WhatsappApiError;
    expect(e).toBeInstanceOf(WhatsappApiError);
    expect(e.message).toBe("WHATSAPP_ACCESS_TOKEN expired or invalid");
    expect(e.retryable).toBe(false);
  });
  it("131026 and 132000-series give readable errors", () => {
    expect(mapMetaError(metaErr(400, 131026)).message).toMatch(/not on WhatsApp/);
    const t = mapMetaError(
      metaErr(400, 132000, "number of parameters does not match"),
    ) as WhatsappApiError;
    expect(t.message).toMatch(/Template problem \(132000\)/);
    expect(t.retryable).toBe(false);
    expect((mapMetaError(metaErr(400, 132012)) as WhatsappApiError).metaCode).toBe(132012);
  });
  it("5xx is retryable, 4xx is not", () => {
    expect((mapMetaError(metaErr(500)) as WhatsappApiError).retryable).toBe(true);
    expect((mapMetaError(metaErr(503, 1)) as WhatsappApiError).retryable).toBe(true);
    expect((mapMetaError(metaErr(400, 100)) as WhatsappApiError).retryable).toBe(false);
    expect((mapMetaError(metaErr(404)) as WhatsappApiError).retryable).toBe(false);
  });
  it("a timeout or no response is retryable", () => {
    const e = mapMetaError({
      isAxiosError: true,
      code: "ECONNABORTED",
      message: "timeout of 10000ms exceeded",
    }) as WhatsappApiError;
    expect(e).toBeInstanceOf(WhatsappApiError);
    expect(e.retryable).toBe(true);
  });
});

const config = {
  get: (k: string) =>
    ({
      "Whatsapp.ApiVersion": "v99.0",
      "Whatsapp.PhoneNumberId": "PHONE1",
      "Whatsapp.AccessToken": "TOKEN",
    })[k],
} as unknown as ConfigService;

function setup(lastCustomerMessageAt: Date | null) {
  const saved: Record<string, unknown>[] = [];
  stub(customer, "findOne", async () => ({ id: "c1", wa_number: "919800000001" }));
  stub(conversation, "findOne", async () => ({
    id: "v1",
    last_customer_message_at: lastCustomerMessageAt,
  }));
  stub(message, "create", (v) => v);
  stub(message, "save", async (v) => (saved.push(v as Record<string, unknown>), v));
  const post = jest
    .spyOn(axios, "post")
    .mockResolvedValue({ data: { messages: [{ id: "wamid.SENT1" }] } });
  return { client: new WhatsappClient(config), saved, post };
}

afterEach(() => jest.restoreAllMocks());

describe("WhatsappClient.send", () => {
  const recent = () => new Date(Date.now() - 3600_000);
  const old = () => new Date(Date.now() - 25 * 3600_000);

  it("calls the configured version/phone id with the bearer token and 10 s timeout", async () => {
    const t = setup(recent());
    await t.client.send("c1", { kind: "text", body: "hello" }, "reply");
    const [url, body, opts] = t.post.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v99.0/PHONE1/messages");
    expect(body).toMatchObject({ to: "919800000001", type: "text", text: { body: "hello" } });
    expect(opts).toMatchObject({ headers: { Authorization: "Bearer TOKEN" }, timeout: 10000 });
  });

  it("WHATSAPP_API_BASE: a custom base is used, a trailing slash is ignored", async () => {
    const t = setup(recent());
    const custom = {
      get: (k: string) => (k === "Whatsapp.ApiBase" ? "http://localhost:9999/" : config.get(k)),
    } as unknown as ConfigService;
    await new WhatsappClient(custom).send("c1", { kind: "text", body: "hello" }, "reply");
    expect(t.post.mock.calls[0][0]).toBe("http://localhost:9999/v99.0/PHONE1/messages");
  });

  it("WHATSAPP_API_BASE: the config default is Meta, an env value overrides it", async () => {
    const saved = process.env.WHATSAPP_API_BASE;
    try {
      delete process.env.WHATSAPP_API_BASE;
      expect(Configuration().Whatsapp.ApiBase).toBe("https://graph.facebook.com");
      process.env.WHATSAPP_API_BASE = "http://localhost:9999";
      expect(Configuration().Whatsapp.ApiBase).toBe("http://localhost:9999");
    } finally {
      if (saved === undefined) delete process.env.WHATSAPP_API_BASE;
      else process.env.WHATSAPP_API_BASE = saved;
    }
  });

  it("saves the outbound row: text", async () => {
    const t = setup(recent());
    const wamid = await t.client.send("c1", { kind: "text", body: "hello" }, "reply", "wamid.IN1");
    expect(wamid).toBe("wamid.SENT1");
    expect(t.saved[0]).toMatchObject({
      conversation_id: "v1",
      direction: "out",
      wa_message_id: "wamid.SENT1",
      type: "text",
      body: "hello",
      template_name: null,
      message_status: "sent",
      reply_to_wa_message_id: "wamid.IN1",
    });
  });

  it("saves the body text for buttons and list", async () => {
    const t = setup(recent());
    await t.client.send(
      "c1",
      { kind: "buttons", body: "Pick one", buttons: [{ id: "a", title: "A" }] },
      "reply",
    );
    await t.client.send(
      "c1",
      { kind: "list", body: "Pick a plan", buttonLabel: "Go", rows: [{ id: "r", title: "R" }] },
      "reply",
    );
    expect(t.saved[0]).toMatchObject({
      type: "buttons",
      body: "Pick one",
      reply_to_wa_message_id: null,
    });
    expect(t.saved[1]).toMatchObject({ type: "list", body: "Pick a plan" });
  });

  it("saves template_name for a template", async () => {
    const t = setup(recent());
    await t.client.send(
      "c1",
      { kind: "template", name: "hello_world", languageCode: "en_US" },
      "reply",
    );
    expect(t.saved[0]).toMatchObject({
      type: "template",
      template_name: "hello_world",
      body: null,
    });
  });

  it("text is blocked after 24h (no API call) but a template still goes", async () => {
    const t = setup(old());
    await expect(t.client.send("c1", { kind: "text", body: "hi" }, "reply")).rejects.toBeInstanceOf(
      WindowClosedError,
    );
    expect(t.post).not.toHaveBeenCalled();
    await expect(
      t.client.send(
        "c1",
        { kind: "template", name: "hello_world", languageCode: "en_US" },
        "reply",
      ),
    ).resolves.toBe("wamid.SENT1");
    expect(t.post).toHaveBeenCalledTimes(1);
  });

  it("no last customer message at all: text blocked", async () => {
    const t = setup(null);
    await expect(t.client.send("c1", { kind: "text", body: "hi" }, "reply")).rejects.toBeInstanceOf(
      WindowClosedError,
    );
  });

  it("a proactive send in quiet hours is blocked", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-03-10T16:30:00Z")); // 22:00 IST
    const t = setup(new Date("2026-03-10T15:00:00Z"));
    await expect(
      t.client.send("c1", { kind: "text", body: "hi" }, "proactive"),
    ).rejects.toBeInstanceOf(QuietHoursError);
    await expect(t.client.send("c1", { kind: "text", body: "hi" }, "reply")).resolves.toBe(
      "wamid.SENT1",
    );
    jest.useRealTimers();
  });

  it("limits are checked before the API is called", async () => {
    const t = setup(recent());
    await expect(
      t.client.send(
        "c1",
        {
          kind: "buttons",
          body: "b",
          buttons: Array.from({ length: 4 }, (_, i) => ({ id: `${i}`, title: "x" })),
        },
        "reply",
      ),
    ).rejects.toBeInstanceOf(InvalidMessageError);
    expect(t.post).not.toHaveBeenCalled();
  });

  it("maps a Meta error from the API and saves nothing", async () => {
    const t = setup(recent());
    t.post.mockRejectedValueOnce(metaErr(401, 190));
    await expect(t.client.send("c1", { kind: "text", body: "hi" }, "reply")).rejects.toMatchObject({
      name: "WhatsappApiError",
      retryable: false,
      message: "WHATSAPP_ACCESS_TOKEN expired or invalid",
    });
    expect(t.saved).toHaveLength(0);
  });
});
