import { inboxSearch, pageSize, previewOf, withInboxSummary } from "./Console.controller";
import { conversation } from "@Database/Table/Oxxy/conversation";

describe("conversations inbox", () => {
  it("search: lower-case term, digits only for a phone number", () => {
    expect(inboxSearch("  Ravi ")).toEqual({ term: "ravi", digits: "" });
    expect(inboxSearch("+91 98400 12345")).toEqual({
      term: "+91 98400 12345",
      digits: "919840012345",
    });
    expect(inboxSearch("98")).toEqual({ term: "98", digits: "" });
    expect(inboxSearch("")).toBeNull();
    expect(inboxSearch(undefined)).toBeNull();
  });

  it("page size is 1..300, 100 by default", () => {
    expect(pageSize()).toBe(100);
    expect(pageSize("200")).toBe(200);
    expect(pageSize("5000")).toBe(300);
    expect(pageSize("-3")).toBe(1);
    expect(pageSize("abc")).toBe(100);
  });

  it("preview: one short line", () => {
    expect(previewOf({ body: "hello\n\n  there" })).toBe("hello there");
    expect(previewOf({ body: "x".repeat(200) })).toHaveLength(90);
    expect(previewOf({ body: null, template_name: "booking_confirmed" })).toBe(
      "Template: booking_confirmed",
    );
    expect(previewOf({ body: null, type: "image" })).toBe("[image]");
  });

  it("adds the last message, waiting count and open booking to each row", async () => {
    const q = jest
      .spyOn(conversation, "query")
      .mockResolvedValueOnce([
        {
          conversation_id: "c1",
          direction: "in",
          sender: "customer",
          body: "price?",
          created_on: "2026-11-14T10:00:00Z",
        },
      ])
      .mockResolvedValueOnce([{ conversation_id: "c1", n: "2" }])
      .mockResolvedValueOnce([{ customer_id: "u2" }]);
    const rows = await withInboxSummary([
      { id: "c1", customer_id: "u1" } as any,
      { id: "c2", customer_id: "u2" } as any,
    ]);
    expect(rows[0]).toMatchObject({
      last_message: { direction: "in", text: "price?" },
      waiting: 2,
      open_booking: false,
    });
    expect(rows[1]).toMatchObject({ last_message: null, waiting: 0, open_booking: true });
    expect(q).toHaveBeenCalledTimes(3);
    q.mockRestore();
  });
});
