import { Injectable } from "@nestjs/common";
import {
  COMPLAINT_PAYMENT,
  COVERAGE_WORDS,
  EMERGENCY,
  EMERGENCY_ACTIVE_EVENT,
  EMERGENCY_UNLESS_COVERAGE_QUESTION,
  OPT_IN_WHOLE_MESSAGE,
  PRIVACY_REQUEST,
  SELF_HARM,
  STOP_PHRASES,
  STOP_WHOLE_MESSAGE,
  TALK_TO_PERSON,
} from "@Helper/GuardrailKeywords";

export type GuardrailKind = "emergency" | "self_harm" | "stop" | "privacy" | "complaint" | "person";

export interface GuardrailHit {
  kind: GuardrailKind; // the trigger that decides the reply (first in the order below)
  also_stop: boolean; // the same message also contains an opt-out (e.g. "STOP, I have chest pain")
}

// lowercase, punctuation removed (so "can't" = "cant"), spaces collapsed
export function normalise(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/[-_/]/g, " ")
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const norm = (list: string[]) => list.map(normalise);
const L = {
  emergency: norm(EMERGENCY),
  emergencyActive: norm(EMERGENCY_ACTIVE_EVENT),
  emergencyUnlessCoverage: norm(EMERGENCY_UNLESS_COVERAGE_QUESTION),
  coverage: norm(COVERAGE_WORDS),
  selfHarm: norm(SELF_HARM),
  stopWhole: norm(STOP_WHOLE_MESSAGE),
  stopPhrases: norm(STOP_PHRASES),
  privacy: norm(PRIVACY_REQUEST),
  complaint: norm(COMPLAINT_PAYMENT),
  person: norm(TALK_TO_PERSON),
};

// "STOP, I have chest pain" / "I want to die. Unsubscribe": the message starts with the word, or ends with it after punctuation.
// Only used to ALSO record an opt-out next to a safety reply; never to trigger by itself.
const STOP_BESIDE_SAFETY = /^\s*(stop|unsubscribe)\b|[,.;\-–—]\s*(stop|unsubscribe)\s*[.!]*\s*$/i;

const OPT_IN = norm(OPT_IN_WHOLE_MESSAGE);
/** "START" and friends, as the whole message: the opted-out customer asks for messages again */
export function isOptIn(text: string): boolean {
  return OPT_IN.includes(normalise(text));
}

const anywhere = (t: string, list: string[]) => list.some((k) => t.includes(k)); // over-triggers on purpose
const wholeWords = (t: string, list: string[]) => list.some((k) => ` ${t} `.includes(` ${k} `)); // precise

@Injectable()
export class GuardrailService {
  // Order matters, first hit decides: emergency, self-harm, STOP, [privacy, complaint later], talk to a person.
  check(text: string): GuardrailHit | null {
    const t = normalise(text);
    if (!t) return null;
    const stop = L.stopWhole.includes(t) || wholeWords(t, L.stopPhrases);

    const safetyStop = stop || STOP_BESIDE_SAFETY.test(text);

    const emergency =
      anywhere(t, L.emergency) ||
      anywhere(t, L.emergencyActive) ||
      (anywhere(t, L.emergencyUnlessCoverage) && !wholeWords(t, L.coverage));
    if (emergency) return { kind: "emergency", also_stop: safetyStop };
    if (anywhere(t, L.selfHarm)) return { kind: "self_harm", also_stop: safetyStop };
    if (stop) return { kind: "stop", also_stop: true };
    if (anywhere(t, L.privacy)) return { kind: "privacy", also_stop: false };
    if (anywhere(t, L.complaint)) return { kind: "complaint", also_stop: false };
    if (wholeWords(t, L.person)) return { kind: "person", also_stop: false };
    return null;
  }
}
