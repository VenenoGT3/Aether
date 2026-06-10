"use client";

import { useState } from "react";
import { Loader2, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CreatorGlassCard } from "@/components/creator/creator-ui";
import { BusinessGlassCard } from "@/components/business/business-ui";
import { deleteOwnAccountAction } from "@/lib/actions/account";
import { useTranslation } from "@/lib/translations";

const CONFIRM_WORD = "DELETE";

/**
 * Settings danger zone: permanently delete the account. Two-step confirm
 * (type DELETE) before calling the server action; the RPC refuses while money
 * is in flight and the action surfaces that reason here.
 */
export function DeleteAccountCard({ tone }: { tone: "creator" | "business" }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const Card = tone === "creator" ? CreatorGlassCard : BusinessGlassCard;
  const labelClass =
    tone === "creator"
      ? "creator-label text-white/35"
      : "text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--business-muted)]";
  const titleClass =
    tone === "creator"
      ? "mt-1 text-lg font-semibold text-white"
      : "mt-1 text-lg font-semibold text-[var(--business-text)]";
  const bodyClass =
    tone === "creator"
      ? "mb-4 text-xs leading-5 text-white/55"
      : "mb-4 text-sm leading-6 text-[var(--business-muted)]";
  const inputClass =
    tone === "creator"
      ? "creator-input w-full rounded-xl px-3 py-3 text-sm"
      : "business-input h-12 w-full rounded-xl px-4 text-sm";

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await deleteOwnAccountAction();
      if (!res.success) {
        toast.error(res.error || t("Your account could not be deleted right now."));
        return;
      }
      toast.success(t("Your account has been deleted."));
      window.location.assign("/");
    } catch {
      toast.error(t("Your account could not be deleted right now."));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className={labelClass}>{t("Danger zone")}</p>
          <h2 className={titleClass}>{t("Delete account")}</h2>
        </div>
        <TriangleAlert size={20} className="text-[#ff453a]" />
      </div>
      <p className={bodyClass}>
        {t(
          "Permanently removes your account, profile, campaigns, clips, and history. Earnings in flight, processing payouts, live campaigns, or unreleased escrow must be settled first. This cannot be undone."
        )}
      </p>

      {open ? (
        <div className="space-y-3">
          <label className="block space-y-2">
            <span className={labelClass}>
              {t("Type {word} to confirm").replace("{word}", CONFIRM_WORD)}
            </span>
            <input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder={CONFIRM_WORD}
              autoComplete="off"
              className={inputClass}
            />
          </label>
          <div className="flex gap-2">
            <Button
              onClick={handleDelete}
              disabled={deleting || confirmText.trim() !== CONFIRM_WORD}
              className="h-11 flex-1 rounded-xl border-0 bg-[#ff453a] text-xs font-semibold text-white hover:bg-[#e63b31]"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {t("Delete my account forever")}
            </Button>
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => {
                setOpen(false);
                setConfirmText("");
              }}
              className="h-11 rounded-xl border-white/10 bg-white/[0.04] px-4 text-xs font-semibold hover:bg-white/[0.08]"
            >
              {t("Cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          onClick={() => setOpen(true)}
          className="h-11 w-full rounded-xl border-[#ff453a33] bg-[#ff453a14] text-xs font-semibold text-[#ff453a] hover:bg-[#ff453a24]"
        >
          <Trash2 size={14} />
          {t("Delete account")}
        </Button>
      )}
    </Card>
  );
}
