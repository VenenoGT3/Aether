import { describe, it, expect } from "vitest";
import { verifyCronAuth, verifyStripeWebhookSignature } from "@/lib/campaign-lifecycle";

describe("webhook and cron hardening", () => {
  describe("verifyStripeWebhookSignature", () => {
    it("requires both a configured secret and a signature", () => {
      const result = verifyStripeWebhookSignature(false, false);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("signature");
    });

    it("rejects when the secret is configured but the signature is missing", () => {
      const result = verifyStripeWebhookSignature(true, false);
      expect(result.valid).toBe(false);
    });

    it("accepts a valid production setup (secret + signature present)", () => {
      expect(verifyStripeWebhookSignature(true, true)).toEqual({
        valid: true,
      });
    });
  });

  describe("verifyCronAuth", () => {
    it("rejects when CRON_SECRET is not configured", () => {
      const result = verifyCronAuth("Bearer wrong", undefined);
      expect(result.authorized).toBe(false);
      expect(result.error).toContain("CRON_SECRET");
    });

    it("rejects a wrong bearer token", () => {
      const result = verifyCronAuth("Bearer wrong", "secret123");
      expect(result.authorized).toBe(false);
    });

    it("accepts the correct bearer token", () => {
      expect(verifyCronAuth("Bearer secret123", "secret123")).toEqual({
        authorized: true,
      });
    });
  });
});