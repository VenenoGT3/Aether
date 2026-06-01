import { describe, it, expect } from "vitest";
import {
  canUpdateProfile,
  canReadParticipation,
  canReadTransaction,
  canInsertEscrowTransaction,
  canReadOwnNotification,
} from "@/lib/rls-policies";

describe("RLS policy mirrors", () => {
  const uid = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const businessId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const influencerId = "cccccccc-cccc-cccc-cccc-cccccccccccc";

  it("profiles: only owner can update", () => {
    expect(canUpdateProfile(uid, uid)).toBe(true);
    expect(canUpdateProfile(uid, influencerId)).toBe(false);
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
    expect(canInsertEscrowTransaction(businessId, businessId)).toBe(true);
    expect(canInsertEscrowTransaction(influencerId, businessId)).toBe(false);
    expect(
      canReadTransaction(businessId, influencerId, businessId, businessId)
    ).toBe(true);
  });

  it("notifications: owner-only access", () => {
    expect(canReadOwnNotification(uid, uid)).toBe(true);
    expect(canReadOwnNotification(uid, businessId)).toBe(false);
  });
});