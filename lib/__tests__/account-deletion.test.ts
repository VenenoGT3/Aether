import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SQL = readFileSync(
  join(__dirname, "../../supabase/migrations/20260610150000_account_deletion.sql"),
  "utf-8"
);

describe("delete_own_account migration contract", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    expect(SQL).toContain("SECURITY DEFINER");
    expect(SQL).toMatch(/SET search_path = public/);
  });

  it("only deletes the caller (auth.uid()), never an arbitrary user", () => {
    expect(SQL).toMatch(/auth\.uid\(\)/);
    expect(SQL).toMatch(/DELETE FROM auth\.users WHERE id = v_me/);
    // No parameters: the function signature must stay zero-arg so a caller
    // can never target someone else's account.
    expect(SQL).toMatch(/delete_own_account\(\)/);
  });

  it("blocks deletion while money is in flight", () => {
    expect(SQL).toContain("'earnings_in_flight'");
    expect(SQL).toContain("'payout_processing'");
    expect(SQL).toContain("'active_campaigns'");
    expect(SQL).toContain("'escrow_unreleased'");
  });

  it("locks down privileges to authenticated only", () => {
    expect(SQL).toMatch(/REVOKE ALL ON FUNCTION public\.delete_own_account\(\) FROM PUBLIC/);
    expect(SQL).toMatch(/REVOKE ALL ON FUNCTION public\.delete_own_account\(\) FROM anon/);
    expect(SQL).toMatch(/GRANT EXECUTE ON FUNCTION public\.delete_own_account\(\) TO authenticated/);
    expect(SQL).not.toMatch(/GRANT .*TO (PUBLIC|anon)/i);
  });
});
