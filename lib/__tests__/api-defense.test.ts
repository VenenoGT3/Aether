import { describe, it, expect } from "vitest";
import { formatZodErrors } from "@/lib/api/zod-errors";
import {
  CampaignApplyBodySchema,
  PostSubmitBodySchema,
  CampaignSearchQuerySchema,
  MetricsFetchBodySchema,
} from "@/lib/api/schemas";
import {
  buildRateLimitKey,
  checkRateLimit,
  applyRateLimit,
} from "@/lib/api/rate-limit";
import {
  isAllowedPostUrl,
  isSuspiciousSearchQuery,
  sanitizeSearchQuery,
} from "@/lib/api/abuse";

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

  it("rejects short pitch text", () => {
    const parsed = CampaignApplyBodySchema.safeParse({
      proposed_payout: 100,
      pitch: "hi",
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

  it("rejects non-social post URLs", () => {
    const parsed = PostSubmitBodySchema.safeParse({
      post_url: "https://evil.example.com/phish",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects suspicious search queries", () => {
    const parsed = CampaignSearchQuerySchema.safeParse({
      q: "select * from users",
    });
    expect(parsed.success).toBe(false);
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

  it("sanitizes ilike wildcards in search", () => {
    expect(sanitizeSearchQuery("desk%setup_")).toBe("desksetup");
  });

  it("flags suspicious search heuristics", () => {
    expect(isSuspiciousSearchQuery("javascript:alert(1)")).toBe(true);
    expect(isSuspiciousSearchQuery("mechanical keyboard")).toBe(false);
  });

  it("allows known social hosts", () => {
    expect(isAllowedPostUrl("https://www.tiktok.com/@user/video/1")).toBe(true);
    expect(isAllowedPostUrl("https://youtu.be/abc")).toBe(true);
    expect(isAllowedPostUrl("https://badsite.com/x")).toBe(false);
  });

  it("metrics fetch requires allowed URL host", () => {
    const parsed = MetricsFetchBodySchema.safeParse({
      post_url: "https://www.instagram.com/p/abc/",
    });
    expect(parsed.success).toBe(true);
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

  it("enforces per-IP ceiling after per-user limit", () => {
    const request = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "9.9.9.9" },
    });
    for (let u = 0; u < 12; u++) {
      const result = applyRateLimit(request, "apply", "apply", `user-${u}`);
      expect(result.allowed).toBe(true);
    }
    const blocked = applyRateLimit(request, "apply", "apply", "user-extra");
    expect(blocked.allowed).toBe(false);
  });
});