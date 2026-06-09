"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AtSign,
  CirclePlay,
  CreditCard,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Unlink,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  CreatorActionButton,
  CreatorGlassCard,
  CreatorPageShell,
  CreatorSectionHeader,
  CreatorStatusPill,
} from "@/components/creator/creator-ui";
import { apiGet, apiPost } from "@/lib/api/client";
import { getSupabaseUrl } from "@/lib/env";
import { startStripeOnboardingAction } from "@/lib/stripe/actions";
import {
  getClientProfile,
  requestPasswordResetClient,
  supabase,
  updateClientProfile,
} from "@/lib/supabase/client";
import { useTranslation } from "@/lib/translations";
import type { Profile } from "@/types";

type Provider = "youtube_official";

type SocialAccountStatus = {
  id: string;
  platform: "youtube" | "tiktok" | "instagram";
  provider: Provider | "tiktok_official" | "ayrshare" | "phyllo";
  external_account_id: string;
  handle: string | null;
  display_name: string | null;
  profile_url: string | null;
  scopes: string[] | null;
  status: "active" | "expired" | "revoked" | "error";
  last_verified_at: string | null;
  token_expires_at: string | null;
  updated_at: string;
};

type AccountsResponse = {
  success: true;
  accounts: SocialAccountStatus[];
};

const YOUTUBE_PROVIDER: Provider = "youtube_official";

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberInputValue(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function cleanOptional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export default function CreatorSettingsPage() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [accounts, setAccounts] = useState<SocialAccountStatus[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bio, setBio] = useState("");
  const [niche, setNiche] = useState("");
  const [followers, setFollowers] = useState("");
  const [engagementRate, setEngagementRate] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [youtube, setYoutube] = useState("");
  const [ratePost, setRatePost] = useState("");
  const [rateVideo, setRateVideo] = useState("");
  const [rateStory, setRateStory] = useState("");

  const linkedYouTube = useMemo(
    () => accounts.find((account) => account.provider === YOUTUBE_PROVIDER && account.status === "active") ?? null,
    [accounts]
  );
  const stripeConnected = !!profile?.stripe_connect_id && !!profile?.stripe_onboarding_completed;

  const hydrateProfile = (nextProfile: Profile | null) => {
    setProfile(nextProfile);
    setFullName(nextProfile?.full_name ?? "");
    setAvatarUrl(nextProfile?.avatar_url ?? "");
    setBio(nextProfile?.bio ?? "");
    setNiche(nextProfile?.niche ?? "");
    setFollowers(numberInputValue(nextProfile?.followers));
    setEngagementRate(numberInputValue(nextProfile?.engagement_rate));
    setInstagram(textValue(nextProfile?.social_links?.instagram));
    setTiktok(textValue(nextProfile?.social_links?.tiktok));
    setYoutube(textValue(nextProfile?.social_links?.youtube));
    setRatePost(numberInputValue(nextProfile?.rate_card?.post));
    setRateVideo(numberInputValue(nextProfile?.rate_card?.video));
    setRateStory(numberInputValue(nextProfile?.rate_card?.story));
  };

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      hydrateProfile(await getClientProfile());
    } catch {
      toast.error(t("Could not load account settings."));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const data = await apiGet<AccountsResponse>("/api/social-accounts");
      setAccounts(data.accounts);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Could not load linked social accounts."));
    } finally {
      setAccountsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch settings data once on mount
    void Promise.all([loadProfile(), loadAccounts()]);

    const params = new URLSearchParams(window.location.search);
    const linked = params.get("social_linked");
    const linkError = params.get("social_link_error");
    if (linked) {
      toast.success(t("Social account linked."), {
        description: t("Aether can now verify eligible clips from that account."),
      });
      window.history.replaceState({}, "", "/creator/settings");
    } else if (linkError) {
      toast.error(t("Social account linking failed."));
      window.history.replaceState({}, "", "/creator/settings");
    }
  }, [loadAccounts, loadProfile, t]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const result = await updateClientProfile({
        full_name: fullName.trim(),
        avatar_url: cleanOptional(avatarUrl),
        bio: bio.trim(),
        niche: niche.trim(),
        followers: Math.max(0, Math.round(Number(followers) || 0)),
        engagement_rate: Math.max(0, Number(engagementRate) || 0),
        social_links: {
          instagram: cleanOptional(instagram),
          tiktok: cleanOptional(tiktok),
          youtube: cleanOptional(youtube),
        },
        rate_card: {
          post: Math.max(0, Number(ratePost) || 0),
          video: Math.max(0, Number(rateVideo) || 0),
          story: Math.max(0, Number(rateStory) || 0),
        },
      });

      if (result.error) {
        toast.error(result.error.message || t("Could not save account settings."));
        return;
      }

      hydrateProfile(result.data);
      window.dispatchEvent(new Event("role-change"));
      toast.success(t("Account settings saved."));
    } catch {
      toast.error(t("Could not save account settings."));
    } finally {
      setSaving(false);
    }
  };

  const sendPasswordReset = async () => {
    if (!profile?.email) {
      toast.error(t("No email address is available for this account."));
      return;
    }
    setPasswordLoading(true);
    try {
      const { error } = await requestPasswordResetClient(profile.email);
      if (error) {
        toast.error(error.message || t("Could not send password reset email."));
        return;
      }
      toast.success(t("Password reset email sent."), {
        description: t("Open the newest email link to choose a new password."),
      });
    } catch {
      toast.error(t("Could not send password reset email."));
    } finally {
      setPasswordLoading(false);
    }
  };

  const connectStripe = async () => {
    setStripeLoading(true);
    try {
      const result = await startStripeOnboardingAction("influencer", window.location.origin);
      if (!result.success || !result.url) {
        toast.error(result.error || t("Failed to generate onboarding session."));
        return;
      }
      window.location.assign(result.url);
    } catch {
      toast.error(t("Failed to generate onboarding session."));
    } finally {
      setStripeLoading(false);
    }
  };

  const startSocialLink = async () => {
    setConnecting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error(t("Please sign in to connect a social account."));
      }

      const response = await fetch(
        `${getSupabaseUrl().replace(/\/$/, "")}/functions/v1/social-oauth/start`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            provider: YOUTUBE_PROVIDER,
            returnTo: "/creator/settings",
          }),
        }
      );
      const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error || t("Could not start account linking."));
      }
      window.location.assign(data.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Could not start account linking."));
      setConnecting(false);
    }
  };

  const disconnectSocialAccount = async (accountId: string) => {
    setDisconnecting(accountId);
    try {
      await apiPost<{ success: true; disconnected: boolean }>("/api/social-accounts", { accountId });
      toast.success(t("Social account disconnected."));
      await loadAccounts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Could not disconnect this account."));
    } finally {
      setDisconnecting(null);
    }
  };

  return (
    <CreatorPageShell maxWidth="content">
      <CreatorSectionHeader
        eyebrow={t("Account")}
        title={t("Account Settings")}
        description={t("Update your public creator profile, connected accounts, payout setup, and account security.")}
        action={
          <CreatorActionButton href="/creator/dashboard" variant="secondary">
            {t("Back to dashboard")}
          </CreatorActionButton>
        }
      />

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div className="space-y-5">
          <CreatorGlassCard>
            <div className="mb-5 flex items-center gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-xl border border-[rgba(77,142,255,0.22)] bg-[rgba(77,142,255,0.10)] text-[var(--creator-primary)]">
                <UserRound size={18} />
              </span>
              <div>
                <p className="creator-label text-white/35">{t("Public profile")}</p>
                <h2 className="text-lg font-semibold text-white">{t("Creator details")}</h2>
              </div>
            </div>

            {loading ? (
              <div className="flex h-40 items-center justify-center text-white/45">
                <Loader2 className="animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="creator-label text-white/40">{t("Full Name")}</span>
                  <input value={fullName} onChange={(event) => setFullName(event.target.value)} className="creator-input w-full rounded-xl px-3 py-3 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="creator-label text-white/40">{t("Avatar URL")}</span>
                  <input type="url" value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://..." className="creator-input w-full rounded-xl px-3 py-3 text-sm" />
                </label>
                <label className="space-y-2 sm:col-span-2">
                  <span className="creator-label text-white/40">{t("Bio")}</span>
                  <textarea value={bio} onChange={(event) => setBio(event.target.value)} rows={4} maxLength={500} className="creator-input w-full resize-none rounded-xl px-3 py-3 text-sm leading-6" />
                </label>
                <label className="space-y-2">
                  <span className="creator-label text-white/40">{t("Primary Niche")}</span>
                  <input value={niche} onChange={(event) => setNiche(event.target.value)} className="creator-input w-full rounded-xl px-3 py-3 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="creator-label text-white/40">{t("Followers")}</span>
                  <input type="number" min="0" value={followers} onChange={(event) => setFollowers(event.target.value)} className="creator-input w-full rounded-xl px-3 py-3 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="creator-label text-white/40">{t("Engagement rate")}</span>
                  <input type="number" min="0" step="0.1" value={engagementRate} onChange={(event) => setEngagementRate(event.target.value)} className="creator-input w-full rounded-xl px-3 py-3 text-sm" />
                </label>
              </div>
            )}
          </CreatorGlassCard>

          <CreatorGlassCard>
            <div className="mb-5 flex items-center gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-xl border border-[rgba(34,211,238,0.22)] bg-[rgba(34,211,238,0.10)] text-[var(--creator-cyan)]">
                <AtSign size={18} />
              </span>
              <div>
                <p className="creator-label text-white/35">{t("Creator profile links")}</p>
                <h2 className="text-lg font-semibold text-white">{t("Manual social handles")}</h2>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="space-y-2">
                <span className="creator-label text-white/40">Instagram</span>
                <input value={instagram} onChange={(event) => setInstagram(event.target.value)} placeholder="@handle" className="creator-input w-full rounded-xl px-3 py-3 text-sm" />
              </label>
              <label className="space-y-2">
                <span className="creator-label text-white/40">TikTok</span>
                <input value={tiktok} onChange={(event) => setTiktok(event.target.value)} placeholder="@handle" className="creator-input w-full rounded-xl px-3 py-3 text-sm" />
              </label>
              <label className="space-y-2">
                <span className="creator-label text-white/40">YouTube</span>
                <input value={youtube} onChange={(event) => setYoutube(event.target.value)} placeholder="@channel" className="creator-input w-full rounded-xl px-3 py-3 text-sm" />
              </label>
            </div>
          </CreatorGlassCard>

          <CreatorGlassCard>
            <div className="mb-5 flex items-center gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-xl border border-[rgba(159,141,250,0.22)] bg-[rgba(159,141,250,0.10)] text-[var(--creator-violet)]">
                <CreditCard size={18} />
              </span>
              <div>
                <p className="creator-label text-white/35">{t("Rate card")}</p>
                <h2 className="text-lg font-semibold text-white">{t("Default collaboration rates")}</h2>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="space-y-2">
                <span className="creator-label text-white/40">{t("Post")}</span>
                <input type="number" min="0" value={ratePost} onChange={(event) => setRatePost(event.target.value)} className="creator-input w-full rounded-xl px-3 py-3 text-sm" />
              </label>
              <label className="space-y-2">
                <span className="creator-label text-white/40">{t("Video")}</span>
                <input type="number" min="0" value={rateVideo} onChange={(event) => setRateVideo(event.target.value)} className="creator-input w-full rounded-xl px-3 py-3 text-sm" />
              </label>
              <label className="space-y-2">
                <span className="creator-label text-white/40">{t("Story")}</span>
                <input type="number" min="0" value={rateStory} onChange={(event) => setRateStory(event.target.value)} className="creator-input w-full rounded-xl px-3 py-3 text-sm" />
              </label>
            </div>
            <div className="mt-5 flex justify-end">
              <Button onClick={saveProfile} disabled={saving || loading} className="creator-gradient-accent h-11 rounded-xl border-0 px-5 text-xs font-semibold text-white hover:brightness-105">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {t("Save changes")}
              </Button>
            </div>
          </CreatorGlassCard>
        </div>

        <div className="space-y-5">
          <CreatorGlassCard>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="creator-label text-white/35">{t("Verified accounts")}</p>
                <h2 className="mt-1 text-lg font-semibold text-white">{t("Social account linking")}</h2>
              </div>
              <Link2 size={20} className="text-[var(--creator-primary)]" />
            </div>
            <p className="mb-4 text-xs leading-5 text-white/55">
              {t("Connect YouTube so eligible Shorts can be verified through the official YouTube Data API.")}
            </p>
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-3">
                  <span className="inline-flex size-10 items-center justify-center rounded-xl border border-[rgba(77,142,255,0.22)] bg-[rgba(77,142,255,0.10)] text-[var(--creator-primary)]">
                    <CirclePlay size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">YouTube</p>
                    <p className="truncate text-xs text-white/45">
                      {accountsLoading
                        ? t("Checking")
                        : linkedYouTube
                          ? linkedYouTube.display_name || linkedYouTube.handle || t("Connected")
                          : t("Not connected")}
                    </p>
                  </div>
                </div>
                {linkedYouTube ? (
                  <Button type="button" variant="ghost" size="sm" disabled={disconnecting === linkedYouTube.id} onClick={() => void disconnectSocialAccount(linkedYouTube.id)} className="h-9 rounded-xl px-3 text-white/65 hover:text-white">
                    {disconnecting === linkedYouTube.id ? <RefreshCw size={14} className="animate-spin" /> : <Unlink size={14} />}
                    {t("Disconnect")}
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" disabled={connecting || accountsLoading} onClick={() => void startSocialLink()} className="h-9 rounded-xl border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-white hover:bg-white/[0.08]">
                    {connecting ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                    {t("Connect")}
                  </Button>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <CreatorStatusPill tone={linkedYouTube ? "success" : "warning"}>
                {linkedYouTube ? t("Trusted tracking enabled") : t("YouTube required for beta")}
              </CreatorStatusPill>
            </div>
          </CreatorGlassCard>

          <CreatorGlassCard>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="creator-label text-white/35">{t("Payouts")}</p>
                <h2 className="mt-1 text-lg font-semibold text-white">{t("Stripe Connect")}</h2>
              </div>
              <CreditCard size={20} className="text-[var(--creator-primary)]" />
            </div>
            <p className="mb-4 text-xs leading-5 text-white/55">
              {stripeConnected
                ? t("Stripe is connected for creator withdrawals.")
                : t("Connect Stripe so approved earnings can be paid out.")}
            </p>
            <Button onClick={connectStripe} disabled={stripeLoading} className="creator-gradient-accent h-11 w-full rounded-xl border-0 text-xs font-semibold text-white hover:brightness-105">
              {stripeLoading ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
              {stripeConnected ? t("Refresh Stripe setup") : t("Connect Stripe")}
            </Button>
          </CreatorGlassCard>

          <CreatorGlassCard>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="creator-label text-white/35">{t("Security")}</p>
                <h2 className="mt-1 text-lg font-semibold text-white">{t("Login and password")}</h2>
              </div>
              <KeyRound size={20} className="text-[var(--creator-primary)]" />
            </div>
            <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.035] p-3">
              <p className="creator-label text-white/35">{t("Email Address")}</p>
              <p className="mt-1 truncate text-sm font-semibold text-white">{profile?.email || t("Not available")}</p>
            </div>
            <Button onClick={sendPasswordReset} disabled={passwordLoading || !profile?.email} variant="outline" className="h-11 w-full rounded-xl border-white/10 bg-white/[0.04] text-xs font-semibold text-white hover:bg-white/[0.08]">
              {passwordLoading ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
              {t("Send password reset email")}
            </Button>
          </CreatorGlassCard>
        </div>
      </div>
    </CreatorPageShell>
  );
}
