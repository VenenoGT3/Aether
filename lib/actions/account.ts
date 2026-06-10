"use server";

import { getServerUser, createClient } from "@/lib/supabase/server";
import { toActionError, UnauthorizedError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Permanently delete the caller's account (GDPR right to erasure).
 *
 * The delete_own_account RPC refuses while money is in flight — unpaid
 * earnings, a processing payout, live campaigns, or funded-but-unreleased
 * escrow — and otherwise deletes the auth user, cascading every public row.
 * On success the server session is signed out; the client should navigate
 * back to the landing page.
 */
export async function deleteOwnAccountAction(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const me = await getServerUser();
    if (!me) throw new UnauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("delete_own_account");
    if (error) throw error;

    const res = (data ?? {}) as { ok?: boolean; reason?: string };
    if (!res.ok) {
      const messages: Record<string, string> = {
        earnings_in_flight:
          "You still have earnings in holdback or ready for payout. Withdraw them first, then delete your account.",
        payout_processing:
          "A payout is still processing. Wait for it to settle, then delete your account.",
        active_campaigns:
          "You still have live campaigns. Complete or cancel them first, then delete your account.",
        escrow_unreleased:
          "A funded escrow has not been released to its creator yet. Release it first, then delete your account.",
      };
      return {
        success: false,
        error: messages[res.reason ?? ""] ?? "Your account could not be deleted right now.",
      };
    }

    logger.info({ event: "account.deleted", userId: me.user_id }, "account deleted");

    // The auth user is gone; clear the now-orphaned session cookies. Local
    // scope only — a server-side logout would 403 for the deleted user.
    await supabase.auth.signOut({ scope: "local" });

    return { success: true };
  } catch (error) {
    return toActionError(error, { action: "deleteOwnAccount" });
  }
}
