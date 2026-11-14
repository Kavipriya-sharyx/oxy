# WhatsApp message templates: what to submit to Meta

Updated 14 Nov 2026. Every message the bot sends **outside the 24-hour customer-service window** has to be an approved Meta template. This file gives each template's name, category, language, body, variables and buttons, ready to paste into WhatsApp Manager (Business Manager → WhatsApp Manager → Message templates → Create).

The variable order below is the order the code sends (`params`). If a body changes, keep the number and order of `{{n}}` the same, or change the code at the same time.

**Rules for all templates**

- The English wording comes from the Playbook / Trigger layer where one exists. Hindi versions are drafts: get them reviewed before you submit them.
- Never add a price, a saving figure, an expiry or "activate today" to a template (Trigger layer: no dark patterns).
- MARKETING templates need marketing consent. The bot checks this before it sends (`FollowUpScheduler`, `BotActions.startConversation`).
- After approval, set each row to `approved` in the console (WhatsApp templates page) or with the template sync. `GoLive` (Ops → Go-live check) lists any required template that is not approved.
- The code sends `languageCode: "en"` unless noted. `templateLanguage()` falls back to `en` when the customer's language version is not approved yet.

## Summary

| Name | Category | Variables | Buttons | Sent by |
|---|---|---|---|---|
| `lead_intro` | MARKETING | 1 | 3 quick replies | `POST /Actions/StartConversation` (CRM / voice AI) |
| `booking_confirmed` | UTILITY | 2 | none | console confirm, CRM `booking.confirmed` |
| `booking_rescheduled` | UTILITY | 2 | none | CRM `booking.rescheduled` |
| `booking_cancelled` | UTILITY | 2 | 2 quick replies | CRM `booking.cancelled` (first time in a conversation) |
| `booking_cancelled_info` | UTILITY | 2 | none | CRM `booking.cancelled` (any later time) |
| `activation_confirmed` | UTILITY | 1 | none | CRM `activation.paid`, console "mark paid" |
| `activation_reminder` | UTILITY | 0 | none | Trigger Q, once, after an unpaid link |
| `agreed_follow_up` | UTILITY | 3 | none | Trigger N, the time the customer chose |
| `conversation_rescue_1` | MARKETING | 0 | none | Playbook 15, first no-reply check-in |
| `conversation_rescue_2` | MARKETING | 0 | none | Playbook 15, second and last check-in |
| approved asset templates | UTILITY or MARKETING | 2 | optional URL | `send_approved_asset` |

## 1. `lead_intro` (Playbook 4.1)

- Category: MARKETING. Languages: `en`, `hi` (the code sends `hi` for Hindi customers).
- Body:

  > Hello {{1}} ji, I am Asha, Oxxy Health's automated assistant. You recently showed interest in saving on healthcare expenses. May I ask one quick question to understand what you need?

  `{{1}}` = first name (the code sends "there" when no name is known). Example: `Priya`.
- Footer: `Reply STOP to opt out`
- Buttons, quick reply, in this order: `Yes, please` · `Just send details` · `Not now`
- Agent name: **Asha** (fixed text in the body; change `AGENT_NAME` in `backend/src/Helper/TemplateDefinitions.ts` and resubmit to rename).

## 2. `booking_confirmed`

- Category: UTILITY.
- Body:

  > Good news: your booking request at {{1}} for {{2}} has been confirmed by the Oxxy team. Please carry a photo ID. If you need to change it, reply here.

  `{{1}}` = centre name, `{{2}}` = date (YYYY-MM-DD). Example: `City Care Hospital`, `2026-12-01`.

## 3. `booking_rescheduled`

- Category: UTILITY.
- Body:

  > Your booking request at {{1}} has been moved to {{2}}. The Oxxy team will contact you if anything else changes. Reply here if the new date does not suit you.

  `{{1}}` = centre name, `{{2}}` = the new date.

## 4. `booking_cancelled` (Full Plan 3.3: "offers another centre once")

- Category: UTILITY.
- Body:

  > Your booking request at {{1}} for {{2}} could not go ahead. Would you like me to suggest another verified centre near you?

  `{{1}}` = centre name, `{{2}}` = date.
- Buttons, quick reply: `Yes` · `No`
- What happens next: the conversation waits for `rebook_offer:<booking id>`. **Yes** sends up to five verified centres without the cancelled one (Trigger D). **No** sends "No problem. If you need another booking request later, just message me here." Anything else is answered normally.

## 5. `booking_cancelled_info`

- Category: UTILITY. Used when a booking in the same conversation was already cancelled before, so the offer is not repeated.
- Body:

  > Your booking request at {{1}} for {{2}} could not go ahead. If you would like help with another request, just reply here.

## 6. `activation_confirmed` (Trigger P)

- Category: UTILITY.
- Body (Trigger layer, Trigger P):

  > Thank you. Your payment for {{1}} has been verified. The Oxxy team will guide you regarding activation status and the next service step.

  `{{1}}` = `Cut Medi Bills` or `Oxxy <plan>` (for example `Oxxy vital`).
- Never say the plan is active "instantly" (Trigger layer: P acknowledges verification, not instant activation).

## 7. `activation_reminder` (Trigger Q)

- Category: UTILITY. Sent at most once per link, only when the link was sent, no payment is recorded, the customer did not decline, and consent allows it.
- Body (Trigger layer, Trigger Q):

  > Would you like help understanding the plan, completing the official activation, or pausing for now?

- No variables, no price, no expiry.

## 8. `agreed_follow_up` (Trigger N, Playbook 18)

- Category: UTILITY. It is sent only at a time the customer agreed to.
- Body (Playbook 18 "Follow-up"):

  > Hello {{1}} ji. As agreed, I am following up about {{2}} and {{3}}. Would you like to continue with the booking request, activation or a question?

  `{{1}}` = first name or "there", `{{2}}` = "your healthcare requirement" (no health detail is ever put in a template), `{{3}}` = `Oxxy` or `Cut Medi Bills`.
- The CRM can send this through `POST /Actions/CreateFollowUp`, using another approved template name if it wants.

## 9. `conversation_rescue_1` and `conversation_rescue_2` (Playbook 15, no response)

- Category: MARKETING. At most two, then the bot stops.
- `conversation_rescue_1` body:

  > Just checking whether you would like a short answer or prefer to continue later.

- `conversation_rescue_2` body:

  > I will pause here so I do not disturb you. You can message Oxxy whenever convenient.

- Footer for both: `Reply STOP to opt out`

## 10. Approved asset templates (`send_approved_asset`, Playbook 18.1)

Each approved asset (`/Insights/Assets`) can name a `template_name`. It is used when the 24-hour window is closed. The code sends two variables:

- Body (suggested):

  > For your convenience, I am sending the relevant Oxxy information here: {{1}}. {{2}}

  `{{1}}` = asset title, `{{2}}` = the official https link.
- Category: UTILITY for documents the customer asked for. Anything promotional needs MARKETING.

## Hindi drafts (review before submitting)

| Name | Hindi body (draft) |
|---|---|
| `lead_intro` | नमस्ते {{1}} जी, मैं Oxxy Health का ऑटोमेटेड असिस्टेंट हूँ। आपने हाल ही में स्वास्थ्य खर्च पर बचत में रुचि दिखाई थी। क्या मैं आपकी ज़रूरत समझने के लिए एक छोटा सा सवाल पूछ सकता हूँ? (buttons: हाँ, ज़रूर · बस जानकारी भेजें · अभी नहीं; footer: रोकने के लिए STOP लिखें) |
| `agreed_follow_up` | नमस्ते {{1}} जी। जैसा तय हुआ था, मैं {{2}} और {{3}} के बारे में फ़ॉलो-अप कर रहा हूँ। क्या आप बुकिंग अनुरोध, एक्टिवेशन या कोई सवाल जारी रखना चाहेंगे? |
| `activation_reminder` | क्या आप प्लान समझने में मदद, आधिकारिक एक्टिवेशन पूरा करना, या अभी के लिए रुकना चाहेंगे? |
