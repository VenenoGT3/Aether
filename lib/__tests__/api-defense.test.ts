import { describe, it, expect } from "vitest";
import { formatZodErrors } from "@/lib/api/zod-errors";
import {
  CampaignApplyBodySchema,
  PostSubmitBodySchema,
  CampaignSearchQuerySchema,
} from "@/lib/api/schemas";
import { buildRateLimitKey, checkRateLimit } from "@/lib/api/rate-limit";

describe("API defense", () => {
  it("formats Zod errors with friendly field labels", () => {
    const parsed = CampaignApplyBodySchema.safeParse({
      proposed_payout: -1,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const formatted = formatZodErrors(parsed.error);
      expect(formatted.message.length).toBeGreaterThan(0);
      expect(Object.keys(formatted.fields).length).toBeGreaterThan(0);
    }
  });

  it("rejects honeypot spam on apply", () => {
    const parsed = CampaignApplyBodySchema.safeParse({
      proposed_payout: 100,
      _hp: "http://spam.test",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts valid post submit payload", () => {
    const parsed = PostSubmitBodySchema.safeParse({
      post_url: "https://www.instagram.com/reel/abc123/",
      _hp: "",
    });
    expect(parsed.success).toBe(true);
  });

  it("coerces search query pagination", () => {
    const parsed = CampaignSearchQuerySchema.safeParse({
      page: "2",
      limit: "10",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.page).toBe(2);
      expect(parsed.data.limit).toBe(10);
    }
  });

  it("rate limits by user key independently", () => {
    const keyA = buildRateLimitKey("apply", "1.2.3.4", "user-a");
    const keyB = buildRateLimitKey("apply", "1.2.3.4", "user-b");
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(keyA, 5, 60_000).allowed).toBe(true);
    }
    expect(checkRateLimit(keyA, 5, 60_000).allowed).toBe(false);
    expect(checkRateLimit(keyB, 5, 60_000).allowed).toBe(true);
  });
});