import { MigrationInterface, QueryRunner } from "typeorm";

// Client sequences 2 and 3 (20 Nov): the "Book Appointment" and "Why Overpay Your Medical Bills?" cards as Meta
// templates (Helper/TemplateDefinitions.ts), listed on the WhatsApp templates page so their Meta status is tracked.
export class AppointmentTemplates1794780000000 implements MigrationInterface {
  name = "AppointmentTemplates1794780000000";

  public async up(q: QueryRunner): Promise<void> {
    for (const [name, purpose] of [
      [
        "oxxy_why_overpay",
        "First card (client sequence 3): picture + Why Overpay, Reduce My Bill / Book Appointment",
      ],
      ["oxxy_book_appointment", "Booking card (client sequence 2): picture + Book Appointment"],
    ])
      await q.query(
        `INSERT INTO "wa_template" ("name", "language", "category", "purpose") VALUES ($1, 'en', 'MARKETING', $2)
         ON CONFLICT DO NOTHING`,
        [name, purpose],
      );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DELETE FROM "wa_template" WHERE "name" IN ('oxxy_why_overpay', 'oxxy_book_appointment')`,
    );
  }
}
