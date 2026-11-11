import { buildPayload, validateMessage } from "./WhatsappPayload";
import { InvalidMessageError } from "@Helper/WhatsappErrors";
import { OutboundMessage } from "@Helper/WhatsappMessage";

const btn = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `b${i}`, title: `Button ${i}` }));
const row = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `r${i}`, title: `Row ${i}` }));

describe("limits throw InvalidMessageError (never truncate)", () => {
  const bad: [string, OutboundMessage][] = [
    ["4 buttons", { kind: "buttons", body: "b", buttons: btn(4) }],
    ["0 buttons", { kind: "buttons", body: "b", buttons: [] }],
    [
      "21-char button title",
      { kind: "buttons", body: "b", buttons: [{ id: "a", title: "x".repeat(21) }] },
    ],
    [
      "duplicate button ids",
      {
        kind: "buttons",
        body: "b",
        buttons: [
          { id: "a", title: "A" },
          { id: "a", title: "B" },
        ],
      },
    ],
    [
      "256+ char button id",
      { kind: "buttons", body: "b", buttons: [{ id: "x".repeat(257), title: "A" }] },
    ],
    [
      "25-char row title",
      { kind: "list", body: "b", buttonLabel: "Go", rows: [{ id: "a", title: "x".repeat(25) }] },
    ],
    ["11 rows", { kind: "list", body: "b", buttonLabel: "Go", rows: row(11) }],
    [
      "73-char row description",
      {
        kind: "list",
        body: "b",
        buttonLabel: "Go",
        rows: [{ id: "a", title: "A", description: "d".repeat(73) }],
      },
    ],
    [
      "21-char list button label",
      { kind: "list", body: "b", buttonLabel: "x".repeat(21), rows: row(1) },
    ],
    ["1025-char interactive body", { kind: "buttons", body: "x".repeat(1025), buttons: btn(1) }],
    ["4097-char text body", { kind: "text", body: "x".repeat(4097) }],
    ["empty template name", { kind: "template", name: "", languageCode: "en_US" }],
    ["empty template language", { kind: "template", name: "hello_world", languageCode: "" }],
  ];
  it.each(bad)("%s", (_name, m) => {
    expect(() => validateMessage(m)).toThrow(InvalidMessageError);
  });

  it("accepts values exactly at the limits", () => {
    expect(() =>
      validateMessage({
        kind: "buttons",
        body: "x".repeat(1024),
        buttons: [{ id: "a".repeat(256), title: "x".repeat(20) }, ...btn(2)],
      }),
    ).not.toThrow();
    expect(() =>
      validateMessage({
        kind: "list",
        body: "b",
        buttonLabel: "x".repeat(20),
        rows: [{ id: "a", title: "x".repeat(24), description: "d".repeat(72) }, ...row(9)],
      }),
    ).not.toThrow();
    expect(() => validateMessage({ kind: "text", body: "x".repeat(4096) })).not.toThrow();
  });
});

describe("payload shape", () => {
  const to = "919800000001";

  it("text", () => {
    expect(buildPayload(to, { kind: "text", body: "hello" })).toEqual({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: "hello" },
    });
  });

  it("buttons", () => {
    expect(
      buildPayload(to, {
        kind: "buttons",
        body: "Pick",
        buttons: [
          { id: "y", title: "Yes" },
          { id: "n", title: "No" },
        ],
      }),
    ).toEqual({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "Pick" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "y", title: "Yes" } },
            { type: "reply", reply: { id: "n", title: "No" } },
          ],
        },
      },
    });
  });

  it("list (description only when given)", () => {
    expect(
      buildPayload(to, {
        kind: "list",
        body: "Plans",
        buttonLabel: "Choose",
        rows: [
          { id: "a", title: "A", description: "first" },
          { id: "b", title: "B" },
        ],
      }),
    ).toEqual({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: "Plans" },
        action: {
          button: "Choose",
          sections: [
            {
              rows: [
                { id: "a", title: "A", description: "first" },
                { id: "b", title: "B" },
              ],
            },
          ],
        },
      },
    });
  });

  it("template without and with params", () => {
    expect(
      buildPayload(to, { kind: "template", name: "hello_world", languageCode: "en_US" }),
    ).toEqual({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: { name: "hello_world", language: { code: "en_US" } },
    });
    expect(
      buildPayload(to, {
        kind: "template",
        name: "t",
        languageCode: "en",
        params: ["Asha", "10 Mar"],
      }),
    ).toEqual({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: "t",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Asha" },
              { type: "text", text: "10 Mar" },
            ],
          },
        ],
      },
    });
  });
});
