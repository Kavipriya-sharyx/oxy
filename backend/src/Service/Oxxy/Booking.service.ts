import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { booking_request } from "@Database/Table/Oxxy/booking_request";
import { BookingStatus } from "@Helper/Enum/BookingStatus";
import { DateWindowService } from "./DateWindow.service";
import { DataSource } from "typeorm";
import { user } from "@Database/Table/Admin/user";
import { CrmOutboxService } from "@Service/Crm/CrmOutbox.service";
import { CrmAction } from "@Helper/Enum/CrmAction";

export interface CreateBooking {
  customer_id: string;
  conversation_id: string;
  centre_id: string;
  specialisation?: string;
  preferred_date: string;
  preferred_time?: string;
}

@Injectable()
export class BookingService {
  constructor(
    private readonly _DateWindow: DateWindowService,
    private readonly _DataSource: DataSource,
    private readonly _Outbox: CrmOutboxService,
  ) {}

  // Bot path: always saved as pending_confirmation
  async create(data: CreateBooking) {
    const check = this._DateWindow.validate(data.preferred_date);
    if (!check.valid) {
      throw new BadRequestException(
        `Booking date must be between ${check.min} and ${check.max} (${check.reason})`,
      );
    }
    // booking + CRM outbox row in one transaction
    const { b, ob } = await this._DataSource.transaction(async (m) => {
      const saved = await m.save(
        m.create(booking_request, { ...data, booking_status: BookingStatus.PendingConfirmation } as any),
      );
      const row = await this._Outbox.enqueue(m, CrmAction.CreateBookingRequest, data.customer_id, {
        booking_id: (saved as any).id,
        ...data,
      });
      return { b: saved as any, ob: row };
    });
    await this._Outbox.dispatch(ob);
    return b;
  }

  // Human path: only called from the JWT-protected controller
  async confirm(id: string, userId: string) {
    const b = await booking_request.findOne({ where: { id } });
    if (!b) throw new NotFoundException("Booking not found");
    if (b.booking_status !== BookingStatus.PendingConfirmation)
      throw new BadRequestException("Booking is not pending");
    b.booking_status = BookingStatus.Confirmed;
    b.confirmed_by_id = userId;
    b.updated_by_id = userId;
    b.updated_on = new Date();
    const u = await user.findOne({ where: { id: userId } });
    const ob = await this._DataSource.transaction(async (m) => {
      await m.save(b);
      return await this._Outbox.enqueue(m, CrmAction.ConfirmBooking, b.customer_id, {
        booking_id: b.id,
        crm_booking_id: b.crm_booking_id ?? null,
        confirmed_by_crm_user_id: u?.crm_user_id ?? null,
      });
    });
    await this._Outbox.dispatch(ob);
    return b;
  }

  async listPending() {
    return await booking_request.find({
      where: { booking_status: BookingStatus.PendingConfirmation },
      relations: ["customer", "centre"],
    });
  }
}
