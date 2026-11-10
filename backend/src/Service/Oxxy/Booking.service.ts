import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { booking_request } from "@Database/Table/Oxxy/booking_request";
import { BookingStatus } from "@Helper/Enum/BookingStatus";
import { DateWindowService } from "./DateWindow.service";

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
  constructor(private readonly _DateWindow: DateWindowService) {}

  // Bot path: always saved as pending_confirmation
  async create(data: CreateBooking) {
    const check = this._DateWindow.validate(data.preferred_date);
    if (!check.valid) {
      throw new BadRequestException(
        `Booking date must be between ${check.min} and ${check.max} (${check.reason})`,
      );
    }
    const b = booking_request.create({
      ...data,
      booking_status: BookingStatus.PendingConfirmation,
    } as any);
    return await booking_request.save(b as any);
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
    return await b.save();
  }

  async listPending() {
    return await booking_request.find({
      where: { booking_status: BookingStatus.PendingConfirmation },
      relations: ["customer", "centre"],
    });
  }
}
