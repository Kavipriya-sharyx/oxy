import { backoffMs, elapsedMs, failureState, GIVE_UP_AFTER_MS } from "./CrmRetry";
import { CrmSyncStatus } from "@Helper/Enum/CrmSyncStatus";

const MIN = 60_000;

describe("CrmRetry", () => {
  it("retries at 1, 5, 15, 60 minutes, then hourly", () => {
    expect([1, 2, 3, 4, 5, 9].map(backoffMs)).toEqual([1, 5, 15, 60, 60, 60].map((m) => m * MIN));
  });

  it("keeps retrying for 24 hours, then dead letter", () => {
    let n = 1;
    while (failureState(n, 0) === CrmSyncStatus.Failed) n++;
    expect(elapsedMs(n)).toBeLessThanOrEqual(GIVE_UP_AFTER_MS);
    expect(elapsedMs(n) + backoffMs(n)).toBeGreaterThan(GIVE_UP_AFTER_MS);
    expect(elapsedMs(n)).toBeGreaterThan(22 * 60 * MIN); // close to a full day, not 2 hours
  });

  it("sends a 4xx straight to dead letter, but retries 408 / 429 / 5xx / timeouts", () => {
    expect(failureState(1, 0, 422)).toBe(CrmSyncStatus.Dead);
    expect(failureState(1, 0, 400)).toBe(CrmSyncStatus.Dead);
    expect(failureState(1, 0, 429)).toBe(CrmSyncStatus.Failed);
    expect(failureState(1, 0, 503)).toBe(CrmSyncStatus.Failed);
    expect(failureState(1, 0, undefined)).toBe(CrmSyncStatus.Failed);
  });

  it("still honours an explicit CRM_MAX_ATTEMPTS", () => {
    expect(failureState(8, 8)).toBe(CrmSyncStatus.Dead);
  });
});
