"use server";

import { z } from "zod";
import { getServerUser, createClient } from "@/lib/supabase/server";
import { safeParse, uuidField } from "@/lib/validate";
import { toActionError, reportError, UnauthorizedError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  normalizeReferralCode,
  isValidReferralCode,
  buildReferralUrl,
  generateReferralCode,
} from "@/lib/referral";
import type { ReferralOverview, ReferredUser } from "@/types/referral";

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://aether.app";
}

const referralCodeField = z
  .string()
  .trim()
  .min(1, "Enter a referral code.")
  .transform((s) => normalizeReferralCode(s))
  .refine((s) => isValidReferralCode(s), "That referral code looks invalid.");

/**
 * Link the current user to a referrer by code (once). Idempotent + abuse-safe:
 * the RPC rejects self-referral, unknown codes, and already-referred accounts.
 */
export async function applyReferralCodeAction(
  rawCode: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = safeParse(referralCodeField, rawCode);
    if (!parsed.ok) return { success: false, error: parsed.error };
    const code = parsed.data;

    const me = await getServerUser();
    if (!me) throw new UnauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("attach_referral", { p_code: code });
    if (error) throw error;

    const res = (data ?? {}) as { ok?: boolean; reason?: string };
    if (!res.ok) {
      const messages: Record<string, string> = {
        invalid_code: "That referral code looks invalid.",
        already_referred: "Your account is already linked to a referrer.",
        code_not_found: "We couldn't find that referral code.",
        self_referral: "You can't refer yourself.",
      };
      return { success: false, error: messages[res.reason ?? ""] ?? "Could not apply that referral code." };
    }

    logger.info({ event: "referral.attached", userId: me.user_id }, "referral code applied");
    return { success: true };
  } catch (error) {
    return toActionError(error, { action: "applyReferralCode" });
  }
}

/**
 * Referrer claims their bonus for a referred user who has become active.
 * Server-authoritative + idempotent (the RPC credits both parties exactly once).
 */
export async function claimReferralBonusAction(
  referredUserId: string
): Promise<{ success: boolean; error?: string; reward?: number }> {
  try {
    const parsed = safeParse(uuidField, referredUserId);
    if (!parsed.ok) return { success: false, error: parsed.error };

    const me = await getServerUser();
    if (!me) throw new UnauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("claim_referral_bonus", {
      p_referred_id: parsed.data,
    });
    if (error) throw error;

    const res = (data ?? {}) as { ok?: boolean; reason?: string; referrer_amount?: number };
    if (!res.ok) {
      const messages: Record<string, string> = {
        not_found: "We couldn't find that referral.",
        already_claimed: "You've already claimed this referral bonus.",
        not_qualified: "Not eligible yet — they need an approved clip first.",
      };
      return { success: false, error: messages[res.reason ?? ""] ?? "Could not claim the referral bonus." };
    }

    logger.info(
      { event: "referral.bonus.claimed", userId: me.user_id, referredUserId: parsed.data },
      "referral bonus claimed"
    );
    return { success: true, reward: res.referrer_amount };
  } catch (error) {
    return toActionError(error, { action: "claimReferralBonus" });
  }
}

/** Everything the referral dashboard needs: my code/link, count, and referred users. */
export async function getReferralOverviewAction(): Promise<{
  success: boolean;
  error?: string;
  overview?: ReferralOverview;
}> {
  try {
    const me = await getServerUser();
    if (!me) throw new UnauthorizedError();
    const supabase = await createClient();

    // My referral code (lazily generate + persist if the trigger didn't set one).
    const { data: meRow } = await supabase
      .from("users")
      .select("referral_code, referral_count")
      .eq("id", me.user_id)
      .single();

    let code = (meRow?.referral_code as string | null) ?? "";
    if (!code) {
      code = generateReferralCode();
      await supabase.from("users").update({ referral_code: code }).eq("id", me.user_id);
    }

    // Referrals I made.
    const { data: rows } = await supabase
      .from("referrals")
      .select("referred_id, status, referrer_amount, created_at")
      .eq("referrer_id", me.user_id)
      .order("created_at", { ascending: false });

    const referralRows = (rows ?? []) as Array<{
      referred_id: string;
      status: string;
      referrer_amount: number | string | null;
      created_at: string;
    }>;
    const referredIds = referralRows.map((r) => r.referred_id);

    // Resolve names + qualification (approved/tracking clip) in batch.
    const namesById = new Map<string, string>();
    const qualifiedSet = new Set<string>();
    if (referredIds.length) {
      const [{ data: profs }, { data: clips }] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name").in("user_id", referredIds),
        supabase.from("clips").select("creator_id").in("creator_id", referredIds).in("status", ["approved", "tracking"]),
      ]);
      for (const p of (profs ?? []) as Array<{ user_id: string; full_name: string }>) {
        namesById.set(p.user_id, p.full_name || "Creator");
      }
      for (const c of (clips ?? []) as Array<{ creator_id: string }>) {
        qualifiedSet.add(c.creator_id);
      }
    }

    const referrals: ReferredUser[] = referralRows.map((r) => {
      const rewarded = r.status === "rewarded";
      const qualified = rewarded || qualifiedSet.has(r.referred_id);
      return {
        referred_id: r.referred_id,
        name: namesById.get(r.referred_id) ?? "Creator",
        status: rewarded ? "rewarded" : qualified ? "qualified" : "pending",
        qualified,
        claimable: qualified && !rewarded,
        created_at: String(r.created_at),
      };
    });

    const total_earned = referralRows
      .filter((r) => r.status === "rewarded")
      .reduce((sum, r) => sum + Number(r.referrer_amount ?? 0), 0);
    const pending_count = referrals.filter((r) => r.status === "pending").length;

    return {
      success: true,
      overview: {
        code,
        link: buildReferralUrl(code, appBaseUrl()),
        referral_count: Number(meRow?.referral_count ?? 0),
        total_earned,
        pending_count,
        referrals,
      },
    };
  } catch (error) {
    reportError(error, { action: "getReferralOverview" });
    return { success: false, error: "Could not load your referrals right now." };
  }
}
