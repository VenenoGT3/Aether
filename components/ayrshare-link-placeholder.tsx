"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CirclePlay, Link2, Music2, RefreshCw, ShieldCheck, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost } from "@/lib/api/client";
import { getSupabaseUrl } from "@/lib/env";
import { supabase } from "@/lib/supabase/client";
import { useTranslation } from "@/lib/translations";

type Provider = "tiktok_official" | "youtube_official";

type SocialAccountStatus = {
  id: string;
  platform: "youtube" | "tiktok" | "instagram";
  provider: Provider | "ayrshare" | "phyllo";
  external_account_id: string;
  handle: string | null;
  display_name: string | null;
  profile_url: string | null;
  scopes: string[] | null;
  status: "active" | "expired" | "revoked" | "error";
  last_verified_at: string | null;
  token_expires_at: string | null;
};

type AccountsResponse = {
  success: true;
  accounts: SocialAccountStatus[];
};

const LINKABLE_PROVIDERS: Array<{
  provider: Provider;
  platform: "tiktok" | "youtube";
  label: string;
  Icon: typeof Music2;
}> = [
  {
    provider: "tiktok_official",
    platform: "tiktok",
    label: "TikTok",
    Icon: Music2,
  },
  {
    provider: "youtube_official",
    platform: "youtube",
    label: "YouTube",
    Icon: CirclePlay,
  },
];

/**
 * Creator account linking for trusted view tracking.
 *
 * Token exchange/storage happens in supabase/functions/social-oauth with the
 * service role. This client reads only redacted status rows and starts OAuth.
 */
export function AyrshareLinkPlaceholder() {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<SocialAccountStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<Provider | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.status === "active"),
    [accounts]
  );

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<AccountsResponse>("/api/social-accounts");
      setAccounts(data.accounts);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Could not load linked social accounts."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch linked account status once on mount
    void loadAccounts();
  }, [loadAccounts]);

  const startLink = async (provider: Provider) => {
    setConnecting(provider);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error(t("Please sign in to connect a social account."));
      }

      const res = await fetch(
        `${getSupabaseUrl().replace(/\/$/, "")}/functions/v1/social-oauth/start`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ provider }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) {
        throw new Error(data.error || t("Could not start account linking."));
      }
      window.location.assign(data.url);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("Could not start account linking.")
      );
      setConnecting(null);
    }
  };

  const disconnect = async (accountId: string) => {
    setDisconnecting(accountId);
    try {
      await apiPost<{ success: true; disconnected: boolean }>(
        "/api/social-accounts",
        { accountId }
      );
      toast.success(t("Social account disconnected."));
      await loadAccounts();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("Could not disconnect this account.")
      );
    } finally {
      setDisconnecting(null);
    }
  };

  const statusText =
    activeAccounts.length > 0
      ? t("Trusted tracking enabled")
      : t("Connect accounts");

  return (
    <div className="p-6 apple-card">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-sm font-bold flex items-center gap-1.5">
          <Link2 size={15} className="text-primary" /> {t("View tracking")}
        </h3>
        <span className="text-[9px] font-bold uppercase tracking-wide bg-secondary text-muted-foreground border border-border/30 px-2 py-0.5 rounded-full">
          {loading ? t("Checking") : statusText}
        </span>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed mb-4">
        {t(
          "Connect TikTok or YouTube so eligible clips can be verified through official view providers."
        )}
      </p>

      <div className="space-y-2">
        {LINKABLE_PROVIDERS.map(({ provider, label, Icon }) => {
          const account = accounts.find(
            (item) => item.provider === provider && item.status === "active"
          );
          const busy = connecting === provider || disconnecting === account?.id;
          return (
            <div
              key={provider}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/40 p-3"
            >
              <div className="min-w-0 flex items-center gap-2">
                <Icon size={16} className="text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-bold leading-tight">{label}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {account
                      ? account.display_name || account.handle || t("Connected")
                      : t("Not connected")}
                  </p>
                </div>
              </div>

              {account ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void disconnect(account.id)}
                  className="h-8 px-2 text-muted-foreground"
                  title={t("Disconnect account")}
                >
                  {busy ? <RefreshCw size={14} className="animate-spin" /> : <Unlink size={14} />}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void startLink(provider)}
                  className="h-8 gap-1.5 px-3 text-xs font-bold"
                >
                  {busy ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <ShieldCheck size={14} />
                  )}
                  {t("Connect")}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
