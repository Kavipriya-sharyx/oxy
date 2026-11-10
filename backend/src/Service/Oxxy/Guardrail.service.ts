import { Injectable } from "@nestjs/common";

export type GuardrailKind = "emergency" | "self_harm" | "stop";
export interface GuardrailHit {
  kind: GuardrailKind;
  reply: string | null; // null = send nothing
}

const EMERGENCY = [
  "chest pain",
  "heart attack",
  "can't breathe",
  "cannot breathe",
  "not breathing",
  "difficulty breathing",
  "unconscious",
  "severe bleeding",
  "heavy bleeding",
  "stroke",
  "seizure",
  "overdose",
  "ambulance",
  "emergency",
  "accident",
  "saans nahi",
  "seene mein dard",
  "behosh",
  "बेहोश",
  "सीने में दर्द",
  "सांस नहीं",
];
const SELF_HARM = [
  "suicide",
  "kill myself",
  "end my life",
  "want to die",
  "self harm",
  "self-harm",
  "hurt myself",
  "khudkushi",
  "jeena nahi",
  "mar jana chahta",
  "mar jana chahti",
  "आत्महत्या",
  "मरना चाहता",
  "मरना चाहती",
];
const STOP_RE = /^\s*(stop|unsubscribe|opt[\s-]?out)\s*[.!]*\s*$/i;

export const EMERGENCY_REPLY =
  "This sounds like an emergency. Please call 112 or 108 (ambulance) right now, or go to the nearest hospital. " +
  "Please do not wait for a reply here.";
export const SELF_HARM_REPLY =
  "I am really sorry you are going through this. You are not alone. Please call Tele-MANAS on 14416 " +
  "(free, 24x7) to talk to someone right now. If you are in immediate danger, call 112.";

@Injectable()
export class GuardrailService {
  // Order matters: emergency, self-harm, STOP
  check(text: string): GuardrailHit | null {
    const t = (text || "").toLowerCase();
    if (EMERGENCY.some((k) => t.includes(k))) return { kind: "emergency", reply: EMERGENCY_REPLY };
    if (SELF_HARM.some((k) => t.includes(k))) return { kind: "self_harm", reply: SELF_HARM_REPLY };
    if (STOP_RE.test(text || "")) return { kind: "stop", reply: null };
    return null;
  }
}
