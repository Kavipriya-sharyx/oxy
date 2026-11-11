import { Injectable, Logger } from "@nestjs/common";
import { randomBytes } from "crypto";
import { crm_webhook_event } from "@Database/Table/Crm/crm_webhook_event";
import { booking_request } from "@Database/Table/Oxxy/booking_request";
import { task } from "@Database/Table/Oxxy/task";
import { user } from "@Database/Table/Admin/user";
import { user_role } from "@Database/Table/Admin/user_role";
import { BookingStatus } from "@Helper/Enum/BookingStatus";
import { TaskStatus } from "@Helper/Enum/TaskStatus";
import { EncryptionService } from "@Service/Encryption.service";

type Data = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

@Injectable()
export class CrmWebhookService {
  private readonly logger = new Logger(CrmWebhookService.name);

  constructor(private readonly _Encryption: EncryptionService) {}

  // Store first, then process. A resend of the same event_id is ignored.
  async handle(body: { event_id?: string; event_type?: string; data?: Data }): Promise<"ok" | "duplicate" | "invalid"> {
    const eventId = str(body?.event_id);
    const type = str(body?.event_type);
    if (!eventId || !type) return "invalid";
    if (await crm_webhook_event.findOne({ where: { event_id: eventId } })) return "duplicate";

    let ev: crm_webhook_event;
    try {
      ev = await crm_webhook_event.save(
        crm_webhook_event.create({ event_id: eventId, event_type: type, payload: (body.data ?? {}) as Data }),
      );
    } catch {
      return "duplicate"; // two requests raced on the primary key
    }
    try {
      await this.process(type, (body.data ?? {}) as Data);
      ev.processed_at = new Date();
    } catch (e) {
      ev.error = String((e as Error).message).slice(0, 1000);
      this.logger.error(`CRM event ${eventId} (${type}) failed: ${ev.error}`);
    }
    await ev.save();
    return "ok";
  }

  private async process(type: string, d: Data) {
    switch (type) {
      case "booking.confirmed":
        return await this.bookingConfirmed(d);
      case "task.updated":
        return await this.taskUpdated(d);
      case "user.upserted":
        return await this.userUpserted(d);
      default:
        throw new Error(`unknown event_type: ${type}`);
    }
  }

  // The sales team confirmed in the CRM -> update our mirror
  private async bookingConfirmed(d: Data) {
    const id = str(d.booking_id);
    const crmId = str(d.crm_booking_id);
    const b = await booking_request.findOne({ where: id ? { id } : { crm_booking_id: crmId ?? "" } });
    if (!b) throw new Error("booking not found");
    if (b.booking_status !== BookingStatus.PendingConfirmation) return; // already handled
    const crmUser = str(d.confirmed_by_crm_user_id);
    const u = crmUser ? await user.findOne({ where: { crm_user_id: crmUser } }) : null;
    b.booking_status = BookingStatus.Confirmed;
    b.confirmed_by_id = u?.id ?? null;
    b.updated_on = new Date();
    if (crmId && !b.crm_booking_id) b.crm_booking_id = crmId;
    await b.save();
  }

  private async taskUpdated(d: Data) {
    const crmId = str(d.crm_task_id);
    const status = str(d.task_status);
    if (!crmId || !status || !Object.values(TaskStatus).includes(status as TaskStatus))
      throw new Error("bad task.updated payload");
    const t = await task.findOne({ where: { crm_task_id: crmId } });
    if (!t) throw new Error("task not found");
    t.task_status = status;
    t.updated_on = new Date();
    await t.save();
  }

  // CRM sales user mirrored here. They get a random password, so they cannot log in to this console.
  private async userUpserted(d: Data) {
    const crmId = str(d.crm_user_id);
    const email = str(d.email);
    if (!crmId || !email) throw new Error("bad user.upserted payload");
    let u = (await user.findOne({ where: { crm_user_id: crmId } })) ?? (await user.findOne({ where: { email } }));
    if (u) {
      u.crm_user_id = crmId;
      u.first_name = str(d.first_name) ?? u.first_name;
      u.last_name = str(d.last_name) ?? u.last_name;
      u.updated_on = new Date();
      await u.save();
      return;
    }
    const role =
      (await user_role.findOne({ where: { name: str(d.role) ?? "agent" } })) ??
      (await user_role.findOne({ where: { name: "agent" } }));
    if (!role) throw new Error("no agent role");
    u = user.create({
      email,
      crm_user_id: crmId,
      first_name: str(d.first_name),
      last_name: str(d.last_name),
      user_role_id: role.id,
      password: this._Encryption.Encrypt(randomBytes(32).toString("hex")),
    } as any) as unknown as user;
    await u.save();
  }
}
