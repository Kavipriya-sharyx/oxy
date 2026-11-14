// The WhatsApp templates the bot sends, as submitted to Meta (docs/WHATSAPP_TEMPLATES.md explains each).
// scripts/submit-templates.ts creates the missing ones through the Graph API. Variable order = the code's
// `params` order. English only for now: Hindi versions wait for a native-speaker review (the code falls back
// to "en" until a Hindi version is approved, Templates.service templateLanguage()).
export const AGENT_NAME = "Asha";

export interface TemplateDef {
  name: string;
  language: string;
  category: "UTILITY" | "MARKETING";
  body: string;
  /** one example value per {{n}}, required by Meta */
  examples?: string[];
  footer?: string;
  quickReplies?: string[];
}

export const TEMPLATES: TemplateDef[] = [
  {
    name: "lead_intro",
    language: "en",
    category: "MARKETING",
    body: `Hello {{1}} ji, I am ${AGENT_NAME}, Oxxy Health's automated assistant. You recently showed interest in saving on healthcare expenses. May I ask one quick question to understand what you need?`,
    examples: ["Priya"],
    footer: "Reply STOP to opt out",
    quickReplies: ["Yes, please", "Just send details", "Not now"],
  },
  {
    name: "booking_confirmed",
    language: "en",
    category: "UTILITY",
    body: "Good news: your booking request at {{1}} for {{2}} has been confirmed by the Oxxy team. Please carry a photo ID. If you need to change it, reply here.",
    examples: ["City Care Hospital", "2026-12-01"],
  },
  {
    name: "booking_rescheduled",
    language: "en",
    category: "UTILITY",
    body: "Your booking request at {{1}} has been moved to {{2}}. The Oxxy team will contact you if anything else changes. Reply here if the new date does not suit you.",
    examples: ["City Care Hospital", "2026-12-03"],
  },
  {
    name: "booking_cancelled",
    language: "en",
    category: "UTILITY",
    body: "Your booking request at {{1}} for {{2}} could not go ahead. Would you like me to suggest another verified centre near you?",
    examples: ["City Care Hospital", "2026-12-01"],
    quickReplies: ["Yes", "No"],
  },
  {
    name: "booking_cancelled_info",
    language: "en",
    category: "UTILITY",
    body: "Your booking request at {{1}} for {{2}} could not go ahead. If you would like help with another request, just reply here.",
    examples: ["City Care Hospital", "2026-12-01"],
  },
  {
    name: "activation_confirmed",
    language: "en",
    category: "UTILITY",
    body: "Thank you. Your payment for {{1}} has been verified. The Oxxy team will guide you regarding activation status and the next service step.",
    examples: ["Oxxy Vital"],
  },
  {
    name: "activation_reminder",
    language: "en",
    category: "UTILITY",
    body: "Would you like help understanding the plan, completing the official activation, or pausing for now?",
  },
  {
    name: "agreed_follow_up",
    language: "en",
    category: "UTILITY",
    body: "Hello {{1}} ji. As agreed, I am following up about {{2}} and {{3}}. Would you like to continue with the booking request, activation or a question?",
    examples: ["Priya", "your healthcare requirement", "Oxxy"],
  },
  {
    name: "conversation_rescue_1",
    language: "en",
    category: "MARKETING",
    body: "Just checking whether you would like a short answer or prefer to continue later.",
    footer: "Reply STOP to opt out",
  },
  {
    name: "conversation_rescue_2",
    language: "en",
    category: "MARKETING",
    body: "I will pause here so I do not disturb you. You can message Oxxy whenever convenient.",
    footer: "Reply STOP to opt out",
  },
];

/** Graph API body for POST /{WABA_ID}/message_templates */
export function metaTemplateBody(t: TemplateDef) {
  const components: Record<string, unknown>[] = [
    {
      type: "BODY",
      text: t.body,
      ...(t.examples?.length ? { example: { body_text: [t.examples] } } : {}),
    },
  ];
  if (t.footer) components.push({ type: "FOOTER", text: t.footer });
  if (t.quickReplies?.length)
    components.push({ type: "BUTTONS", buttons: t.quickReplies.map((text) => ({ type: "QUICK_REPLY", text })) });
  return { name: t.name, language: t.language, category: t.category, components };
}
