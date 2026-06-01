import { describe, it, expect } from "vitest";
import {
  canUpdateProfile,
  canReadParticipation,
  canReadTransaction,
  canInsertBusinessTransaction,
  canReadOwnNotification,
  canReadProfile,
  canInsertNotification,
} from "@/lib/rls-policies";

describe("RLS policy mirrors", () => {
  const uid = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const businessId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const influencerId = "cccccccc-cccc-cccc-cccc-cccccccccccc";

  it("profiles: only owner can update", () => {
    expect(canUpdateProfile(uid, uid)).toBe(true);
    expect(canUpdateProfile(uid, influencerId)).toBe(false);
  });

  it("profiles: business profiles hidden from unrelated viewers", () => {
    expect(canReadProfile(uid, businessId, "business", false)).toBe(false);
    expect(canReadProfile(uid, influencerId, "influencer", false)).toBe(
      true
    );
  });

  it("participations: business and influencer can read", () => {
    expect(canReadParticipation(businessId, influencerId, businessId)).toBe(
      true
    );
    expect(canReadParticipation(influencerId, influencerId, businessId)).toBe(
      true
    );
    expect(canReadParticipation("other", influencerId, businessId)).toBe(
      false
    );
  });

  it("transactions: escrow insert restricted to campaign owner", () => {
    expect(canInsertBusinessTransaction(businessId, businessId, null)).toBe(
      true
    );
    expect(canInsertBusinessTransaction(influencerId, businessId, null)).toBe(
      false
    );
    expect(
      canReadTransaction(businessId, influencerId, businessId, businessId)
    ).toBe(true);
  });

  it("notifications: owner-only read; counterparty insert", () => {
    expect(canReadOwnNotification(uid, uid)).toBe(true);
    expect(canReadOwnNotification(uid, businessId)).toBe(false);
    expect(
      canInsertNotification(businessId, influencerId, businessId, influencerId)
    ).toBe(true);
    expect(
      canInsertNotification(uid, influencerId, businessId, influencerId)
    ).toBe(false);
  });
});