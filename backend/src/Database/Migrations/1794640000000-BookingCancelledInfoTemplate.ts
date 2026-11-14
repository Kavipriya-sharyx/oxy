import { MigrationInterface, QueryRunner } from "typeorm";

// Full Plan 3.3 booking.cancelled: the first cancellation in a conversation uses booking_cancelled (asks once
// whether to suggest another centre, YES / NO buttons); any later one uses booking_cancelled_info (no question).
export class BookingCancelledInfoTemplate1794640000000 implements MigrationInterface {
  name = "BookingCancelledInfoTemplate1794640000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `INSERT INTO "wa_template" ("name", "language", "category", "purpose") VALUES ($1, 'en', 'UTILITY', $2)
       ON CONFLICT DO NOTHING`,
      ["booking_cancelled_info", "A later booking cancellation in the same conversation: informs only, no rebooking offer"],
    );
    await q.query(
      `UPDATE "wa_template" SET "purpose" = $1 WHERE "name" = 'booking_cancelled'`,
      ["The booking was cancelled (CRM booking.cancelled): offers another centre once (YES / NO buttons)"],
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM "wa_template" WHERE "name" = 'booking_cancelled_info'`);
  }
}
