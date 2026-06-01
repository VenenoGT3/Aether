import { describe, it, expect } from "vitest";
import {
  canReadOwnUser,
  canUpdateProfile,
  canReadCampaign,
  canReadParticipation,
  canInsertParticipation,
  canReadTransaction,
  canInsertEscrowTransaction,
  canInsertPayoutTransaction,
  canApprovePost,
  canInsertPost,
  canReadOwnNotification,
} from "@/lib/rls-policies";

function randomUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

describe("RLS property invariants", () => {
  it("profile update: only self (100 random pairs)", () => {
    for (let i = 0; i < 100; i++) {
      const a = randomUuid();
      const b = randomUuid();
      expect(canUpdateProfile(a, a)).toBe(true);
      if (a !== b) expect(canUpdateProfile(a, b)).toBe(false);
    }
  });

  it("users: only self can read own record", () => {
    for (let i = 0; i < 50; i++) {
      const a = randomUuid();
      const b = randomUuid();
      expect(canReadOwnUser(a, a)).toBe(true);
      if (a !== b) expect(canReadOwnUser(a, b)).toBe(false);
    }
  });

  it("draft campaigns: hidden from non-owners", () => {
    for (let i = 0; i < 50; i++) {
      const viewer = randomUuid();
      const owner = randomUuid();
      if (viewer !== owner) {
        expect(canReadCampaign(viewer, owner, "draft")).toBe(false);
      }
      expect(canReadCampaign(owner, owner, "draft")).toBe(true);
      expect(canReadCampaign(viewer, owner, "open")).toBe(true);
    }
  });

  it("participations: third party never reads", () => {
    for (let i = 0; i < 50; i++) {
      const stranger = randomUuid();
      const influencer = randomUuid();
      const business = randomUuid();
      if (stranger !== influencer && stranger !== business) {
        expect(
          canReadParticipation(stranger, influencer, business)
        ).toBe(false);
      }
    }
  });

  it("applications: only influencer role on self", () => {
    expect(canInsertParticipation("inf", "inf", "influencer")).toBe(true);
    expect(canInsertParticipation("biz", "biz", "business")).toBe(false);
    expect(canInsertParticipation("inf", "other", "influencer")).toBe(false);
  });

  it("escrow: only campaign owner funds", () => {
    for (let i = 0; i < 50; i++) {
      const business = randomUuid();
      const influencer = randomUuid();
      expect(canInsertEscrowTransaction(business, business)).toBe(true);
      if (business !== influencer) {
        expect(canInsertEscrowTransaction(influencer, business)).toBe(false);
      }
    }
  });

  it("payout: only owner on self with payout type", () => {
    const uid = randomUuid();
    expect(canInsertPayoutTransaction(uid, uid, "payout")).toBe(true);
    expect(canInsertPayoutTransaction(uid, randomUuid(), "payout")).toBe(false);
    expect(canInsertPayoutTransaction(uid, uid, "escrow")).toBe(false);
  });

  it("transactions read: owner via user_id or participation", () => {
    const biz = randomUuid();
    const inf = randomUuid();
    expect(canReadTransaction(biz, inf, biz, biz)).toBe(true);
    expect(canReadTransaction(inf, inf, biz, null)).toBe(true);
    expect(canReadTransaction(randomUuid(), inf, biz, null)).toBe(false);
  });

  it("post approval: business owner or admin only", () => {
    const biz = randomUuid();
    const inf = randomUuid();
    expect(canApprovePost(biz, biz, "business")).toBe(true);
    expect(canApprovePost(inf, biz, "influencer")).toBe(false);
    expect(canApprovePost(inf, biz, "admin")).toBe(true);
  });

  it("post submit: influencer only", () => {
    const inf = randomUuid();
    expect(canInsertPost(inf, inf)).toBe(true);
    expect(canInsertPost(randomUuid(), inf)).toBe(false);
  });

  it("notifications: strictly owner-scoped", () => {
    for (let i = 0; i < 50; i++) {
      const a = randomUuid();
      const b = randomUuid();
      expect(canReadOwnNotification(a, a)).toBe(true);
      if (a !== b) expect(canReadOwnNotification(a, b)).toBe(false);
    }
  });
});