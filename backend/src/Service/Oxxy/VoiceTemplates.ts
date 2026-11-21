// The client's voice-call templates (21 Nov): "the templates should be triggered based on the voice bot
// conversation. Whenever a customer asks during the call to share the plan details, an automated WhatsApp message
// containing the plan details should be triggered in real time, while the call is still in progress."
// The voice agent calls POST /api/v1/Actions/SendTemplate (BotActions.sendVoiceTemplate); the texts are the
// client's own templates (Helper/TemplateDefinitions.ts). This file: the names, the checks on what the voice agent
// fills in, and the readers for the customer's replies (ChatPipeline.handleVoiceTemplate). Separate from the
// chatbot flow: nothing here sends a chatbot card on its own.
import { PLAN_ORDER } from "./BillCard";
import type { PlanName } from "./GuidedFlow";

export const VERIFICATION_LINKS = "oxxy_verification_links";
export const PLAN_RECOMMENDATION = "plan_recommendation_status";
export const VOICE_TEMPLATES = [VERIFICATION_LINKS, PLAN_RECOMMENDATION] as const;
export type VoiceTemplate = (typeof VOICE_TEMPLATES)[number];

/** pending_action after the plan template: the customer's "yes" gets this plan's link step */
export const VOICE_PLAN_PENDING = "voice_plan:";
/** The same template to the same customer again within this time is not sent (the agent may ask twice) */
export const VOICE_TEMPLATE_REPEAT_MS = 10 * 60_000;

const PLAN_TITLE: Record<PlanName, string> = {
  everyday: "Oxxy Everyday",
  vital: "Oxxy Vital",
  thrive: "Oxxy Thrive",
  infinity: "Oxxy Infinity",
};

/** "Vital", "oxxy vital", "Oxxy Vital Plan" -> vital; anything else (a product, a price) -> null */
export function readPlanName(text: unknown): PlanName | null {
  const t = String(text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const m = t.match(/^(oxxy )?(everyday|vital|thrive|infinity)( plan)?$/);
  return m ? (m[2] as PlanName) : null;
}

/** Why a value cannot go into a template variable, or null when it can */
export function badParam(v: string, max: number): string | null {
  if (!v.trim()) return "is empty";
  if (v.length > max) return `is over ${max} characters`;
  // Meta refuses a variable with a new line, a tab or more than 4 spaces in a row
  if (/[\n\r\t]| {5,}/.test(v)) return "has a new line, a tab or too many spaces";
  if (/[{}]{2}/.test(v)) return "has {{ }}";
  // prices come only from plan_catalog, never from what the voice agent typed (Playbook 2: no made-up prices)
  if (/₹|\brs\.?\s?\d|\binr\b|\d[\d,]*\s?(rupees?|\/-)/i.test(v)) return "has a price";
  if (/\bguarantee\w*\b|\b100 ?%|\bcure\w*\b|\binsurance cover\w*\b/i.test(v))
    return "has a guarantee or a medical / insurance claim";
  if (/https?:\/\/|www\./i.test(v)) return "has a web address";
  return null;
}

export interface VoiceTemplateParams {
  customer_name?: unknown;
  requirement?: unknown;
  plan?: unknown;
  reason?: unknown;
}

/**
 * The checked body variables, in the template's order, or the list of problems. Names: {{1}} first name
 * ("there" when unknown), {{2}} what the customer needs, {{3}} the plan (one of the four, written by us),
 * {{4}} why that plan.
 */
export function voiceTemplateParams(
  template: VoiceTemplate,
  p: VoiceTemplateParams,
  knownName: string | null,
): { params: string[]; plan: PlanName | null } | { problems: string[] } {
  const problems: string[] = [];
  const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
  const nameIn = clean(p.customer_name) || knownName || "there";
  const name = nameIn.split(" ").slice(0, 3).join(" ");
  const nameBad = badParam(name, 40);
  if (nameBad) problems.push(`customer_name ${nameBad}`);
  if (template === VERIFICATION_LINKS) return problems.length ? { problems } : { params: [name], plan: null };

  const requirement = clean(p.requirement);
  const reason = clean(p.reason).replace(/[.\s]+$/, ""); // the template adds the full stop
  const plan = readPlanName(p.plan);
  if (!plan) problems.push("plan must be one of Everyday, Vital, Thrive, Infinity");
  const reqBad = badParam(requirement, 120);
  if (reqBad) problems.push(`requirement ${reqBad}`);
  const reasonBad = badParam(reason, 200);
  if (reasonBad) problems.push(`reason ${reasonBad}`);
  if (problems.length) return { problems };
  return { params: [name, requirement, PLAN_TITLE[plan!], reason], plan };
}

/** What the chat history shows for the sent template (the body with the values filled in) */
export function voiceTemplateLog(template: VoiceTemplate, params: string[]): string {
  if (template === VERIFICATION_LINKS)
    return `Oxxy HealthCare: Requested Verification Data\n\nHello ${params[0]},\n\nWe have received your query regarding Oxxy HealthCare services. The requested links and details are provided below for your review.\n[Customer testimonials] [View Policies] [News Articles]`;
  return `Hello ${params[0]},\n\nThank you for sharing your requirements regarding ${params[1]}. Based on your preferences, the recommended option for you is ${params[2]} because ${params[3]}.\n\nPlease let us know if you would like us to share the secure plan link to complete the process.\n\nRegards,\nTeam Oxxy HealthCare\n[Website] [https://www.oxxy.in/#plan]`;
}

// ---- the customer's replies ----

/** The plan template's quick reply: its label is the address itself, so the tap sends that text */
export const isPlanLinkTap = (text: string) =>
  /^(https?:\/\/)?(www\.)?oxxy\.in\/?#plans?\/?$/i.test((text || "").trim());

/** The verification template's quick reply "News Articles" */
export const isNewsTap = (text: string) => /^news articles?$/i.test((text || "").trim());

/** "Yes", "please share", "send the link" after the plan template (a question or a "no" is not) */
export function wantsPlanLink(text: string): boolean {
  const t = (text || "").trim().toLowerCase();
  if (!t || t.length > 60 || /\?\s*$/.test(t) || /\b(no|not|don'?t|later|nahi|nahin|vendam)\b/.test(t)) return false;
  return /^(yes|yeah|yep|yup|ok|okay|sure|haan|ha|han|ji|ji haan|sari|seri|aama|please|pls)\b|\b(share|send)\b.*\blink\b|\blink\b.*\b(please|pls|share|send)\b|^(please )?(share|send)( it| me| the link)?\b|\bproceed\b|\bgo ahead\b|\bactivate\b/.test(
    t,
  );
}

/** The plan in a voice_plan:<plan> pending action */
export function pendingVoicePlan(pending: string | null | undefined): PlanName | null {
  if (!pending?.startsWith(VOICE_PLAN_PENDING)) return null;
  const p = pending.slice(VOICE_PLAN_PENDING.length) as PlanName;
  return PLAN_ORDER.includes(p) ? p : null;
}
