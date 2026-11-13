// Which approved asset a content trigger sends (Trigger layer 12.6 "render its approved content",
// Playbook 18.1). Only approved, in-date assets for that trigger, never one already sent in this journey,
// in the customer's language when there is one, else English.
import { approved_asset } from "@Database/Table/Oxxy/approved_asset";
import { asset_send } from "@Database/Table/Oxxy/asset_send";

// L is only its approved proof: nothing approved = L does not fire (never an invented story).
// A, B and C have approved fixed text and add their assets when there are any.
export const ASSET_REQUIRED = ["L"];

export interface AssetLike {
  id: string;
  trigger_id: string | null;
  language: string;
  approved: boolean;
  status?: boolean;
  valid_to: Date | string | null;
  code?: string;
}

export function chooseAsset<T extends AssetLike>(
  candidates: T[],
  triggerId: string,
  language: string,
  alreadySent: string[],
  now: Date = new Date(),
): T | null {
  return chooseAssets(candidates, triggerId, language, alreadySent, 1, now)[0] ?? null;
}

/** Up to `max` assets: the customer's language first, then English, each group in code order */
export function chooseAssets<T extends AssetLike>(
  candidates: T[],
  triggerId: string,
  language: string,
  alreadySent: string[],
  max: number,
  now: Date = new Date(),
): T[] {
  const ok = candidates.filter(
    (a) =>
      a.trigger_id === triggerId &&
      a.approved &&
      a.status !== false &&
      (!a.valid_to || new Date(a.valid_to).getTime() > now.getTime()) &&
      !alreadySent.includes(a.id),
  );
  const byCode = (x: T, y: T) => String(x.code ?? "").localeCompare(String(y.code ?? ""));
  const own = ok.filter((a) => a.language === language).sort(byCode);
  const en = language === "en" ? [] : ok.filter((a) => a.language === "en").sort(byCode);
  return [...own, ...en].slice(0, Math.max(0, max));
}

export async function pickAsset(
  triggerId: string,
  language: string,
  conversationId: string,
): Promise<approved_asset | null> {
  return (await pickAssets(triggerId, language, conversationId, 1))[0] ?? null;
}

export async function pickAssets(
  triggerId: string,
  language: string,
  conversationId: string,
  max: number,
): Promise<approved_asset[]> {
  try {
    const candidates = await approved_asset.find({ where: { trigger_id: triggerId, approved: true } });
    if (!candidates.length) return [];
    const sent = await asset_send.find({ where: { conversation_id: conversationId } });
    return chooseAssets(candidates, triggerId, language || "en", sent.map((s) => s.asset_id), max);
  } catch {
    return []; // no asset is better than no reply: the fixed answer still goes out
  }
}

/** How the asset appears at the end of the bot's reply (one message, one call to action) */
export function assetLine(a: { title: string; url: string }): string {
  return `${a.title}: ${a.url}`;
}
