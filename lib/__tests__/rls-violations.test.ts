import { describe, it, expect } from "vitest";
import {
  canReadParticipation,
  canReadCampaign,
  canReadProfile,
  canReadRating,
  canInsertNotification,
  canInsertParticipation,
  canReadPost,
  canReadTransaction,
  canReadMessage,
  canInsertMessage,
  canUpdateMessageReadStatus,
  canMutateMessageContent,
  canChangeUserRole,
  canInsertBusinessTransaction,
  canApprovePost,
  canModifyPostDetails,
} from "@/lib/rls-policies";

const bizA = "11111111-1111-1111-1111-111111111111";
const bizB = "22222222-2222-2222-2222-222222222222";
const infA = "33333333-3333-3333-3333-333333333333";
const infB = "44444444-4444-4444-4444-444444444444";
const stranger = "55555555-5555-5555-5555-555555555555";

describe("RLS violation scenarios (must deny)", () => {
  describe("cross-tenant participations", () => {
    it("influencer A cannot read influencer B application on biz A campaign", () => {
      expect(canReadParticipation(infA, infB, bizA)).toBe(false);
    });

    it("business B cannot read participations on business A campaign", () => {
      expect(canReadParticipation(bizB, infA, bizA)).toBe(false);
    });

    it("stranger cannot read any participation", () => {
      expect(canReadParticipation(stranger, infA, bizA)).toBe(false);
    });

    it("influencer cannot apply on behalf of another influencer", () => {
      expect(canInsertParticipation(infA, infB, "influencer")).toBe(false);
    });

    it("business cannot apply as influencer", () => {
      expect(canInsertParticipation(bizA, bizA, "business")).toBe(false);
    });
  });

  describe("campaign isolation", () => {
    it("business B cannot read business A draft campaign", () => {
      expect(canReadCampaign(bizB, bizA, "draft")).toBe(false);
    });

    it("business B can read business A open campaign (marketplace)", () => {
      expect(canReadCampaign(bizB, bizA, "open")).toBe(true);
    });

    it("stranger can read open campaigns (marketplace)", () => {
      expect(canReadCampaign(stranger, bizA, "open")).toBe(true);
    });
  });

  describe("profiles", () => {
    it("business B cannot read business A profile without shared participation", () => {
      expect(canReadProfile(bizB, bizA, "business", false)).toBe(false);
    });

    it("business A can read business B profile when they share a deal", () => {
      expect(canReadProfile(bizA, bizB, "business", true)).toBe(true);
    });

    it("any user can discover influencer profiles", () => {
      expect(canReadProfile(stranger, infA, "influencer", false)).toBe(true);
    });

    it("influencer can always read own profile", () => {
      expect(canReadProfile(infA, infA, "influencer", false)).toBe(true);
    });
  });

  describe("posts & approval", () => {
    it("influencer cannot approve own post (trigger + policy)", () => {
      expect(canApprovePost(infA, bizA, "influencer")).toBe(false);
    });

    it("other influencer cannot modify post details", () => {
      expect(canModifyPostDetails(infB, infA, "influencer")).toBe(false);
    });

    it("stranger cannot read posts on private participation", () => {
      expect(canReadPost(stranger, infA, bizA)).toBe(false);
    });
  });

  describe("transactions", () => {
    it("influencer cannot fund escrow on another business campaign", () => {
      expect(canInsertBusinessTransaction(infA, bizA, null)).toBe(false);
    });

    it("business B cannot read biz A escrow without participation link", () => {
      expect(canReadTransaction(bizB, infA, bizA, null)).toBe(false);
    });

    it("business A can read transactions on own campaign", () => {
      expect(canReadTransaction(bizA, infA, bizA, null)).toBe(true);
    });
  });

  describe("notifications", () => {
    it("cannot notify arbitrary user", () => {
      expect(
        canInsertNotification(stranger, infA, bizA, infA)
      ).toBe(false);
    });

    it("business can notify influencer on shared campaign", () => {
      expect(canInsertNotification(bizA, infA, bizA, infA)).toBe(true);
    });

    it("influencer can notify business on shared campaign", () => {
      expect(canInsertNotification(infA, bizA, bizA, infA)).toBe(true);
    });
  });

  describe("ratings", () => {
    it("stranger cannot read campaign ratings", () => {
      expect(canReadRating(stranger, infA, bizA, false)).toBe(false);
    });

    it("participant can read ratings", () => {
      expect(canReadRating(infA, bizA, infA, true)).toBe(true);
    });
  });

  describe("messages", () => {
    it("stranger cannot read thread", () => {
      expect(canReadMessage(stranger, infA, infA, bizA)).toBe(false);
    });

    it("stranger cannot send message", () => {
      expect(canInsertMessage(stranger, stranger, infA, bizA)).toBe(false);
    });

    it("participant can mark read", () => {
      expect(canUpdateMessageReadStatus(bizA, infA, bizA)).toBe(true);
    });

    it("content mutation always denied at policy mirror level", () => {
      expect(canMutateMessageContent()).toBe(false);
    });
  });

  describe("privilege escalation", () => {
    it("non-admin cannot change roles", () => {
      expect(canChangeUserRole("influencer", "influencer", "admin")).toBe(
        false
      );
      expect(canChangeUserRole("business", "business", "admin")).toBe(false);
    });

    it("admin can change roles", () => {
      expect(canChangeUserRole("admin", "influencer", "business")).toBe(true);
    });
  });
});