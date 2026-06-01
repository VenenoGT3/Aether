import { describe, it, expect } from "vitest";
import { verifyCronAuth, verifyStripeWebhookSignature } from "@/lib/campaign-lifecycle";

describe("webhook and cron hardening", () => {
  describe("verifyStripeWebhookSignature", () => {
    it("allows mock mode without signature", () => {
      expect(verifyStripeWebhookSignature(false, false, true)).toEqual({
        valid: true,
      });
    });

    it("requires signature in production", () => {
      const result = verifyStripeWebhookSignature(false, false, false);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("signature");
    });

    it("accepts valid production setup", () => {
      expect(verifyStripeWebhookSignature(true, true, false)).toEqual({
        valid: true,
      });
    });
  });

  describe("verifyCronAuth", () => {
    it("allows mock mode without secret", () => {
      expect(verifyCronAuth(null, undefined, true)).toEqual({
        authorized: true,
      });
    });

    it("rejects production without CRON_SECRET configured", () => {
      const result = verifyCronAuth("Bearer wrong", undefined, false);
      expect(result.authorized).toBe(false);
      expect(result.error).toContain("CRON_SECRET");
    });

    it("rejects wrong bearer token", () => {
      const result = verifyCronAuth("Bearer wrong", "secret123", false);
      expect(result.authorized).toBe(false);
    });

    it("accepts correct bearer token", () => {
      expect(verifyCronAuth("Bearer secret123", "secret123", false)).toEqual({
        authorized: true,
      });
    });
  });
});