import { InteractiveHeader, OutboundMessage } from "@Helper/WhatsappMessage";
import { InvalidMessageError } from "@Helper/WhatsappErrors";

export const LIMITS = {
  textBody: 4096,
  interactiveBody: 1024,
  headerText: 60,
  footer: 60,
  ctaText: 20,
  buttons: { min: 1, max: 3, title: 20, id: 256 },
  list: { min: 1, max: 10, rowTitle: 24, rowDescription: 72, buttonLabel: 20 },
} as const;

const len = (s: string) => Array.from(s).length; // count characters, not UTF-16 units
const blank = (s: string | undefined | null) => !s || s.trim() === "";

function checkFrame(m: { header?: InteractiveHeader; footer?: string }) {
  if (m.header?.type === "text" && (blank(m.header.text) || len(m.header.text) > LIMITS.headerText))
    throw new InvalidMessageError(`header text must be 1 to ${LIMITS.headerText} characters`);
  if (m.header?.type === "image" && !/^https:\/\/\S+$/i.test(m.header.link))
    throw new InvalidMessageError("header image needs an https link");
  if (m.footer != null && (blank(m.footer) || len(m.footer) > LIMITS.footer))
    throw new InvalidMessageError(`footer must be 1 to ${LIMITS.footer} characters`);
}

const headerPayload = (h?: InteractiveHeader) =>
  !h ? {} : h.type === "image" ? { header: { type: "image", image: { link: h.link } } } : { header: { type: "text", text: h.text } };
const footerPayload = (f?: string) => (f ? { footer: { text: f } } : {});

// Throws InvalidMessageError. Nothing is ever cut to fit.
export function validateMessage(m: OutboundMessage): void {
  if (m.kind === "buttons" || m.kind === "list" || m.kind === "cta_url") checkFrame(m);
  switch (m.kind) {
    case "cta_url":
      if (blank(m.body)) throw new InvalidMessageError("link button body is required");
      if (len(m.body) > LIMITS.interactiveBody)
        throw new InvalidMessageError(`body is over ${LIMITS.interactiveBody} characters`);
      if (blank(m.buttonText) || len(m.buttonText) > LIMITS.ctaText)
        throw new InvalidMessageError(`link button text must be 1 to ${LIMITS.ctaText} characters`);
      if (!/^https?:\/\/\S+$/i.test(m.url)) throw new InvalidMessageError("link button needs a web address");
      return;

    case "text":
      if (blank(m.body)) throw new InvalidMessageError("text body is required");
      if (len(m.body) > LIMITS.textBody)
        throw new InvalidMessageError(`text body is over ${LIMITS.textBody} characters`);
      return;

    case "buttons": {
      const L = LIMITS.buttons;
      if (blank(m.body)) throw new InvalidMessageError("buttons body is required");
      if (len(m.body) > LIMITS.interactiveBody)
        throw new InvalidMessageError(`body is over ${LIMITS.interactiveBody} characters`);
      if (!m.buttons?.length || m.buttons.length < L.min || m.buttons.length > L.max)
        throw new InvalidMessageError(
          `buttons: ${L.min} to ${L.max} are allowed, got ${m.buttons?.length ?? 0}`,
        );
      const ids = new Set<string>();
      for (const b of m.buttons) {
        if (blank(b.id) || blank(b.title))
          throw new InvalidMessageError("every button needs an id and a title");
        if (len(b.title) > L.title)
          throw new InvalidMessageError(`button title "${b.title}" is over ${L.title} characters`);
        if (len(b.id) > L.id) throw new InvalidMessageError(`button id is over ${L.id} characters`);
        if (ids.has(b.id)) throw new InvalidMessageError(`duplicate button id "${b.id}"`);
        ids.add(b.id);
      }
      return;
    }

    case "list": {
      const L = LIMITS.list;
      if (blank(m.body)) throw new InvalidMessageError("list body is required");
      if (len(m.body) > LIMITS.interactiveBody)
        throw new InvalidMessageError(`body is over ${LIMITS.interactiveBody} characters`);
      if (blank(m.buttonLabel)) throw new InvalidMessageError("list buttonLabel is required");
      if (len(m.buttonLabel) > L.buttonLabel)
        throw new InvalidMessageError(`buttonLabel is over ${L.buttonLabel} characters`);
      if (!m.rows?.length || m.rows.length < L.min || m.rows.length > L.max)
        throw new InvalidMessageError(
          `list: ${L.min} to ${L.max} rows are allowed, got ${m.rows?.length ?? 0}`,
        );
      const ids = new Set<string>();
      for (const r of m.rows) {
        if (blank(r.id) || blank(r.title))
          throw new InvalidMessageError("every row needs an id and a title");
        if (len(r.title) > L.rowTitle)
          throw new InvalidMessageError(`row title "${r.title}" is over ${L.rowTitle} characters`);
        if (r.description && len(r.description) > L.rowDescription)
          throw new InvalidMessageError(`row description is over ${L.rowDescription} characters`);
        if (ids.has(r.id)) throw new InvalidMessageError(`duplicate row id "${r.id}"`);
        ids.add(r.id);
      }
      return;
    }

    case "template":
      if (blank(m.name)) throw new InvalidMessageError("template name is required");
      if (blank(m.languageCode)) throw new InvalidMessageError("template languageCode is required");
      return;

    case "location_request":
      if (blank(m.body)) throw new InvalidMessageError("location request body is required");
      if (len(m.body) > LIMITS.interactiveBody)
        throw new InvalidMessageError(`location request body is over ${LIMITS.interactiveBody} characters`);
      return;

    case "location":
      if (!(Math.abs(m.latitude) <= 90) || !(Math.abs(m.longitude) <= 180) || (m.latitude === 0 && m.longitude === 0))
        throw new InvalidMessageError("location needs a valid latitude and longitude");
      if (blank(m.name)) throw new InvalidMessageError("location name is required");
      return;
  }
}

// Meta Cloud API request body (messaging_product "whatsapp", to = wa_number)
export function buildPayload(to: string, m: OutboundMessage): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", to };
  switch (m.kind) {
    case "text":
      return { ...base, type: "text", text: { body: m.body } };

    case "buttons":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "button",
          ...headerPayload(m.header),
          body: { text: m.body },
          ...footerPayload(m.footer),
          action: {
            buttons: m.buttons.map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })),
          },
        },
      };

    case "list":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "list",
          ...headerPayload(m.header),
          body: { text: m.body },
          ...footerPayload(m.footer),
          action: {
            button: m.buttonLabel,
            sections: [
              {
                rows: m.rows.map((r) => ({
                  id: r.id,
                  title: r.title,
                  ...(r.description ? { description: r.description } : {}),
                })),
              },
            ],
          },
        },
      };

    case "template":
      return {
        ...base,
        type: "template",
        template: {
          name: m.name,
          language: { code: m.languageCode },
          ...(m.params?.length
            ? {
                components: [
                  { type: "body", parameters: m.params.map((text) => ({ type: "text", text })) },
                ],
              }
            : {}),
        },
      };

    case "cta_url":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "cta_url",
          ...headerPayload(m.header),
          body: { text: m.body },
          ...footerPayload(m.footer),
          action: { name: "cta_url", parameters: { display_text: m.buttonText, url: m.url } },
        },
      };

    case "location_request":
      return {
        ...base,
        type: "interactive",
        interactive: { type: "location_request_message", body: { text: m.body }, action: { name: "send_location" } },
      };

    case "location":
      return {
        ...base,
        type: "location",
        location: {
          latitude: m.latitude,
          longitude: m.longitude,
          name: m.name,
          ...(m.address ? { address: m.address } : {}),
        },
      };
  }
}
