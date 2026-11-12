// Keyword lists for the DPDP health-data consent step, in one place for review.
// English, Hindi (Devanagari) and Hinglish. Matched against the WHOLE message after normalising
// (lowercase, punctuation removed, spaces collapsed). Anything not listed is "unclear" and the
// question is asked again: consent is never guessed.

export const CONSENT_YES: string[] = [
  "yes",
  "y",
  "yeah",
  "yep",
  "i agree",
  "yes i agree",
  "agree",
  "i consent",
  "yes i consent",
  "i accept",
  "accept",
  // Hinglish
  "haan",
  "han",
  "ha",
  "haan ji",
  "ji haan",
  "haanji",
  "main sehmat hoon",
  "sehmat hoon",
  // Hindi
  "हाँ",
  "हां",
  "हा",
  "जी हाँ",
  "जी हां",
  "मैं सहमत हूँ",
  "मैं सहमत हूं",
  "सहमत",
];

export const CONSENT_NO: string[] = [
  "no",
  "n",
  "nope",
  "no thanks",
  "no thank you",
  "not now",
  "i do not agree",
  "i dont agree",
  "i disagree",
  "disagree",
  "i refuse",
  "refuse",
  "i do not consent",
  "i dont consent",
  // Hinglish
  "nahi",
  "nahin",
  "nahi chahiye",
  "main sehmat nahi hoon",
  "sehmat nahi hoon",
  // Hindi
  "नहीं",
  "नही",
  "ना",
  "नहीं चाहिए",
  "मैं सहमत नहीं हूँ",
  "मैं सहमत नहीं हूं",
  "असहमत",
];

// Words that make a SENTENCE a health question when it is a question (or an ask like "please tell me ...").
// Used only for customers who refused: Claude's reply is checked before it is sent.
export const HEALTH_QUESTION_TERMS: string[] = [
  "symptom",
  "medical history",
  "health condition",
  "health issue",
  "health problem",
  "your health",
  "healthcare need",
  "health need",
  "medical condition",
  "medical need",
  "illness",
  "disease",
  "diagnos",
  "medication",
  "medicine",
  "treatment",
  "surgery",
  "specialis",
  "specializ",
  "medical spend",
  "medical expense",
  "medical bill",
  "expected bill",
  "hospital bill",
  "kind of care",
  "type of care",
  "kind of healthcare",
  "pain",
  // Hinglish
  "bimari",
  "beemari",
  "ilaaj",
  "ilaj",
  "dawai",
  "takleef",
  "swasthya",
  "medical kharcha",
  // Hindi
  "बीमारी",
  "लक्षण",
  "इलाज",
  "दवा",
  "स्वास्थ्य",
  "तकलीफ",
  "दर्द",
];

// Fields Claude may extract that are health information: dropped for a customer who refused.
export const HEALTH_FIELDS: string[] = [
  "healthcare_need",
  "specialisation",
  "annual_medical_spend",
  "expected_bill",
  "insurance_status",
];
