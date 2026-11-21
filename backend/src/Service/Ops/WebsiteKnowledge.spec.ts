import { isPriceLine, pageLines, toPassages } from "./WebsiteKnowledge.service";
import { knowledgeFor, setWebsitePassages, websitePassages } from "@Helper/KnowledgeBase";

// the shape of www.oxxy.in's plan card (21 Nov 2026): the struck old price in .plan-strike, the price, a saving
const CARD = `<html><head><title>Oxxy Everyday | Oxxy</title><style>.plan-strike{text-decoration:line-through}</style></head>
<body><script>var x = "Rs. 5,000/mo";</script>
<div class="plan-card" data-price="999"><div class="plan-name">Oxxy Everyday</div>
<div class="plan-strike">Rs. 2,000/mo</div><div class="plan-price">Rs. 999<span>/month</span></div>
<div class="plan-save">Guaranteed annual savings of Rs. 40,000*</div>
<ul><li>OPD only &amp; new diseases only</li><li>Bills up to Rs. 10 lakh for members up to 70 years</li></ul>
<p>Our office hours are Monday to Saturday, 10:30 AM to 6:00 PM.</p><del>Rs. 3,000 old price</del></div></body></html>`;

describe("oxxy.in pages as knowledge (client, 21 Nov)", () => {
  it("cleans a page: no struck price, no price or saving line, no script; facts kept", () => {
    const { title, lines } = pageLines(CARD);
    const all = lines.join("\n");
    expect(title).toBe("Oxxy Everyday | Oxxy");
    expect(all).not.toMatch(/2,000|999|40,000|3,000|5,000/);
    expect(all).toMatch(/OPD only & new diseases only/);
    expect(all).toMatch(/Bills up to Rs\. 10 lakh for members up to 70 years/); // a limit, not a price
    expect(all).toMatch(/Monday to Saturday/);
  });

  it("price lines are recognised; bill limits are not prices", () => {
    expect(isPriceLine("Rs. 999/month")).toBe(true);
    expect(isPriceLine("Guaranteed annual savings of Rs. 1,40,000")).toBe(true);
    expect(isPriceLine("₹2,999 per month + GST")).toBe(true);
    expect(isPriceLine("Bills up to Rs. 20 lakh")).toBe(false);
  });

  it("passages are whole lines of about 400 characters", () => {
    const p = toPassages(Array.from({ length: 30 }, (_, i) => `Line number ${i} says something useful here`));
    expect(p.length).toBeGreaterThan(1);
    for (const x of p) expect(x.length).toBeLessThanOrEqual(420);
  });

  it("the closest passage reaches the LLM context as website_info; an unrelated message gets none", () => {
    setWebsitePassages([
      { url: "https://www.oxxy.in/contact-us", passages: ["Our office hours are Monday to Saturday, 10:30 AM to 6:00 PM."] },
      { url: "https://www.oxxy.in/oxxy-infinity", passages: ["The Cancer Plan can be activated even after cancer has been detected."] },
    ]);
    expect(websitePassages("what are your office hours on saturday")[0]?.source).toBe("https://www.oxxy.in/contact-us");
    expect((knowledgeFor("can the cancer plan be activated after cancer detected") as any).website_info?.[0]?.source).toBe(
      "https://www.oxxy.in/oxxy-infinity",
    );
    expect(websitePassages("hello there")).toEqual([]);
    setWebsitePassages([]);
  });
});
