"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet,
  Clock,
  DollarSign,
  CheckCircle2,
  ArrowDownToLine,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTranslation } from "@/lib/translations";
import { useCreatorEarnings } from "@/lib/supabase/clips";
import {
  WITHDRAWAL_MIN,
  WITHDRAWAL_FEE_PCT,
  withdrawalBreakdown,
  canWithdraw,
} from "@/lib/withdrawal";

const money = (n: number) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const appleSpring = { type: "spring" as const, stiffness: 300, damping: 30, mass: 0.8 };

/**
 * Creator Wallet: real-time balances (available / holdback / total / paid) plus
 * a Withdraw flow with a transparent 7% fee breakdown. Self-contained — reads
 * useCreatorEarnings and triggers withdraw(). Safe to render on multiple pages.
 */
export function CreatorWallet() {
  const { t } = useTranslation();
  const { breakdown, withdraw } = useCreatorEarnings();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const available = breakdown.readyForPayout;
  const holdback = breakdown.inHoldback;
  const paid = breakdown.paid;
  const total = Math.round((available + holdback + paid) * 100) / 100;
  const split = withdrawalBreakdown(available);
  const eligible = canWithdraw(available);

  const handleWithdraw = async () => {
    setBusy(true);
    const res = await withdraw();
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      toast.success(t("Withdrawal sent!"), {
        description: t("{net} is on its way — platform fee {fee}.")
          .replace("{net}", money(res.net ?? 0))
          .replace("{fee}", money(res.fee ?? 0)),
      });
    } else {
      toast.error(res.error || t("Withdrawal failed."));
    }
  };

  return (
    <div className="apple-card p-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[180px] h-[90px] bg-gradient-to-l from-[#34C759]/8 to-transparent blur-[50px] pointer-events-none" />

      <div className="flex items-start justify-between gap-4 mb-5 relative z-10">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#34C759] flex items-center gap-1.5">
            <Wallet size={12} /> {t("Creator Wallet")}
          </span>
          <div className="mt-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
              {t("Available to withdraw")}
            </span>
            <h2 className="text-3xl font-extrabold tracking-tight mt-0.5">{money(available)}</h2>
          </div>
        </div>
        <Button
          onClick={() => setOpen(true)}
          disabled={!eligible}
          className="rounded-full px-5 py-5 font-bold text-xs gap-1.5 cursor-pointer bg-[#34C759] hover:bg-[#2fb350] text-white border-0 shadow-md h-auto disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          <ArrowDownToLine size={14} /> {t("Withdraw")}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3 relative z-10">
        <div className="p-3 rounded-2xl bg-secondary/20 border border-border/10">
          <span className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
            <Clock size={10} className="text-[#FF9500]" /> {t("In holdback")}
          </span>
          <p className="text-sm font-bold mt-1">{money(holdback)}</p>
        </div>
        <div className="p-3 rounded-2xl bg-secondary/20 border border-border/10">
          <span className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
            <DollarSign size={10} className="text-primary" /> {t("Total earned")}
          </span>
          <p className="text-sm font-bold mt-1">{money(total)}</p>
        </div>
        <div className="p-3 rounded-2xl bg-secondary/20 border border-border/10">
          <span className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
            <CheckCircle2 size={10} className="text-[#34C759]" /> {t("Paid out")}
          </span>
          <p className="text-sm font-bold mt-1">{money(paid)}</p>
        </div>
      </div>

      {!eligible && (
        <p className="text-[10px] text-muted-foreground/70 mt-3 relative z-10">
          {t("Minimum {min} available to withdraw.").replace("{min}", money(WITHDRAWAL_MIN))}
        </p>
      )}

      {/* Withdraw modal with fee breakdown */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !busy && setOpen(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={appleSpring}
              className="w-full max-w-sm bg-card border border-border/40 rounded-3xl shadow-2xl p-7 relative z-10"
            >
              <div className="flex justify-between items-start mb-5">
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-[#34C759] block mb-0.5">
                    {t("Withdraw funds")}
                  </span>
                  <h3 className="text-lg font-bold text-foreground">{t("Confirm withdrawal")}</h3>
                </div>
                <button
                  onClick={() => !busy && setOpen(false)}
                  className="w-7 h-7 rounded-full bg-secondary hover:bg-secondary/75 flex items-center justify-center cursor-pointer transition-colors"
                >
                  <X size={14} className="text-muted-foreground" />
                </button>
              </div>

              <div className="rounded-2xl bg-secondary/25 border border-border/10 p-4 text-xs space-y-2.5">
                <div className="flex justify-between text-muted-foreground font-semibold">
                  <span>{t("Available")}</span>
                  <span className="text-foreground">{money(split.gross)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground font-semibold">
                  <span>
                    {t("Platform fee ({pct}%)").replace("{pct}", String(Math.round(WITHDRAWAL_FEE_PCT * 100)))}
                  </span>
                  <span className="text-[#FF9500]">−{money(split.fee)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm border-t border-border/10 pt-2.5">
                  <span>{t("You receive")}</span>
                  <span className="text-[#34C759]">{money(split.net)}</span>
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground/80 leading-normal mt-3">
                {t("The 7% fee covers payment processing and platform costs. Funds go to your connected payout account.")}
              </p>

              <div className="flex gap-3 mt-6">
                <Button
                  onClick={() => setOpen(false)}
                  variant="ghost"
                  disabled={busy}
                  className="w-1/2 rounded-full py-3 text-xs font-semibold cursor-pointer text-muted-foreground hover:text-foreground h-auto"
                >
                  {t("Cancel")}
                </Button>
                <Button
                  onClick={handleWithdraw}
                  disabled={busy}
                  className="w-1/2 rounded-full py-3 text-xs font-bold bg-[#34C759] hover:bg-[#2fb350] text-white border-0 cursor-pointer shadow-md h-auto gap-1.5"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowDownToLine size={14} />}
                  {t("Withdraw")} {money(split.net)}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
