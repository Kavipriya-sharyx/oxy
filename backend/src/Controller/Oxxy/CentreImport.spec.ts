import { importedCentre } from "./Console.controller";

describe("centre CSV import (Playbook 10.1)", () => {
  const base = { name: "City Care", city: "Chennai" };

  it('"false" / "no" / empty is NOT verified (it used to be)', () => {
    expect(importedCentre({ ...base, verified: "false" }).verified).toBe(false);
    expect(importedCentre({ ...base, verified: "no" }).verified).toBe(false);
    expect(importedCentre({ ...base }).verified).toBe(false);
  });

  it("a verified row gets a source and a date", () => {
    const c = importedCentre({ ...base, verified: "yes", verification_source: "phone call 14 Nov" });
    expect(c.verified).toBe(true);
    expect(c.verification_source).toBe("phone call 14 Nov");
    expect(c.verified_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("is_private, specialisations and coordinates are read", () => {
    const c = importedCentre({ ...base, is_private: "no", specialisations: "cardiology| orthopaedics", latitude: "13.0", longitude: "80.2" });
    expect(c.is_private).toBe(false);
    expect(c.specialisations).toEqual(["cardiology", "orthopaedics"]);
    expect(c.latitude).toBe(13);
  });
});
