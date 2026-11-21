import axios from "axios";
import {
  e164,
  sharyxData,
  sharyxSignature,
  SharyxVoiceService,
  validSharyx,
} from "./SharyxVoice.service";
import { callContextText, SharyxWebhookService } from "./SharyxWebhook.service";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { customer } from "@Database/Table/Oxxy/customer";
import { task } from "@Database/Table/Oxxy/task";

const ENV = ["SHARYX_ENABLED", "SHARYX_API_KEY", "SHARYX_AGENT_ID", "SHARYX_API_BASE"];
afterEach(() => {
  jest.restoreAllMocks();
  for (const k of ENV) delete process.env[k];
});

describe("SharyX Voice AI client (guide, 5 Nov 2026)", () => {
  it("signature: v1= HMAC of timestamp.METHOD.path.body; stale or wrong is refused", () => {
    const now = 1_790_000_000;
    const body = '{"event":"call.completed"}';
    const sig = sharyxSignature(
      "s3cret",
      String(now),
      "POST",
      "/api/v1/Voice/Sharyx/Webhook",
      body,
    );
    expect(sig).toMatch(/^v1=[0-9a-f]{64}$/);
    const o = {
      timestamp: String(now),
      signature: sig,
      method: "POST",
      pathAndQuery: "/api/v1/Voice/Sharyx/Webhook",
      rawBody: body,
    };
    expect(validSharyx("s3cret", o, now + 10)).toBe(true);
    expect(validSharyx("other", o, now + 10)).toBe(false);
    expect(validSharyx("s3cret", { ...o, rawBody: body + " " }, now + 10)).toBe(false);
    expect(validSharyx("s3cret", o, now + 301)).toBe(false); // older than 5 minutes
    expect(validSharyx(undefined, o, now)).toBe(false);
  });

  it("numbers and data are made safe for the API", () => {
    expect(e164("919840012345")).toBe("+919840012345");
    const d = sharyxData({ "customer id": "c1", empty: "", n: 3, long: "x".repeat(600) });
    expect(d).toEqual({ customer_id: "c1", n: 3, long: "x".repeat(500) });
  });

  it("callNow: off without key + agent; 202 = queued; 409 = already (never resent)", async () => {
    const svc = new SharyxVoiceService();
    expect(await svc.callNow({ phone: "+919840012345", data: {} })).toEqual({
      ok: false,
      reason: "disabled",
    });
    Object.assign(process.env, {
      SHARYX_ENABLED: "true",
      SHARYX_API_KEY: "sx_live_x",
      SHARYX_AGENT_ID: "AG1",
    });
    const post = jest
      .spyOn(axios, "post")
      .mockResolvedValueOnce({
        status: 202,
        data: { contact_id: "4b0e", status: "pending" },
      } as never)
      .mockResolvedValueOnce({ status: 409, data: { error: "already waiting" } } as never);
    expect(
      await svc.callNow({ phone: "919840012345", name: "Ravi", data: { customer_id: "c1" } }),
    ).toEqual({
      ok: true,
      contactId: "4b0e",
      status: "pending",
    });
    const [url, body, cfg] = post.mock.calls[0] as [string, any, any];
    expect(url).toBe("https://app.sharyx.org/api/v1/calls");
    expect(body).toMatchObject({
      agent_id: "AG1",
      phone: "+919840012345",
      name: "Ravi",
      data: { customer_id: "c1" },
    });
    expect(cfg.headers.Authorization).toBe("Bearer sx_live_x");
    expect(await svc.callNow({ phone: "+919840012345", data: {} })).toMatchObject({
      ok: false,
      reason: "already",
    });
  });
});

describe("SharyX call result webhook", () => {
  const body = {
    event: "call.completed",
    call: {
      id: "call-1",
      result: "completed",
      ended_at: "2026-11-20T10:00:00Z",
      customer_number: "+919840012345",
    },
    contact: {
      data: {
        customer_id: "11111111-1111-1111-1111-111111111111",
        conversation_id: "22222222-2222-2222-2222-222222222222",
      },
    },
    outcome: { key: "interested", label: "Interested", group: "positive" },
    summary: "Ravi wants a cardiology visit for his father.",
    follow_up: "Book the visit on WhatsApp.",
    data: { city: "Chennai" },
  };

  it("the call becomes the chat's call_context and one task (a repeated delivery adds no second task)", async () => {
    const conv: any = {
      id: body.contact.data.conversation_id,
      customer_id: body.contact.data.customer_id,
      save: jest.fn(),
    };
    jest.spyOn(conversation, "findOne").mockResolvedValue(conv);
    jest.spyOn(customer, "findOne").mockResolvedValue({ id: conv.customer_id } as never);
    const find = jest
      .spyOn(task, "findOne")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "t1" } as never);
    const save = jest.spyOn(task, "save").mockResolvedValue({} as never);
    jest.spyOn(task, "create").mockImplementation(((x: unknown) => x) as never);
    const svc = new SharyxWebhookService();
    expect(await svc.handle("call.completed", body)).toBe("ok");
    expect(conv.call_context).toBe(callContextText(body));
    expect(conv.call_context).toMatch(
      /Interested\. Ravi wants a cardiology visit .* Next step: Book the visit on WhatsApp\. city: Chennai/,
    );
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ crm_task_id: "sharyx:call-1", priority: "high" }),
    );
    await svc.handle("call.completed", body);
    expect(find).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("an unanswered call changes nothing; another event is ignored", async () => {
    const conv: any = { id: "c", save: jest.fn() };
    jest.spyOn(conversation, "findOne").mockResolvedValue(conv);
    jest.spyOn(customer, "findOne").mockResolvedValue(null);
    const svc = new SharyxWebhookService();
    expect(
      await svc.handle("call.completed", { ...body, call: { ...body.call, result: "no_answer" } }),
    ).toBe("ok");
    expect(conv.save).not.toHaveBeenCalled();
    expect(await svc.handle("call.started", body)).toBe("ignored");
  });
});
