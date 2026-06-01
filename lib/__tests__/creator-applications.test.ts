import { describe, it, expect } from "vitest";
import {
  assertInfluencerCanApply,
  AuthorizationError,
} from "@/lib/campaign-lifecycle";
import {
  canInsertParticipation,
  canDeleteAppliedParticipation,
} from "@/lib/rls-policies";

describe("creator applications", () => {
  const influencerId = "33333333-3333-3333-3333-333333333333";

  it("allows influencer to apply as themselves", () => {
    expect(() =>
      assertInfluencerCanApply(influencerId, influencerId)
    ).not.toThrow();
    expect(canInsertParticipation(influencerId, influencerId, "influencer")).toBe(
      true
    );
  });

  it("rejects applying on behalf of another user", () => {
    expect(() =>
      assertInfluencerCanApply("other-user", influencerId)
    ).toThrow(AuthorizationError);
  });

  it("allows withdrawal of applied participations only", () => {
    expect(
      canDeleteAppliedParticipation(influencerId, influencerId, "applied")
    ).toBe(true);
    expect(
      canDeleteAppliedParticipation(influencerId, influencerId, "approved")
    ).toBe(false);
  });
});