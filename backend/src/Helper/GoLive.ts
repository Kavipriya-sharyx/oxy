// No sample or placeholder value may reach a customer. A value counts as a placeholder when it is empty,
// still carries a [CONFIRM] marker, points at example.com / localhost, or is one of the old "Sample ..." rows.
// The bot treats a plan with such a value as "not ready": no price disclosure and no link, a person takes over.

const PLACEHOLDER_RE = /\[\s*confirm|\bexample\.(com|org|net)\b|\blocalhost\b|127\.0\.0\.1|\blorem ipsum\b|\bTODO\b/i;

export function isPlaceholder(v: unknown): boolean {
  const s = String(v ?? "").trim();
  return !s || PLACEHOLDER_RE.test(s);
}

/** An https link that is not a placeholder */
export function isRealLink(v: unknown): boolean {
  const s = String(v ?? "").trim();
  return /^https:\/\/[^\s]+\.[^\s]+$/i.test(s) && !isPlaceholder(s);
}

export const isSampleName = (v: unknown) => /^\s*(sample|test|demo|dummy)\b/i.test(String(v ?? ""));

export interface PlanRowLike {
  price?: number | string | null;
  renewal_terms?: string | null;
  activation_time?: string | null;
  activation_link?: string | null;
}

/** What is still missing before this plan row may be shown with a price and a payment link */
export function planProblems(r: PlanRowLike | null | undefined): string[] {
  if (!r) return ["no plan row"];
  const out: string[] = [];
  if (!(Number(r.price) > 0)) out.push("price");
  if (!isRealLink(r.activation_link)) out.push("official activation link");
  if (isPlaceholder(r.renewal_terms)) out.push("renewal terms");
  if (isPlaceholder(r.activation_time)) out.push("activation time");
  return out;
}

export function planReady(r: PlanRowLike | null | undefined): boolean {
  return planProblems(r).length === 0;
}

/** Demo logins made by the development seeder: they must not exist (or must be disabled) in production */
export const DEMO_USER_EMAILS = ["admin@user.com", "superadmin@oxxy.com", "admin@oxxy.com", "user@oxxy.com"];
