// The admin chooses the LLM (Claude, OpenAI or Gemini) and an optional fallback; every draft is the same JSON
import axios from "axios";
import { ClaudeService, geminiBody, providerOrder } from "./Claude.service";

const draftJson = JSON.stringify({ reply_text: "Hello", intent: "greeting", extracted_fields: {}, needs_human: false });

function service(cfg: Record<string, string>) {
  return new ClaudeService({ get: (k: string) => cfg[k] } as never);
}
const history = [{ role: "user" as const, content: "hi" }];

afterEach(() => jest.restoreAllMocks());

describe("providerOrder", () => {
  it.each([
    ["gemini", "openai", ["claude", "openai", "gemini"], ["gemini", "openai"]],
    ["openai", "", ["claude", "openai"], ["openai"]],
    ["gemini", "openai", ["claude", "openai"], ["openai"]], // preferred has no key: the fallback
    ["gemini", "", ["claude"], ["claude"]], // nothing chosen is configured: the one that has a key
    ["claude", "claude", ["claude"], ["claude"]], // never twice
    ["bogus", "", ["openai"], ["openai"]],
    ["claude", "", [], []],
  ])("%s + %s with %j -> %j", (p, f, configured, out) =>
    expect(providerOrder(p, f, configured as never)).toEqual(out),
  );
});

describe("Gemini request", () => {
  it("system instruction, assistant turns as model, JSON output", () => {
    const b = geminiBody("SYS", [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "plans?" },
    ]);
    expect(b.systemInstruction).toEqual({ parts: [{ text: "SYS" }] });
    expect(b.contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
    expect(b.generationConfig.responseMimeType).toBe("application/json");
  });

  it("the preferred Gemini drafts the reply (key in the header, never in the URL)", async () => {
    const post = jest.spyOn(axios, "post").mockResolvedValue({
      data: { candidates: [{ content: { parts: [{ text: draftJson }] }, finishReason: "STOP" }] },
    } as never);
    const svc = service({ "Llm.Provider": "gemini", "Gemini.ApiKey": "g-key", "Gemini.Model": "gemini-2.5-flash" });
    const r = await svc.generate(history, "{}");
    expect(r).toMatchObject({ reply_text: "Hello", intent: "greeting", provider: "gemini" });
    const [url, body, opts] = post.mock.calls[0] as [string, any, any];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
    expect(url).not.toContain("g-key");
    expect(opts.headers["x-goog-api-key"]).toBe("g-key");
    expect(body.systemInstruction.parts[0].text).toContain("You are Oxxy's WhatsApp assistant");
    expect(body.systemInstruction.parts[0].text).toContain("Known about this customer:\n{}");
  });
});

describe("fallback", () => {
  it("Gemini fails -> the OpenAI fallback answers", async () => {
    const post = jest.spyOn(axios, "post").mockImplementation((async (url: string) => {
      if (url.includes("googleapis")) throw new Error("timeout of 10000ms exceeded");
      return { data: { choices: [{ message: { content: draftJson } }] } };
    }) as never);
    const svc = service({ "Llm.Provider": "gemini", "Llm.Fallback": "openai", "Gemini.ApiKey": "g", "OpenAI.ApiKey": "o" });
    const r = await svc.generate(history, "{}");
    expect(r.provider).toBe("openai");
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("a safety block is not retried elsewhere: a person takes over", async () => {
    const post = jest.spyOn(axios, "post").mockResolvedValue({
      data: { candidates: [{ finishReason: "SAFETY" }] },
    } as never);
    const svc = service({ "Llm.Provider": "gemini", "Llm.Fallback": "openai", "Gemini.ApiKey": "g", "OpenAI.ApiKey": "o" });
    const r = await svc.generate(history, "{}");
    expect(r).toMatchObject({ needs_human: true, reply_text: "" });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("no usable JSON from any provider -> needs_human (holding message), not a crash", async () => {
    jest.spyOn(axios, "post").mockResolvedValue({ data: { choices: [{ message: { content: "sure!" } }] } } as never);
    const svc = service({ "Llm.Provider": "openai", "OpenAI.ApiKey": "o" });
    expect(await svc.generate(history, "{}")).toMatchObject({ needs_human: true });
  });

  it("every provider down -> the error (the pipeline sends the holding message)", async () => {
    jest.spyOn(axios, "post").mockRejectedValue(new Error("503"));
    const svc = service({ "Llm.Provider": "openai", "Llm.Fallback": "gemini", "OpenAI.ApiKey": "o", "Gemini.ApiKey": "g" });
    await expect(svc.generate(history, "{}")).rejects.toThrow("503");
  });

  it("no key at all -> a clear error", async () => {
    await expect(service({}).generate(history, "{}")).rejects.toThrow(/No LLM is configured/);
  });
});
