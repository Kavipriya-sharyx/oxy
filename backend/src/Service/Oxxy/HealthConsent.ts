import { NOTICE_VERSION } from "@Helper/FixedReplies";
import {
  CONSENT_NO,
  CONSENT_YES,
  HEALTH_FIELDS,
  HEALTH_QUESTION_TERMS,
} from "@Helper/HealthConsentKeywords";
import { normalise } from "./Guardrail.service";

// The parts of the consent row the gate needs
export interface HealthConsentRow {
  health_data_consent?: boolean | null;
  notice_version?: string | null;
  consent_timestamp?: Date | null;
  health_refused_at?: Date | null;
  health_refused_version?: string | null;
  notice_sent_at?: Date | null;
  notice_sent_version?: string | null;
}

// granted  = YES saved for the CURRENT notice version -> health questions allowed
// refused  = NO saved for the current version         -> never ask health questions
// awaiting = notice sent (current version), no answer yet -> read the answer
// none     = nothing valid for the current version (new customer, or the notice changed) -> send the notice
export type HealthConsentStatus = "granted" | "refused" | "awaiting" | "none";

export function healthConsentStatus(
  c: HealthConsentRow | null | undefined,
  version: string = NOTICE_VERSION,
): HealthConsentStatus {
  if (!c) return "none";
  // consent only counts when it is true, saved with a timestamp, and made for THIS notice version
  if (c.health_data_consent === true && c.consent_timestamp && c.notice_version === version) return "granted";
  if (c.health_refused_at && c.health_refused_version === version) return "refused";
  if (c.notice_sent_at && c.notice_sent_version === version) return "awaiting";
  return "none";
}

const YES = CONSENT_YES.map(normalise);
const NO = CONSENT_NO.map(normalise);

// Deterministic: the WHOLE message must be a listed answer. Silence, a different question or
// "yes but no" are "unclear". Never decided by Claude.
export function parseConsentAnswer(text: string): "yes" | "no" | "unclear" {
  const t = normalise(text);
  if (!t) return "unclear";
  const yes = YES.includes(t);
  const no = NO.includes(t);
  if (yes && !no) return "yes";
  if (no && !yes) return "no";
  return "unclear";
}

const TERMS = HEALTH_QUESTION_TERMS.map((t) => t.toLowerCase());
const ASK = /^\s*(please\s+)?(tell|share|describe|let me know|inform|batao|bataiye|बताइए|बताएं|बताओ)/i;

// True when the text asks the customer for health information (a question sentence, or "please tell me ..."
// sentence, containing a health term). Over-flags on purpose: a flagged reply is never sent.
export function asksHealthQuestion(text: string): boolean {
  const sentences = (text || "").split(/(?<=[.?!।])\s+|\n+/);
  return sentences.some((s) => {
    const low = s.toLowerCase();
    if (!TERMS.some((t) => low.includes(t))) return false;
    return s.includes("?") || ASK.test(s);
  });
}

// Health fields removed from what Claude extracted (customer refused)
export function withoutHealthFields<T extends Record<string, unknown>>(fields: T): T {
  const copy: Record<string, unknown> = { ...fields };
  for (const k of HEALTH_FIELDS) delete copy[k];
  return copy as T;
}
