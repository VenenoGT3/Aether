import { describe, it, expect } from "vitest";
import {
  assertCanApprovePost,
  AuthorizationError,
} from "@/lib/campaign-lifecycle";
import { canReadPost, canInsertPost } from "@/lib/rls-policies";

describe("post approval", () => {
  const businessId = "11111111-1111-1111-1111-111111111111";
  const influencerId = "33333333-3333-3333-3333-333333333333";

  it("allows business to approve submitted posts", () => {
    expect(() =>
      assertCanApprovePost(businessId, businessId, "submitted")
    ).not.toThrow();
  });

  it("rejects approval when participation is still applied", () => {
    expect(() =>
      assertCanApprovePost(businessId, businessId, "applied")
    ).toThrow(AuthorizationError);
  });

  it("rejects non-owner business from approving", () => {
    expect(() =>
      assertCanApprovePost(influencerId, businessId, "submitted")
    ).toThrow(AuthorizationError);
  });

  it("mirrors RLS: influencer can submit, both parties can read", () => {
    expect(canInsertPost(influencerId, influencerId)).toBe(true);
    expect(canReadPost(businessId, influencerId, businessId)).toBe(true);
    expect(canReadPost(influencerId, influencerId, businessId)).toBe(true);
  });
});