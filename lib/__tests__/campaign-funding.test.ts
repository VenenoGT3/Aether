import { describe, it, expect } from "vitest";
import {
  shouldActivateFromPaymentStatus,
  planReconciliation,
  planCancellation,
  type FundingCampaignState,
} from "@/lib/api/services/campaign-funding-logic";

const base: FundingCampaignState = {
  campaign_type: "performance",
  status: "draft",
  funded_at: null,
  funding_payment_intent_id: "pi_123",
};

describe("campaign-funding-logic shouldActivateFromPaymentStatus", () => {
  it("activates only on a succeeded PaymentIntent", () => {
    expect(shouldActivateFromPaymentStatus("succeeded")).toBe(true);
    expect(shouldActivateFromPaymentStatus("processing")).toBe(false);
    expect(shouldActivateFromPaymentStatus("requires_payment_method")).toBe(false);
    expect(shouldActivateFromPaymentStatus("canceled")).toBe(false);
  });
});

describe("campaign-funding-logic planReconciliation", () => {
  it("checks Stripe for a draft campaign with a funding PI", () => {
    expect(planReconciliation(base).action).toBe("check_stripe");
  });

  it("is a no-op once funded", () => {
    expect(planReconciliation({ ...base, funded_at: "2026-06-02" }).action).toBe("already_active");
  });

  it("is a no-op once the campaign is live", () => {
    expect(planReconciliation({ ...base, status: "open" }).action).toBe("already_active");
  });

  it("reports when no payment was ever started", () => {
    expect(planReconciliation({ ...base, funding_payment_intent_id: null }).action).toBe("no_payment");
  });
});

describe("campaign-funding-logic planCancellation", () => {
  it("allows cancelling a draft and flags a refund when a PI exists", () => {
    expect(planCancellation(base)).toEqual({ ok: true, needsRefund: true });
  });

  it("allows cancelling a draft with no refund when no PI exists", () => {
    expect(planCancellation({ ...base, funding_payment_intent_id: null })).toEqual({
      ok: true,
      needsRefund: false,
    });
  });

  it("refuses to cancel a live campaign", () => {
    expect(planCancellation({ ...base, status: "open" })).toEqual({
      ok: false,
      reason: "not_draft",
    });
  });

  it("treats an already-cancelled campaign as a no-op", () => {
    expect(planCancellation({ ...base, status: "cancelled" })).toEqual({
      ok: false,
      reason: "already_cancelled",
    });
  });
});
