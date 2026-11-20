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
  /** buttons that open a web address (max 2), after the quick replies */
  urlButtons?: { text: string; url: string }[];
  /** picture header: a local image file uploaded to Meta as the example (scripts/submit-templates.ts) */
  headerImage?: string;
}

// Official links (Q&A knowledge base 3, client's current bot). Overridable for staging.
export const OXXY_LINKS = {
  website: process.env.OXXY_WEBSITE_URL || "https://www.oxxy.in",
  stories: process.env.OXXY_STORIES_URL || "https://www.oxxy.in/customer_stories",
  media: process.env.OXXY_MEDIA_URL || "https://www.oxxy.in/media_article",
  policies: process.env.OXXY_POLICIES_URL || "https://www.oxxy.in/policies",
  calculator: process.env.OXXY_CALCULATOR_URL || "https://www.oxxy.in/plan_calculator",
};
/** The logo shown on the welcome / calculator cards (local file for the Meta template example) */
export const LOGO_FILE = "../frontend/public/oxxy-logo.png";
/** The client's picture for the "Reduce Your Medical Bill Now" card (sequence 1, 20 Nov) */
export const BILL_IMAGE_FILE = "../frontend/public/oxxy-bill-card.jpg";
/** The client's pictures for sequence 2 (Book Appointment) and sequence 3 (Why Overpay), 20 Nov */
export const BOOK_IMAGE_FILE = "../frontend/public/oxxy-book-card.jpg";
export const OVERPAY_IMAGE_FILE = "../frontend/public/oxxy-overpay-card.jpg";
/** The client's "Why Choose Oxxy Medical Discount Plans?" comparison picture (Learn More, 20 Nov) */
export const COMPARE_IMAGE_FILE = "../frontend/public/oxxy-compare-card.jpg";

// The client's current WhatsApp welcome, word for word (client, 17 Nov: "first message like this")
export const WELCOME_CARD_TEXT =
  "Welcome to Oxxy HealthCare!\nHello 👋\n\nWe’re happy to have you with us. With Oxxy, you can access exclusive healthcare benefits and discounts at our partner hospitals, diagnostic centres, path labs and more across India.\n\nYour healthcare journey with us starts here. 💚";

export const VERIFY_CARD_TEXT = `Verify Our Healthcare Services\n\nHello 👋\n🏥 It is sensible to verify any healthcare service before paying. For your convenience, I am sharing Customer Testimonials, News articles, Oxxy’s official website & policy page.\n1. Customer Testimonials: ${OXXY_LINKS.stories}\n2. News Articles: ${OXXY_LINKS.media}\n3. Official Website: ${OXXY_LINKS.website}\n4. Policy Page: ${OXXY_LINKS.policies}\nHope that clarifies your doubts!`;

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
  // ---- Voice-aligned flow (client, 17 Nov): the same cards as the client's current bot, as templates so
  // they can also start a chat outside the 24-hour window (after a voice call, a follow-up). Inside the
  // window the bot sends the same content as interactive messages (Helper/GuidedFlow.ts).
  {
    name: "oxxy_welcome",
    language: "en",
    category: "MARKETING",
    headerImage: LOGO_FILE,
    body: WELCOME_CARD_TEXT,
    footer: "Reply STOP to opt out",
    quickReplies: ["Get Started", "Visit Our Website", "Contact Us"],
  },
  {
    name: "oxxy_verify_services",
    language: "en",
    category: "MARKETING",
    headerImage: LOGO_FILE,
    body: VERIFY_CARD_TEXT,
    footer: "Oxxy Healthcare",
    quickReplies: ["Main Menu"],
    urlButtons: [
      { text: "Customer Testimonial", url: OXXY_LINKS.stories },
      { text: "News Articles", url: OXXY_LINKS.media },
    ],
  },
  {
    name: "oxxy_savings_calculator",
    language: "en",
    category: "MARKETING",
    headerImage: LOGO_FILE,
    body: "Calculator: see how much you can save.\n\nYou mentioned a yearly medical expense of about ₹{{1}}. Oxxy can help you save up to ₹{{2}}. The actual saving depends on the services and providers used.",
    examples: ["50,000", "15,000"],
    quickReplies: ["Activate Plan", "Main Menu"],
    urlButtons: [{ text: "Calculate Now", url: OXXY_LINKS.calculator }],
  },
  {
    name: "oxxy_plan_recommendation",
    language: "en",
    category: "MARKETING",
    body: "Hello {{1}}, based on what you shared, the Oxxy {{2}} plan fits best because {{3}}.\n\nPrice ({{7}}):\nPlan cost: ₹{{4}}\n+ GST (18%): ₹{{5}}\n= Final payable: ₹{{6}}\n\nWould you like to activate your Oxxy care plan?",
    examples: [
      "Priya",
      "Infinity",
      "it has no age limit and no upper eligible bill limit",
      "40,000",
      "7,200",
      "47,200",
      "yearly",
    ],
    footer: "Reply STOP to opt out",
    quickReplies: ["Activate Now", "Add Family Member", "Talk to Expert"],
  },
  {
    name: "oxxy_terms",
    language: "en",
    category: "UTILITY",
    body: "Please view all our terms and conditions before proceeding with your Oxxy care plan.",
    quickReplies: ["Main Menu"],
    urlButtons: [{ text: "Terms & Conditions", url: OXXY_LINKS.policies }],
  },
  // ---- Client sequence 1 (20 Nov): the first card, to start a chat outside the 24-hour window. Inside the
  // window the bot sends the same card as an interactive message (Service/Oxxy/BillCard.ts). A tap on a quick
  // reply arrives as the button text, which handleBillCard reads like the ids.
  {
    name: "oxxy_reduce_bill",
    language: "en",
    category: "MARKETING",
    headerImage: BILL_IMAGE_FILE,
    body: "*Reduce Your Medical Bill Now*\n\nGet an instant discount of up to 40% on hospital, diagnostic centre and path lab bills across India with Oxxy.",
    footer: "Reply STOP to opt out",
    quickReplies: ["Calculate discount", "Learn More", "Activate Oxxy"],
  },
  // ---- Client sequences 3 and 2 (20 Nov): the first card and the booking card (Service/Oxxy/BookCard.ts).
  // "Reduce My Bill" opens the bill card; "Book Appointment" starts the booking (handleAppointment).
  {
    name: "oxxy_why_overpay",
    language: "en",
    category: "MARKETING",
    headerImage: OVERPAY_IMAGE_FILE,
    body: "*Why Overpay Your Medical Bills?*\n\nWith Oxxy you get an instant discount on hospital, diagnostic centre and path lab bills across India. Choose how we can help you:",
    footer: "Reply STOP to opt out",
    quickReplies: ["Reduce My Bill", "Book Appointment"],
  },
  {
    name: "oxxy_book_appointment",
    language: "en",
    category: "MARKETING",
    headerImage: BOOK_IMAGE_FILE,
    body: "*Book Appointment*\n\nBook your visit to a hospital or diagnostic centre near you, and get a medical discount on your bill with Oxxy.",
    footer: "Reply STOP to opt out",
    quickReplies: ["Book Appointment"],
  },
  // Learn More (20 Nov): the client's comparison picture; inside the window the same card is billCompareCard
  {
    name: "oxxy_learn_more",
    language: "en",
    category: "MARKETING",
    headerImage: COMPARE_IMAGE_FILE,
    body: "*Why Choose Oxxy Medical Discount Plans?*\n\nOxxy gives instant discounts on hospital stays, diagnostics, medicines, doctor consultations, surgeries and health packages across India. Oxxy is not insurance: it works alongside any insurance you already have, so please keep your insurance.",
    footer: "Reply STOP to opt out",
    quickReplies: ["Calculate discount", "Activate Oxxy", "Main Menu"],
  },
];

/**
 * Graph API body for POST /{WABA_ID}/message_templates. `headerHandle` = the uploaded example image
 * (Resumable Upload API); a template with a picture header cannot be created without it.
 */
export function metaTemplateBody(t: TemplateDef, headerHandle?: string) {
  const components: Record<string, unknown>[] = [];
  if (t.headerImage && headerHandle)
    components.push({
      type: "HEADER",
      format: "IMAGE",
      example: { header_handle: [headerHandle] },
    });
  components.push({
    type: "BODY",
    text: t.body,
    ...(t.examples?.length ? { example: { body_text: [t.examples] } } : {}),
  });
  if (t.footer) components.push({ type: "FOOTER", text: t.footer });
  const buttons = [
    ...(t.quickReplies ?? []).map((text) => ({ type: "QUICK_REPLY", text })),
    ...(t.urlButtons ?? []).map((b) => ({ type: "URL", text: b.text, url: b.url })),
  ];
  if (buttons.length) components.push({ type: "BUTTONS", buttons });
  return { name: t.name, language: t.language, category: t.category, components };
}
