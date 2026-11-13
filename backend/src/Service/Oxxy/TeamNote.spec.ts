// Full Plan 12.9: the hand-back note reaches the next prompts for a week
import { teamNote } from "./ChatPipeline.service";

const now = Date.UTC(2026, 10, 14, 6);
it("a fresh note is passed on, an old or empty one is not", () => {
  expect(teamNote({ handback_note: " Pays on the 1st ", handed_back_at: new Date(now - 3600_000) }, now)).toBe("Pays on the 1st");
  expect(teamNote({ handback_note: "old", handed_back_at: new Date(now - 8 * 86400_000) }, now)).toBeNull();
  expect(teamNote({ handback_note: "  ", handed_back_at: new Date(now) }, now)).toBeNull();
  expect(teamNote(null, now)).toBeNull();
});
