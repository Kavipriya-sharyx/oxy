import { oneQuestion } from "./OneQuestion";

describe("oneQuestion (Playbook 1.1)", () => {
  it("keeps a single question as it is", () => {
    expect(oneQuestion("Thanks. Who is the care for?")).toBe("Thanks. Who is the care for?");
  });

  it("two questions: keeps the last, specific one and every statement", () => {
    expect(oneQuestion("How can I assist you today? Are you looking for help with medical bills or support?")).toBe(
      "Are you looking for help with medical bills or support?",
    );
    expect(oneQuestion("I understand. Is this for you? Which city are you in?")).toBe("I understand. Which city are you in?");
  });

  it("an 'Or ...?' tail is part of the same question", () => {
    expect(oneQuestion("Is it for you? Or for a family member?")).toBe("Is it for you, or for a family member?");
    expect(oneQuestion("Oxxy ke kaunse plan chahiye? Ya Cut Medi Bills?")).toBe("Oxxy ke kaunse plan chahiye, ya Cut Medi Bills?");
  });

  it("Hindi sentence ends and paragraphs are kept", () => {
    expect(oneQuestion("ठीक है। क्या यह आपके लिए है? आप किस शहर में हैं?")).toBe("ठीक है। आप किस शहर में हैं?");
    expect(oneQuestion("Thanks.\n\nIs it you? Which city?")).toBe("Thanks.\n\nWhich city?");
  });
});
