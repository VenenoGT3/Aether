import { describe, it, expect } from "vitest";
import {
  assertBusinessCanFundEscrow,
  assertBusinessCanReleaseEscrow,
  AuthorizationError,
} from "@/lib/campaign-lifecycle";

describe("escrow authorization", () => {
  it("allows business to fund escrow", () => {
    expect(() => assertBusinessCanFundEscrow("business")).not.toThrow();
  });

  it("rejects influencer funding escrow", () => {
    expect(() => assertBusinessCanFundEscrow("influencer")).toThrow(
      AuthorizationError
    );
  });

  it("allows business to release escrow", () => {
    expect(() => assertBusinessCanReleaseEscrow("business")).not.toThrow();
  });

  it("rejects influencer releasing escrow", () => {
    expect(() => assertBusinessCanReleaseEscrow("influencer")).toThrow(
      AuthorizationError
    );
  });
});