// All guardrail keyword lists in one place, for review. English, Hindi (Devanagari) and Hinglish.
// Lists are written in plain form; GuardrailService normalises them the same way as the message
// (lowercase, punctuation removed, spaces collapsed), so "can't" and "cant" both work.

// Emergency and self-harm lean on over-triggering: matched anywhere inside the message.
export const EMERGENCY: string[] = [
  "chest pain",
  "heart attack",
  "can't breathe",
  "cannot breathe",
  "can not breathe",
  "not breathing",
  "difficulty breathing",
  "breathless",
  "face drooping",
  "unconscious",
  "severe bleeding",
  "heavy bleeding",
  "seizure",
  // Hinglish
  "seene mein dard",
  "saans nahi aa rahi",
  "saans nahi",
  "dil ka daura",
  "behosh",
  "khoon beh raha",
  "khoon bah raha",
  "khoon nahi ruk",
  "bahut khoon",
  // Hindi
  "सीने में दर्द",
  "सांस नहीं",
  "साँस नहीं",
  "दिल का दौरा",
  "बेहोश",
  "खून बह रहा",
  "खून नहीं रुक",
];

// These words are also normal plan questions ("is stroke covered?"), so they trigger only when the
// message has NO coverage word (COVERAGE_WORDS below). Bare "emergency" and "accident" are not
// triggers at all: only symptom phrases are.
export const EMERGENCY_UNLESS_COVERAGE_QUESTION: string[] = ["stroke", "overdose", "ambulance", "एम्बुलेंस"];

// Something is happening NOW. These ALWAYS trigger emergency, even when the message also has a
// coverage word ("my dad is having a stroke, will my plan cover it").
export const EMERGENCY_ACTIVE_EVENT: string[] = [
  "is having a stroke",
  "having a stroke",
  "had a stroke",
  "having a heart attack",
  "had a heart attack",
  "just collapsed",
  "taken an overdose",
  "call an ambulance",
  "need an ambulance",
  "send an ambulance",
  // Hinglish
  "stroke aaya hai",
  "stroke aa gaya",
  "behosh ho gaya",
  "behosh ho gayi",
  "ambulance bulao",
  // Hindi
  "बेहोश हो गए",
  "बेहोश हो गया",
  "बेहोश हो गई",
  "एम्बुलेंस बुलाओ",
];

// Matched as whole words.
export const COVERAGE_WORDS: string[] = [
  "cover", "covers", "covered", "coverage", "include", "includes", "included",
  "claim", "claims", "plan", "plans", "price", "policy", "insurance", "benefit", "benefits",
];

export const SELF_HARM: string[] = [
  "want to die",
  "kill myself",
  "suicide",
  "end my life",
  "hurt myself",
  "self harm",
  "self-harm",
  // Hinglish
  "marna chahta",
  "marna chahti",
  "jaan dena chahta",
  "jaan dena chahti",
  "mar jana chahta",
  "mar jana chahti",
  "khudkushi",
  "jeena nahi",
  // Hindi
  "आत्महत्या",
  "मरना चाहता",
  "मरना चाहती",
  "जान देना चाहता",
  "जान देना चाहती",
];

// STOP leans on precision: the WHOLE message must be one of these ...
export const STOP_WHOLE_MESSAGE: string[] = [
  "stop",
  "unsubscribe",
  "cancel messages",
  "band karo", // Hinglish: only as the whole message (inside a sentence it can mean anything)
  "बंद करो",
];

// Opt back in after STOP: only the WHOLE message counts (WhatsApp's own wording is "START").
// Checked only for a customer who is opted out, and only after the safety guardrails.
export const OPT_IN_WHOLE_MESSAGE: string[] = [
  "start",
  "unstop",
  "subscribe",
  "resubscribe",
  "start again",
  "start messages",
  "shuru karo", // Hinglish
  "शुरू करो",
  "शुरू",
];

// ... or the message contains one of these phrases (whole words). A bare "stop" inside a
// longer sentence ("bus stop", "I can't stop coughing") is NOT a match.
export const STOP_PHRASES: string[] = [
  "stop messaging",
  "stop messages",
  "stop sending",
  "stop calling",
  "do not contact",
  "don't contact",
  "dont contact",
  "opt out",
  "optout",
  // Hinglish
  "message mat bhejo",
  "messages mat bhejo",
  "msg mat bhejo",
  "message band karo",
  "messages band karo",
  // Hindi
  "मैसेज मत भेजो",
  "संदेश मत भेजो",
];

export const TALK_TO_PERSON: string[] = [
  "talk to a person",
  "talk to a human",
  "talk to someone",
  "talk to an agent",
  "speak to a person",
  "speak to a human",
  "speak to someone",
  "speak to an agent",
  "connect me to an agent",
  "customer care",
  "need a human",
  "human please",
  // Hinglish
  "insaan se baat",
  "insan se baat",
  "agent se baat karni hai",
  // Hindi
  "इंसान से बात",
  "एजेंट से बात",
];

// Privacy and complaint triggers (plan 12.7: privacy, then complaint/payment).
// They go BETWEEN STOP and TALK_TO_PERSON in the order inside GuardrailService.
export const PRIVACY_REQUEST: string[] = [
  "delete my data",
  "erase my data",
  "remove my data",
  "privacy request",
  "data deletion",
  "withdraw consent",
  // Hinglish
  "mera data delete karo",
  "data hatao",
];

export const COMPLAINT_PAYMENT: string[] = [
  "charged twice",
  "double charge",
  "deducted twice",
  "refund",
  "legal notice",
  "consumer court",
  "scam",
  "fraud",
  "complaint",
  // Hinglish
  "do baar paise kat gaye",
  "paise wapas",
];
