// Why WhatsApp did not deliver a message, in words the team can act on (Conversations shows it under the
// message). Meta's error code stays in front, for support. Codes: WhatsApp Cloud API error codes.
const REASONS: Record<number, string> = {
  190: "The WhatsApp access token expired or is wrong. Update it in Configuration.",
  368: "The WhatsApp Business account is temporarily blocked for a policy violation.",
  130429: "Too many messages per second from this number. It will work again shortly.",
  130472: "Meta held this message back because the customer's account is part of a Meta experiment.",
  131000: "Something went wrong at WhatsApp. Try again.",
  131005: "Permission missing: the app is not allowed to send from this number.",
  131008: "A required part of the message was missing.",
  131009: "A value in the message is not valid.",
  131016: "WhatsApp was temporarily unavailable. Try again.",
  131021: "The sender and the customer number are the same.",
  131026:
    "The customer cannot receive it: the number is not on WhatsApp, uses an old app version, or has blocked this business.",
  131031: "The WhatsApp Business account is locked.",
  131042: "Billing problem on the WhatsApp Business account (payment method).",
  131045: "The business phone number is not registered correctly.",
  131047:
    "More than 24 hours since the customer's last message: only an approved template can be sent now.",
  131048: "Spam limit: too many recent messages were blocked or reported. Send fewer messages.",
  131049:
    "Meta held back this marketing message to protect the customer's experience (marketing limit). Try again later.",
  131050: "The customer stopped marketing messages from this business.",
  131051: "This message type is not supported.",
  131052: "The customer's media file could not be downloaded.",
  131053: "The media file could not be uploaded.",
  131056: "Too many messages to this customer in a short time. Wait a little before the next one.",
  132000: "The template's values do not match the template (wrong number of parameters).",
  132001: "This template does not exist in this language or is not approved yet.",
  132005: "The template is too long after its values were filled in.",
  132007: "The template breaks WhatsApp's content policy.",
  132012: "A template value has the wrong format.",
  132015: "The template is paused by Meta (low quality). Edit it or use another one.",
  132016: "The template is disabled by Meta.",
  133010: "The business phone number is not registered on the WhatsApp Cloud API.",
};

/** "Meta 131047: More than 24 hours since …" (unknown code: Meta's own title) */
export function deliveryFailureReason(code?: number | null, title?: string | null): string {
  const c = Number(code);
  const known = Number.isFinite(c) ? REASONS[c] : undefined;
  const text = known ?? (title ? String(title).slice(0, 300) : "WhatsApp did not deliver it.");
  return Number.isFinite(c) && c > 0 ? `Meta ${c}: ${text}` : text;
}

export const UNCERTAIN_REASON =
  "WhatsApp did not answer within 10 seconds. The message may or may not have reached the customer, so it was not sent again. Check with the customer if needed.";
