"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  CreditCard,
  ExternalLink,
  KeyRound,
  Loader2,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  BusinessActionButton,
  BusinessGlassCard,
  BusinessPortalShell,
  BusinessSectionHeader,
  BusinessStatusPill,
} from "@/components/business/business-ui";
import { DeleteAccountCard } from "@/components/delete-account-card";
import { startStripeOnboardingAction } from "@/lib/stripe/actions";
import {
  getClientProfile,
  requestPasswordResetClient,
  updateClientProfile,
} from "@/lib/supabase/client";
import { useTranslation } from "@/lib/translations";
import type { Profile } from "@/types";

function cleanOptional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export default function BusinessSettingsPage() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);

  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  const stripeConnected = !!profile?.stripe_connect_id && !!profile?.stripe_onboarding_completed;

  const hydrateProfile = (nextProfile: Profile | null) => {
    setProfile(nextProfile);
    setFullName(nextProfile?.full_name ?? "");
    setCompanyName(nextProfile?.company_name ?? "");
    setWebsite(nextProfile?.website ?? "");
    setIndustry(nextProfile?.industry ?? "");
    setCompanySize(nextProfile?.company_size ?? "");
    setAvatarUrl(nextProfile?.avatar_url ?? "");
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch settings data once on mount
    void loadProfile();
  }, [loadProfile]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const result = await updateClientProfile({
        full_name: fullName.trim(),
        company_name: companyName.trim(),
        website: cleanOptional(website),
        industry: cleanOptional(industry),
        company_size: cleanOptional(companySize),
        avatar_url: cleanOptional(avatarUrl),
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
      const result = await startStripeOnboardingAction("business", window.location.origin);
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

  return (
    <BusinessPortalShell maxWidth="content">
      <BusinessSectionHeader
        eyebrow={t("Account")}
        title={t("Account Settings")}
        description={t("Update your brand workspace, billing readiness, and account security.")}
        action={
          <BusinessActionButton href="/business/dashboard" size="sm" variant="secondary">
            {t("Back to dashboard")}
          </BusinessActionButton>
        }
      />

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="space-y-5">
          <BusinessGlassCard>
            <div className="mb-5 flex items-center gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-xl border border-[rgba(173,198,255,0.20)] bg-[rgba(173,198,255,0.10)] text-[var(--business-primary)]">
                <Building2 size={18} />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--business-muted)]">{t("Workspace profile")}</p>
                <h2 className="text-lg font-semibold text-[var(--business-text)]">{t("Brand details")}</h2>
              </div>
            </div>

            {loading ? (
              <div className="flex h-40 items-center justify-center text-[var(--business-muted)]">
                <Loader2 className="animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">{t("Company name")}</span>
                  <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} className="business-input h-12 w-full rounded-xl px-4 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">{t("Representative name")}</span>
                  <input value={fullName} onChange={(event) => setFullName(event.target.value)} className="business-input h-12 w-full rounded-xl px-4 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">{t("Website")}</span>
                  <input type="url" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://..." className="business-input h-12 w-full rounded-xl px-4 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">{t("Avatar URL")}</span>
                  <input type="url" value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://..." className="business-input h-12 w-full rounded-xl px-4 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">{t("Industry")}</span>
                  <input value={industry} onChange={(event) => setIndustry(event.target.value)} className="business-input h-12 w-full rounded-xl px-4 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">{t("Company size")}</span>
                  <input value={companySize} onChange={(event) => setCompanySize(event.target.value)} className="business-input h-12 w-full rounded-xl px-4 text-sm" />
                </label>
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <Button onClick={saveProfile} disabled={saving || loading} className="h-11 rounded-xl bg-[linear-gradient(135deg,var(--business-primary)_0%,var(--business-secondary)_100%)] px-5 text-xs font-semibold text-[var(--business-bg)] hover:brightness-105">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {t("Save changes")}
              </Button>
            </div>
          </BusinessGlassCard>

          <BusinessGlassCard>
            <div className="mb-5 flex items-center gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-xl border border-[rgba(77,142,255,0.20)] bg-[rgba(77,142,255,0.10)] text-[var(--business-accent)]">
                <UserRound size={18} />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--business-muted)]">{t("Account owner")}</p>
                <h2 className="text-lg font-semibold text-[var(--business-text)]">{t("Login identity")}</h2>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">{t("Email Address")}</p>
              <p className="mt-1 truncate text-sm font-semibold text-[var(--business-text)]">{profile?.email || t("Not available")}</p>
            </div>
          </BusinessGlassCard>
        </div>

        <div className="space-y-5">
          <BusinessGlassCard>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--business-muted)]">{t("Treasury")}</p>
                <h2 className="mt-1 text-lg font-semibold text-[var(--business-text)]">{t("Stripe Connect")}</h2>
              </div>
              <CreditCard size={20} className="text-[var(--business-primary)]" />
            </div>
            <p className="mb-4 text-sm leading-6 text-[var(--business-muted)]">
              {stripeConnected
                ? t("Stripe is connected for campaign funding and creator payout operations.")
                : t("Connect Stripe to fund campaign pools and keep treasury actions available.")}
            </p>
            <div className="mb-4">
              <BusinessStatusPill tone={stripeConnected ? "success" : "warning"}>
                {stripeConnected ? t("Connected") : t("Action needed")}
              </BusinessStatusPill>
            </div>
            <Button onClick={connectStripe} disabled={stripeLoading} className="h-11 w-full rounded-xl bg-[linear-gradient(135deg,var(--business-primary)_0%,var(--business-secondary)_100%)] text-xs font-semibold text-[var(--business-bg)] hover:brightness-105">
              {stripeLoading ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
              {stripeConnected ? t("Refresh Stripe setup") : t("Connect Stripe")}
            </Button>
          </BusinessGlassCard>

          <BusinessGlassCard>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--business-muted)]">{t("Security")}</p>
                <h2 className="mt-1 text-lg font-semibold text-[var(--business-text)]">{t("Login and password")}</h2>
              </div>
              <KeyRound size={20} className="text-[var(--business-primary)]" />
            </div>
            <p className="mb-4 text-sm leading-6 text-[var(--business-muted)]">
              {t("Send a secure reset link to the account email if you need to rotate the password.")}
            </p>
            <Button onClick={sendPasswordReset} disabled={passwordLoading || !profile?.email} variant="outline" className="h-11 w-full rounded-xl border-white/10 bg-white/[0.04] text-xs font-semibold text-[var(--business-text)] hover:bg-white/[0.08]">
              {passwordLoading ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
              {t("Send password reset email")}
            </Button>
          </BusinessGlassCard>

          <BusinessGlassCard>
            <div className="flex items-start gap-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-[rgba(52,211,153,0.20)] bg-[rgba(52,211,153,0.10)] text-[var(--business-success)]">
                <ShieldCheck size={18} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-[var(--business-text)]">{t("Workspace access")}</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--business-muted)]">
                  {t("Role and permission changes are managed by Aether admins for now.")}
                </p>
              </div>
            </div>
          </BusinessGlassCard>

          <DeleteAccountCard tone="business" />
        </div>
      </div>
    </BusinessPortalShell>
  );
}
