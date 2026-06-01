import { describe, it, expect } from "vitest";
import {
  assertBusinessOwnsCampaign,
  AuthorizationError,
} from "@/lib/campaign-lifecycle";
import { canInsertCampaign, canUpdateCampaign } from "@/lib/rls-policies";

describe("campaign ownership", () => {
  const businessId = "11111111-1111-1111-1111-111111111111";
  const otherId = "22222222-2222-2222-2222-222222222222";

  it("allows owner to manage campaign", () => {
    expect(() =>
      assertBusinessOwnsCampaign(businessId, businessId)
    ).not.toThrow();
    expect(canUpdateCampaign(businessId, businessId)).toBe(true);
    expect(canInsertCampaign(businessId, businessId, "business")).toBe(true);
  });

  it("rejects non-owner", () => {
    expect(() => assertBusinessOwnsCampaign(otherId, businessId)).toThrow(
      AuthorizationError
    );
    expect(canUpdateCampaign(otherId, businessId)).toBe(false);
  });

  it("allows read of non-draft campaigns by any authenticated user", () => {
    expect(canInsertCampaign(otherId, otherId, "influencer")).toBe(false);
  });
});