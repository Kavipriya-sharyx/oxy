// Integration guide for the client's VOICE AGENT developers (Admin > Developer > Voice agent API docs).
// The voice agent talks to customers on the phone; when a customer wants the details on WhatsApp it hands the
// conversation to the bot (StartConversation), sends the client's WhatsApp templates during the call
// (SendTemplate), and it can use the same customer actions as the CRM during the
// call. Endpoint details are shared with the CRM guide (data/apiDocs.ts ACTIONS); this file holds what is
// specific to a voice agent. {{BASE}} is replaced with this server's address.
import { ACTIONS, type DocEndpoint } from "./apiDocs";

export const VOICE_DOC_VERSION = "1.2 (21 Nov 2026)";

/** The calls a voice agent uses, in the order of a call */
const ORDER = [
  "lookup-customer",
  "start-conversation",
  "get-official-plan",
  "send-voice-template",
  "search-centres",
  "create-booking-request",
  "create-follow-up",
  "create-escalation",
  "set-opt-out",
];
// A voice agent knows the phone number, not the bot's customer_id: its examples use wa_number (customer_id
// still works when it saved the one LookupCustomer / StartConversation returned).
const BY_NUMBER = /"customer_id": "511f3b99-db54-4ee4-9db2-d36296b94988"/g;
export const VOICE_ACTIONS: DocEndpoint[] = ORDER.map((id) => {
  const a = ACTIONS.find((x) => x.id === id);
  if (!a) throw new Error(`voice docs: no action ${id}`);
  return {
    ...a,
    request: a.request.replace(BY_NUMBER, '"wa_number": "919840012345"'),
    body: a.body?.map((f) =>
      f.name === "customer_id or wa_number"
        ? {
            ...f,
            name: "wa_number (or customer_id)",
            type: "string",
            desc: "The number you called, in any Indian format. customer_id also works if you saved it from LookupCustomer or StartConversation.",
          }
        : f,
    ),
  };
});

export const VOICE_FLOW: [string, string, string][] = [
  [
    "1. The call starts",
    "GET LookupCustomer?wa_number=",
    "Know who you are talking to: language, active product (never offer the other product), opted_out (then do not offer WhatsApp messages), open bookings and open cases.",
  ],
  [
    "2. During the call (only if needed)",
    "OfficialPlan · SearchCentres · BookingRequests · FollowUps · Escalations",
    "Quote a price only from OfficialPlan. Offer centres only from SearchCentres. A booking is always a request (pending confirmation), never confirmed on the call. A question that needs a person → Escalations.",
  ],
  [
    "2a. The customer asks for the plan details or proof during the call",
    "POST SendTemplate",
    "Ask for consent on the call, then send template plan_recommendation_status (the plan you recommended and why, no price) or oxxy_verification_links (testimonials, policies, news). It reaches WhatsApp in a few seconds, while the call is still on, at any hour: tell the customer it has been sent. When the customer replies on WhatsApp, the bot carries on (price with GST, activation step).",
  ],
  [
    "3. The customer wants the details on WhatsApp",
    "POST StartConversation",
    "Ask for consent on the call, then send the number, first name and what was said (context). The bot sends the first WhatsApp message with three buttons and continues the chat from there.",
  ],
  [
    "4. The customer says stop",
    "POST OptOut",
    "No more automated WhatsApp messages to this number, at once.",
  ],
];

export const VOICE_CONSENT_LINES: [string, string][] = [
  [
    "English",
    "Can I send you the details on WhatsApp on this number? You can reply STOP at any time.",
  ],
  [
    "Hinglish",
    "Kya main aapko is number par WhatsApp par details bhej sakti hoon? Aap kabhi bhi STOP likh sakte hain.",
  ],
  [
    "Hindi",
    "क्या मैं इस नंबर पर आपको WhatsApp पर जानकारी भेज सकती हूँ? आप कभी भी STOP लिख सकते हैं।",
  ],
];

export const VOICE_CONTEXT_MAP: [string, string, string][] = [
  [
    "What the customer asked for, in one or two lines",
    "context.summary",
    "Asked for Oxxy plan details on WhatsApp",
  ],
  ["The health need (stored encrypted)", "context.need", "dental treatment for mother"],
  ["Who it is for", "context.beneficiary", "self · mother · father · family"],
  ["Where", "context.city, context.locality", "Chennai, Anna Nagar"],
  ["Which kind of doctor / centre", "context.specialisation", "dental · cardiology · eye"],
  [
    "The product the customer chose on the call",
    "context.selected_product",
    "oxxy · cut_medi_bills",
  ],
  ["The Oxxy plan discussed", "context.recommended_plan", "everyday · vital · thrive · infinity"],
];

export const VOICE_STATUS: [string, string, string][] = [
  [
    '"status": "sent", "template": "lead_intro"',
    "The first WhatsApp message is on its way.",
    '"I have sent you a WhatsApp message just now."',
  ],
  [
    '"status": "sent", "template": null',
    "The customer wrote to us recently: the same message went as a normal chat message.",
    '"I have sent you a WhatsApp message just now."',
  ],
  [
    '"status": "queued"',
    "Called between 21:00 and 09:00 IST: the message goes at 09:00 IST (scheduled_for).",
    '"You will get our WhatsApp message tomorrow morning at 9."',
  ],
  [
    '"status": "context_saved"',
    "The customer is already chatting with us on WhatsApp: the chat is not interrupted; the bot now knows what was said on the call.",
    '"Please continue on WhatsApp; our assistant already has your details."',
  ],
  [
    "403 opted_out",
    "The customer said STOP before: no WhatsApp message is sent.",
    "Do not promise a WhatsApp message.",
  ],
  [
    "409 chat_open",
    "An older chat stopped part-way: nothing sent.",
    "Schedule a FollowUps call, or ask a person (Escalations).",
  ],
  [
    "400 consent_required",
    "whatsapp_consent or consent_source is missing.",
    "Ask for consent first, then call again.",
  ],
];

/** What the voice agent says after SendTemplate (client, 21 Nov) */
export const VOICE_TEMPLATE_STATUS: [string, string, string][] = [
  [
    '"status": "sent"',
    "The template is on its way to the customer's WhatsApp.",
    '"I have sent the details to your WhatsApp just now."',
  ],
  [
    "409 duplicate",
    "The same template went to this customer in the last 10 minutes: not sent again.",
    '"I sent it a few minutes ago; please check your WhatsApp."',
  ],
  [
    "422 invalid_params",
    'A value was refused (problems says which): the plan is not one of the four, or requirement / reason has a price, "guaranteed" or a web address.',
    "Fix the value and call again; never read a price from your own notes.",
  ],
  [
    "403 opted_out / privacy_request_open",
    "The customer said STOP before, or asked us to delete their data: nothing sent.",
    "Do not promise a WhatsApp message.",
  ],
  [
    "409 safety_event_open / template_not_usable, 503 not_configured",
    "Nothing sent: an emergency is open, or the template or the server is not ready.",
    '"Our team will share the details with you." (and Escalations if needed)',
  ],
];

export const VOICE_RULES: string[] = [
  'Ask for WhatsApp consent on the call before StartConversation or SendTemplate, and send whatsapp_consent: true with consent_source: "voice_ai".',
  "Quote prices, GST, renewal terms and links only from OfficialPlan. Never type them by hand.",
  "SendTemplate params: the plan is one of everyday / vital / thrive / infinity; requirement and reason are short and plain, with no price, no \"guaranteed\" and no web address (the call is refused with 422 otherwise).",
  "Never call Oxxy insurance. Never promise a saving or a discount at a specific centre.",
  "One product per customer: if LookupCustomer shows an active product, never offer the other one.",
  "A booking made on the call is a request (pending_confirmation). Never tell the customer it is confirmed.",
  "Name only centres that SearchCentres returned (or the customer named).",
  "Medical emergency on the call: tell the customer to call 112 (or 108 for an ambulance) at once; do not sell anything.",
  "Put only what the customer said in context. No diagnosis or guesses.",
];

export const VOICE_CODE = {
  node: `// Node.js 18+: at the end of a call where the customer agreed to WhatsApp
async function handOverToWhatsApp(call) {
  const res = await fetch("{{BASE}}/api/v1/Actions/StartConversation", {
    method: "POST",
    headers: { "X-Api-Key": process.env.OXXY_VOICE_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      wa_number: call.phone,                 // any Indian format: +91 98400 12345, 9840012345 …
      first_name: call.firstName,
      lead_id: call.leadId,
      whatsapp_consent: true,                // the customer said yes on the call
      consent_source: "voice_ai",
      language: call.language,               // en | hi | hinglish
      context: {
        summary: call.summary,
        need: call.need,
        beneficiary: call.beneficiary,
        city: call.city,
        specialisation: call.specialisation,
        selected_product: call.product,      // oxxy | cut_medi_bills, only if chosen
      },
    }),
  });
  const r = await res.json();
  if (!res.ok) return { say: r.code === "opted_out" ? null : "Our team will contact you.", error: r.code };
  if (r.status === "queued") return { say: "You will get our WhatsApp message tomorrow morning at 9." };
  if (r.status === "context_saved") return { say: "Please continue on WhatsApp; our assistant has your details." };
  return { say: "I have sent you a WhatsApp message just now." };
}`,
  sendTemplate: `// Node.js 18+: during the call, the customer asked for the plan details on WhatsApp
async function sendPlanDetails(call, plan, reason) {
  const res = await fetch("{{BASE}}/api/v1/Actions/SendTemplate", {
    method: "POST",
    headers: { "X-Api-Key": process.env.OXXY_VOICE_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      wa_number: call.phone,
      template: "plan_recommendation_status",   // or "oxxy_verification_links" (no params needed)
      params: {
        customer_name: call.firstName,
        requirement: call.need,                 // "OPD consultations for your parents"
        plan,                                   // everyday | vital | thrive | infinity
        reason,                                 // "it covers members up to 75 years" (no price)
      },
      whatsapp_consent: true,                   // the customer said yes on the call
      consent_source: "voice_ai",
      call_id: call.id,
    }),
  });
  const r = await res.json();
  if (res.ok) return { say: "I have sent the details to your WhatsApp just now." };
  if (r.code === "duplicate") return { say: "I sent it a few minutes ago; please check your WhatsApp." };
  if (r.code === "opted_out" || r.code === "privacy_request_open") return { say: null, error: r.code };
  return { say: "Our team will share the details with you.", error: r.code, problems: r.problems };
}`,
  python: `# Python 3: at the end of a call where the customer agreed to WhatsApp
import os, requests

def hand_over_to_whatsapp(call):
    r = requests.post(
        "{{BASE}}/api/v1/Actions/StartConversation",
        headers={"X-Api-Key": os.environ["OXXY_VOICE_API_KEY"]},
        json={
            "wa_number": call["phone"],
            "first_name": call.get("first_name"),
            "whatsapp_consent": True,
            "consent_source": "voice_ai",
            "language": call.get("language", "en"),
            "context": {
                "summary": call.get("summary"),
                "need": call.get("need"),
                "city": call.get("city"),
                "specialisation": call.get("specialisation"),
            },
        },
        timeout=5,
    )
    data = r.json()
    if r.status_code >= 400:
        return data["code"]          # opted_out, chat_open, consent_required …
    return data["status"]            # sent | queued | context_saved`,
};

export const VOICE_CHECKLIST: string[] = [
  'Get a sandbox API key for the voice agent from the Oxxy team (its own key, e.g. "Voice agent - sandbox").',
  "Add the WhatsApp consent question to the call script (lines above) and record the answer.",
  "Call LookupCustomer at the start of every call.",
  "Call StartConversation with context at the end of a call where the customer agreed; speak the line that matches the status.",
  "Use OfficialPlan for any price you say, SearchCentres for any centre you name.",
  'During the call, test SendTemplate with your own phone: say the line that matches the answer, then reply "yes" on WhatsApp and check the bot sends the price and the activation step.',
  "Test with your own phone: a day call (message now), a night call (message at 9 am), STOP (OptOut).",
  "Go live with a new production key (never reuse the sandbox one).",
];
