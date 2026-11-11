import { backoffMs, failureState } from "./CrmRetry";
import { CrmSyncStatus } from "@Helper/Enum/CrmSyncStatus";

describe("CrmRetry", () => {
  it("backs off exponentially and caps at 1 hour", () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(3)).toBe(120_000);
    expect(backoffMs(20)).toBe(3_600_000);
  });
  it("goes failed until max attempts, then dead", () => {
    expect(failureState(1, 8)).toBe(CrmSyncStatus.Failed);
    expect(failureState(7, 8)).toBe(CrmSyncStatus.Failed);
    expect(failureState(8, 8)).toBe(CrmSyncStatus.Dead);
  });
});
