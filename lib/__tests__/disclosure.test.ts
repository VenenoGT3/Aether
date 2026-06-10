import { afterEach, describe, expect, it } from "vitest";
import { getDisclosureEnforcement, hasAdDisclosure } from "@/lib/disclosure";

describe("EU disclosure check", () => {
  const original = process.env.DISCLOSURE_ENFORCEMENT;

  afterEach(() => {
    if (original === undefined) delete process.env.DISCLOSURE_ENFORCEMENT;
    else process.env.DISCLOSURE_ENFORCEMENT = original;
  });

  it("recognizes EU/Italian disclosure markers", () => {
    expect(hasAdDisclosure("Great product! #ad")).toBe(true);
    expect(hasAdDisclosure("", "Video pazzesco #adv #fyp")).toBe(true);
    expect(hasAdDisclosure("Contenuto #sponsorizzato dal brand")).toBe(true);
    expect(hasAdDisclosure("In collaborazione a pagamento con X")).toBe(true);
    expect(hasAdDisclosure("Paid partnership with Aether")).toBe(true);
    expect(hasAdDisclosure("#pubblicità trasparente")).toBe(true);
  });

  it("does not false-positive on lookalikes", () => {
    expect(hasAdDisclosure("Check my #advice for creators")).toBe(false);
    expect(hasAdDisclosure("#adventure vlog day 3")).toBe(false);
    expect(hasAdDisclosure("Just a normal video")).toBe(false);
    expect(hasAdDisclosure(null, undefined, "")).toBe(false);
  });

  it("defaults enforcement to block, honors warn/off", () => {
    delete process.env.DISCLOSURE_ENFORCEMENT;
    expect(getDisclosureEnforcement()).toBe("block");
    process.env.DISCLOSURE_ENFORCEMENT = "warn";
    expect(getDisclosureEnforcement()).toBe("warn");
    process.env.DISCLOSURE_ENFORCEMENT = "off";
    expect(getDisclosureEnforcement()).toBe("off");
    process.env.DISCLOSURE_ENFORCEMENT = "nonsense";
    expect(getDisclosureEnforcement()).toBe("block");
  });
});
