// Console "Restart chat": the bot starts again from NEW; STOP and safety pauses are never bypassed.
import { ConflictException, NotFoundException } from "@nestjs/common";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { consent } from "@Database/Table/Oxxy/consent";
import { customer } from "@Database/Table/Oxxy/customer";
import { follow_up } from "@Database/Table/Oxxy/follow_up";
import { ConversationState as S } from "@Helper/Enum/ConversationState";
import { ConversationRepository, RESTARTED, RESTARTED_FRESH } from "./ConversationRepository.service";

function repo(open: Record<string, unknown> | null, cons: Record<string, unknown> | null = { id: "k1" }) {
  const updates: [unknown, unknown, unknown][] = [];
  const queries: [string, unknown[]][] = [];
  const m = {
    findOne: jest.fn(async (entity: unknown) =>
      entity === conversation ? open : entity === consent ? cons : null,
    ),
    update: jest.fn(async (e: unknown, w: unknown, v: unknown) => {
      updates.push([e, w, v]);
    }),
    query: jest.fn(async (sql: string, p: unknown[]) => {
      queries.push([sql, p]);
    }),
    create: jest.fn((_e: unknown, v: unknown) => v),
    save: jest.fn(async (v: Record<string, unknown>) => ({ id: "fresh", ...v })),
  };
  const r = new ConversationRepository({ transaction: async (fn: (x: unknown) => unknown) => fn(m) } as never);
  return { r, m, updates, queries };
}

describe("Restart chat (console)", () => {
  const last = new Date("2026-11-16T03:00:00Z");
  const open = { id: "c1", customer_id: "u1", state: S.BookingCapture, last_customer_message_at: last };

  it("closes the chat, cancels scheduled messages, opens NEW with the same 24-hour window, forgets by default", async () => {
    const { r, updates, queries } = repo(open);
    const fresh = await r.restart("c1");
    expect(fresh).toMatchObject({ id: "fresh", customer_id: "u1", state: S.New, last_customer_message_at: last });
    expect(updates).toContainEqual([
      follow_up,
      { customer_id: "u1", follow_up_status: "scheduled" },
      expect.objectContaining({ follow_up_status: "cancelled", skip_reason: "chat restarted" }),
    ]);
    expect(queries[0][0]).toMatch(/closed_at" = now\(\)/);
    expect(queries[0][1]).toEqual(["u1", S.Closed, RESTARTED_FRESH]);
    expect(updates).toContainEqual([customer, { id: "u1" }, { age: null }]); // the age is asked again
    expect(updates.some(([e]) => e === consent)).toBe(false); // consent untouched unless asked
  });

  it("keep earlier details: the bot may still greet them as a returning customer", async () => {
    const { r, updates, queries } = repo(open);
    await r.restart("c1", { forgetEarlier: false });
    expect(queries[0][1]).toEqual(["u1", S.Closed, RESTARTED]);
    expect(updates.some(([e]) => e === customer)).toBe(false);
  });

  it("ask consent again: the health-data notice comes back; opt-out is never touched", async () => {
    const { r, updates } = repo(open);
    await r.restart("c1", { askConsentAgain: true });
    const c = updates.find(([e]) => e === consent)!;
    expect(c[2]).toMatchObject({ health_data_consent: false, notice_sent_at: null, consent_timestamp: null });
    expect(c[2]).not.toHaveProperty("opt_out_at");
  });

  it("never for an opted-out customer or during a safety pause; unknown id is 404", async () => {
    await expect(repo(open, { id: "k1", opt_out_at: new Date() }).r.restart("c1")).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(repo({ ...open, state: S.Pause }).r.restart("c1")).rejects.toThrow(/safety pause/);
    await expect(repo(null).r.restart("nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});
