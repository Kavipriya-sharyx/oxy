import { CrmOutboxService } from "./CrmOutbox.service";
import { CrmAction } from "@Helper/Enum/CrmAction";
import { validCrmSignature } from "@Controller/Crm/CrmWebhook.controller";
import { createHmac } from "crypto";

const config = (enabled: boolean) => ({ get: (k: string) => (k === "Crm.Enabled" ? enabled : undefined) });

describe("CrmOutboxService.enqueue", () => {
  it("writes nothing when CRM is disabled", async () => {
    const save = jest.fn();
    const svc = new CrmOutboxService(config(false) as never, {} as never);
    const row = await svc.enqueue({ save, create: jest.fn() } as never, CrmAction.CreateTask, "c1", {});
    expect(row).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it("writes the row through the given transaction manager when enabled", async () => {
    const save = jest.fn(async (r: unknown) => r);
    const create = jest.fn((_e: unknown, v: unknown) => v);
    const svc = new CrmOutboxService(config(true) as never, {} as never);
    const row = await svc.enqueue({ save, create } as never, CrmAction.CreateTask, "c1", { a: 1 });
    expect(save).toHaveBeenCalledTimes(1);
    expect(row).toMatchObject({ action: "create_task", customer_id: "c1", payload: { a: 1 } });
  });
});

describe("CRM webhook signature", () => {
  const raw = Buffer.from('{"event_id":"e1"}');
  const sig = createHmac("sha256", "s3cret").update(raw).digest("hex");
  it("accepts a good signature (with or without sha256= prefix)", () => {
    expect(validCrmSignature(raw, sig, "s3cret")).toBe(true);
    expect(validCrmSignature(raw, "sha256=" + sig, "s3cret")).toBe(true);
  });
  it("rejects bad or missing signatures", () => {
    expect(validCrmSignature(raw, "deadbeef", "s3cret")).toBe(false);
    expect(validCrmSignature(raw, undefined, "s3cret")).toBe(false);
    expect(validCrmSignature(raw, sig, "")).toBe(false);
  });
});
