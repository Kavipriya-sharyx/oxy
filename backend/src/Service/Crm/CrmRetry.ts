import { CrmSyncStatus } from "@Helper/Enum/CrmSyncStatus";

// Full Development Plan 3.4 / 12 (CRM sync): retry at 1, 5, 15 and 60 minutes, then hourly for 24 hours,
// then dead letter + alert. A 4xx (bad request, unknown field) goes straight to dead letter.
const MIN = 60_000;
const FIRST = [1, 5, 15, 60].map((m) => m * MIN);
export const GIVE_UP_AFTER_MS = 24 * 60 * MIN;

// attempts = number of failed attempts so far (>= 1)
export function backoffMs(attempts: number): number {
  return FIRST[Math.max(0, attempts - 1)] ?? 60 * MIN;
}

// total wait before attempt n+1, i.e. how long the row has been retrying after n failures
export function elapsedMs(attempts: number): number {
  let t = 0;
  for (let i = 1; i < attempts; i++) t += backoffMs(i);
  return t;
}

// status: HTTP status of the failed call (undefined = timeout / network error)
export function failureState(
  attempts: number,
  maxAttempts: number,
  status?: number,
): CrmSyncStatus {
  if (status && status >= 400 && status < 500 && status !== 408 && status !== 429)
    return CrmSyncStatus.Dead;
  if (maxAttempts > 0 && attempts >= maxAttempts) return CrmSyncStatus.Dead;
  return elapsedMs(attempts) + backoffMs(attempts) > GIVE_UP_AFTER_MS
    ? CrmSyncStatus.Dead
    : CrmSyncStatus.Failed;
}
