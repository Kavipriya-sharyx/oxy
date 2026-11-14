// Playbook 1.1 channel rules for every reply the pipeline sends:
// - "Keep most messages below 350 characters. Split longer answers into no more than three bubbles."
// - "Buttons may show mutually exclusive answers to that one question": a YES / NO question becomes one
//   reply-button message (2 buttons, titles of 20 characters or fewer). The tapped button sends its id,
//   "yes" / "no", which every YES / NO parser already reads.
import { OutboundMessage } from "./WhatsappMessage";

export const BUBBLE_CHARS = 350;
const MAX_BUBBLES = 3;
const BUTTON_BODY_MAX = 1024;

const YES_NO_END =
  /(Reply YES or NO|Please reply YES or NO|YES ya NO (likhein|likhiye|likhe)|कृपया YES या NO (लिखें|लिखिए)|YES या NO (लिखें|लिखिए))\s*[.।]?\s*$/iu;

const len = (s: string) => [...s].length;

/** The bubbles for one reply: a YES / NO question = one button message; long text = up to three bubbles */
export function toBubbles(text: string): OutboundMessage[] {
  const t = (text || "").trim();
  if (YES_NO_END.test(t) && len(t) <= BUTTON_BODY_MAX) {
    const hindi = /[ऀ-ॿ]/u.test(t);
    return [
      {
        kind: "buttons",
        body: t,
        buttons: [
          { id: "yes", title: hindi ? "हाँ" : "Yes" },
          { id: "no", title: hindi ? "नहीं" : "No" },
        ],
      },
    ];
  }
  return splitText(t).map((body) => ({ kind: "text" as const, body }));
}

/** Paragraphs packed into bubbles of up to 350 characters; never more than three (the rest joins the last) */
export function splitText(text: string): string[] {
  if (len(text) <= BUBBLE_CHARS) return [text];
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of paras) {
    const last = out[out.length - 1];
    if (last !== undefined && len(last) + 2 + len(p) <= BUBBLE_CHARS) out[out.length - 1] = `${last}\n\n${p}`;
    else out.push(p);
  }
  while (out.length > MAX_BUBBLES) {
    const tail = out.pop()!;
    out[out.length - 1] = `${out[out.length - 1]}\n\n${tail}`;
  }
  return out;
}
