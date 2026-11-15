import { alertText, maskNumber, urgentLabel } from "./UrgentAlert.service";

describe("urgent alert text (Full Plan 12.7)", () => {
  it("says what kind of case and what to do, with no health detail and no full number", () => {
    const t = alertText(
      { type: "emergency" },
      { first_name: "Ravi", wa_number: "919840012345" },
      "https://console.oxxy.in/",
    );
    expect(t).toContain("Medical emergency reported");
    expect(t).toContain("Ravi …2345");
    expect(t).toContain("Call the customer now");
    expect(t).toContain("Open: https://console.oxxy.in/escalations");
    expect(t).not.toContain("9198400"); // never the full number outside the console
  });
  it("self-harm points to Tele-MANAS; other urgent cases ask for a call back", () => {
    expect(
      alertText({ type: "self_harm" }, { first_name: null, wa_number: "919800000001" }),
    ).toContain("14416");
    expect(alertText({ type: "escalation" }, {})).toContain("A person must call back");
    expect(urgentLabel("something_else")).toBe("Urgent case");
    expect(maskNumber(null)).toBe("");
  });
  it("without a console address the alert has no link", () => {
    expect(alertText({ type: "emergency" }, { wa_number: "919840012345" })).not.toContain("http");
  });
});
