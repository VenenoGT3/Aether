"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { 
  ArrowDownLeft, 
  ArrowUpRight, 
  Lock, 
  ArrowRight,
  TrendingUp,
  Clock,
  CheckCircle2,
  HelpCircle,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { withdrawFundsAction, getTransactionLedgerAction } from "@/lib/stripe/actions";

interface Transaction {
  id: string;
  amount: number;
  type: "escrow" | "release" | "bonus" | "refund" | "payout";
  status: "pending" | "succeeded" | "failed" | "refunded";
  stripe_payment_intent_id?: string;
  /** Set for performance-clipping payouts (worker mark_payout_paid). */
  payout_id?: string;
  created_at: string;
  campaignTitle?: string;
}

/**
 * Legacy fixed-fee escrow wallet. It shows escrow funding, contract releases,
 * and manual withdrawals only. Performance-clipping earnings & payouts (which
 * carry a payout_id) belong to the new model and are intentionally hidden here —
 * they live on the creator's "Clips & Earnings" page (see banner + the payout_id
 * filter in loadLedger).
 */

export default function WalletUI() {
  const [loading, setLoading] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [availableBalance, setAvailableBalance] = useState(0);
  const [pendingBalance, setPendingBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const appleSpring = {
    type: "spring" as const,
    stiffness: 300,
    damping: 30,
    mass: 0.8
  };

  const loadLedger = async () => {
    try {
      setLedgerLoading(true);
      const res = (await getTransactionLedgerAction()) as {
        success: boolean;
        transactions?: Transaction[];
        availableBalance?: number;
        pendingBalance?: number;
        error?: string;
      };
      if (!res.success) {
        toast.error(res.error || "Error loading wallet balances.");
        return;
      }
      // Legacy fixed-fee wallet: hide performance-clipping payouts (they carry a
      // payout_id and are surfaced on the creator's "Clips & Earnings" page).
      const fixedFeeTx = (res.transactions || []).filter((tx) => !tx.payout_id);
      setTransactions(fixedFeeTx);
      setAvailableBalance(res.availableBalance || 0);
      setPendingBalance(res.pendingBalance || 0);
    } catch (error) {
      console.error("Failed to load transactions ledger:", error);
      toast.error("Error loading wallet balances.");
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    loadLedger();
    
    // Listen to local changes (e.g. if released campaign in detail view)
    const handleStorageChange = () => {
      loadLedger();
    };
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("role-change", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("role-change", handleStorageChange);
    };
  }, []);

  const handleWithdraw = async () => {
    if (availableBalance <= 0) {
      toast.error("Withdrawal error", {
        description: "You have no available funds to withdraw."
      });
      return;
    }

    setLoading(true);
    try {
      const withdrawAmount = availableBalance;
      const res = await withdrawFundsAction(withdrawAmount);

      if (res.success) {
        await loadLedger();

        // Fire premium confetti explosion!
        triggerConfetti();

        toast.success("Withdrawal Complete!", {
          description: `Successfully initiated transfer of $${withdrawAmount.toLocaleString()} to your linked bank account.`
        });
      } else {
        toast.error("Withdrawal failed", {
          description: res.error || "An error occurred with Stripe Connect."
        });
      }
    } catch (err) {
      toast.error("Withdrawal failed", {
        description: err instanceof Error ? err.message : "An unexpected error occurred."
      });
    } finally {
      setLoading(false);
    }
  };

  const triggerConfetti = () => {
    const duration = 2.5 * 1000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ["#34C759", "#007AFF", "#FF9500"]
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ["#34C759", "#007AFF", "#FF9500"]
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2
    }).format(val);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring" as const,
        stiffness: 260,
        damping: 25
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Clarify scope: this wallet is the legacy fixed-fee escrow view. */}
      <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-secondary/20 border border-border/10 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-2">
          <Lock size={12} className="text-[#FF9500] shrink-0" />
          {"This wallet covers fixed-fee escrow campaigns. Pay-per-view earnings & payouts live on Clips & Earnings."}
        </span>
        <Link href="/creator/clips" className="font-semibold text-primary hover:underline whitespace-nowrap flex items-center gap-1">
          Clips & Earnings <ArrowRight size={12} />
        </Link>
      </div>

      {/* Balances Display Card */}
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={appleSpring}
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
      >
        {/* Available Balance Panel */}
        <div className="p-8 rounded-3xl bg-card border border-border/30 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[190px]">
          <div className="absolute top-0 right-0 w-[180px] h-[90px] bg-gradient-to-l from-[#34C759]/8 to-transparent blur-[50px] pointer-events-none" />
          
          <div className="flex justify-between items-start text-muted-foreground">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider block mb-1">Available to Payout</span>
              <h2 className="text-3xl font-bold tracking-tight text-foreground">
                {ledgerLoading ? (
                  <span className="h-9 w-32 bg-secondary/60 animate-pulse rounded-lg block" />
                ) : (
                  formatCurrency(availableBalance)
                )}
              </h2>
            </div>
            <span className="p-2 rounded-2xl bg-[#34C759]/10 text-[#34C759]">
              <ArrowDownLeft size={16} />
            </span>
          </div>

          <div className="mt-4">
            <Button
              onClick={handleWithdraw}
              disabled={loading || ledgerLoading || availableBalance <= 0}
              className="w-full rounded-2xl py-5 font-semibold text-xs cursor-pointer shadow-sm bg-[#34C759] hover:bg-[#2fb350] hover:scale-[1.01] active:scale-[0.99] transition-transform text-white border-0 gap-1.5"
            >
              {loading ? (
                <>
                  <Loader2 size={13} className="animate-spin" /> Transferring...
                </>
              ) : (
                <>
                  Withdraw Balance <ArrowUpRight size={13} />
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Pending Escrow Panel */}
        <div className="p-8 rounded-3xl bg-card border border-border/30 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[190px]">
          <div className="absolute top-0 right-0 w-[180px] h-[90px] bg-gradient-to-l from-[#FF9500]/8 to-transparent blur-[50px] pointer-events-none" />
          
          <div className="flex justify-between items-start text-muted-foreground">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider block mb-1">Locked in Escrow</span>
              <h2 className="text-3xl font-bold tracking-tight text-foreground">
                {ledgerLoading ? (
                  <span className="h-9 w-32 bg-secondary/60 animate-pulse rounded-lg block" />
                ) : (
                  formatCurrency(pendingBalance)
                )}
              </h2>
            </div>
            <span className="p-2 rounded-2xl bg-[#FF9500]/10 text-[#FF9500]">
              <Lock size={15} />
            </span>
          </div>

          <div className="text-[11px] text-muted-foreground/80 flex items-center gap-1.5 leading-normal mt-auto border-t border-border/10 pt-4">
            <Clock size={12} className="shrink-0 text-[#FF9500]" />
            <span>Funds are released automatically when content drafts are approved by brands.</span>
          </div>
        </div>

        {/* Analytics mini summary panel */}
        <div className="p-8 rounded-3xl bg-card border border-border/30 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[190px]">
          <div className="absolute top-0 right-0 w-[180px] h-[90px] bg-gradient-to-l from-[#007AFF]/8 to-transparent blur-[50px] pointer-events-none" />
          
          <div className="flex justify-between items-start text-muted-foreground">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider block mb-1">Gross Earnings</span>
              <h2 className="text-3xl font-bold tracking-tight text-foreground">
                {ledgerLoading ? (
                  <span className="h-9 w-32 bg-secondary/60 animate-pulse rounded-lg block" />
                ) : (
                  formatCurrency(availableBalance + pendingBalance)
                )}
              </h2>
            </div>
            <span className="p-2 rounded-2xl bg-[#007AFF]/10 text-[#007AFF]">
              <TrendingUp size={16} />
            </span>
          </div>

          <div className="text-[11px] text-muted-foreground/80 flex items-center gap-1.5 leading-normal mt-auto border-t border-border/10 pt-4">
            <CheckCircle2 size={12} className="shrink-0 text-[#34C759]" />
            <span>Stripe Connect Gateway active and securely linked.</span>
          </div>
        </div>
      </motion.div>

      {/* Ledger History List */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="p-8 rounded-3xl bg-card border border-border/30 shadow-sm"
      >
        <div className="flex justify-between items-center mb-6 border-b border-border/10 pb-4">
          <div>
            <h3 className="text-base font-bold tracking-tight">Ledger Transactions</h3>
            <p className="text-[11px] text-muted-foreground">Detailed records of secure escrows, contract releases, and payouts.</p>
          </div>
        </div>

        {ledgerLoading ? (
          <div className="space-y-4 py-2">
            {[1, 2, 3].map((r) => (
              <div key={r} className="flex items-center justify-between py-4 border-b border-border/5">
                <div className="space-y-2">
                  <div className="h-4 w-44 rounded bg-secondary/80 apple-skeleton" />
                  <div className="h-3 w-28 rounded bg-secondary/80 apple-skeleton" />
                </div>
                <div className="h-3.5 w-16 rounded bg-secondary/80 apple-skeleton hidden sm:block" />
                <div className="h-3.5 w-16 rounded bg-secondary/80 apple-skeleton hidden sm:block" />
                <div className="h-3.5 w-24 rounded bg-secondary/80 apple-skeleton hidden md:block" />
                <div className="h-4 w-16 rounded bg-secondary/80 apple-skeleton" />
              </div>
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-12 text-center flex flex-col items-center justify-center">
            <HelpCircle size={28} className="text-muted-foreground/40 mb-3" />
            <p className="text-xs text-muted-foreground">No ledger transactions found yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[10px] font-bold text-muted-foreground uppercase border-b border-border/10 pb-2">
                  <th className="pb-3 pr-4">Transaction / Context</th>
                  <th className="pb-3 px-4">Type</th>
                  <th className="pb-3 px-4">Status</th>
                  <th className="pb-3 px-4">Date</th>
                  <th className="pb-3 pl-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/5 text-xs">
                {transactions.map((tx) => (
                  <motion.tr 
                    key={tx.id} 
                    variants={itemVariants}
                    className="hover:bg-secondary/15 transition-colors"
                  >
                    {/* Title (fixed-fee only — performance payouts are filtered out above) */}
                    <td className="py-4 pr-4 font-semibold text-foreground">
                      {tx.type === "payout" ? (
                        <span>Bank Withdrawal Transfer</span>
                      ) : (
                        <span>{tx.campaignTitle || "Campaign Contract Payout"}</span>
                      )}
                      <span className="block text-[10px] text-muted-foreground font-normal mt-0.5 select-all">
                        Ref: {tx.stripe_payment_intent_id || tx.id}
                      </span>
                    </td>
                    
                    {/* Type Badge */}
                    <td className="py-4 px-4">
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        tx.type === "escrow" 
                          ? "bg-[#FF9500]/10 text-[#FF9500]" 
                          : tx.type === "release"
                          ? "bg-[#34C759]/10 text-[#34C759]"
                          : tx.type === "payout"
                          ? "bg-[#AF52DE]/10 text-[#AF52DE]"
                          : "bg-secondary text-muted-foreground"
                      }`}>
                        {tx.type}
                      </span>
                    </td>

                    {/* Status Badge */}
                    <td className="py-4 px-4">
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        tx.status === "succeeded" 
                          ? "bg-[#34C759]/10 text-[#34C759]" 
                          : tx.status === "pending"
                          ? "bg-[#007AFF]/10 text-[#007AFF]"
                          : "bg-destructive/10 text-destructive"
                      }`}>
                        {tx.status}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="py-4 px-4 text-muted-foreground font-medium">
                      {formatDate(tx.created_at)}
                    </td>

                    {/* Amount — fixed-fee withdrawals are money out (-), everything else in (+). */}
                    <td className={`py-4 pl-4 text-right font-bold text-sm ${
                      tx.type === "payout" ? "text-destructive/80" : "text-foreground"
                    }`}>
                      {tx.type === "payout" ? "-" : "+"}
                      {formatCurrency(tx.amount)}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
