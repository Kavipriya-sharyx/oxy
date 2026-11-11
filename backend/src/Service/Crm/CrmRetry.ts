import { CrmSyncStatus } from "@Helper/Enum/CrmSyncStatus";

// 30s, 60s, 2m, 4m ... capped at 1 hour. attempts = number of failed attempts so far (>= 1).
export function backoffMs(attempts: number): number {
  const ms = 30_000 * 2 ** Math.max(0, attempts - 1);
  return Math.min(ms, 60 * 60 * 1000);
}

export function failureState(attempts: number, maxAttempts: number): CrmSyncStatus {
  return attempts >= maxAttempts ? CrmSyncStatus.Dead : CrmSyncStatus.Failed;
}
