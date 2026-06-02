"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Loader2, Lock, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getStripePromise } from "@/lib/stripe/browser";
import { useTranslation } from "@/lib/translations";
import { feeBreakdown } from "@/lib/campaign-budget";

const appleSpring = { type: "spring" as const, stiffness: 300, damping: 30, mass: 0.8 };

function PoolPaymentInner({
  amount,
  campaignTitle,
  onSucceeded,
  onClose,
}: {
  amount: number;
  campaignTitle: string;
  onSucceeded: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const split = feeBreakdown(amount);

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setPaying(true);
    setError(null);

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (confirmError) {
      setError(confirmError.message || t("Payment failed. Please try again."));
      setPaying(false);
      return;
    }

    if (
      paymentIntent &&
      (paymentIntent.status === "succeeded" || paymentIntent.status === "processing")
    ) {
      onSucceeded();
    } else {
      setError(t("Payment did not complete. Please try again."));
      setPaying(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="p-4 rounded-2xl bg-secondary/30 border border-border/10 text-xs space-y-1">
        <div className="flex justify-between font-semibold text-muted-foreground">
          <span>{t("Campaign:")}</span>
          <span className="text-foreground text-right truncate max-w-[200px]">
            {campaignTitle || t("New Campaign")}
          </span>
        </div>
        <div className="flex justify-between font-semibold text-muted-foreground border-t border-border/10 pt-2.5 mt-2.5">
          <span>{t("Platform fee (10%):")}</span>
          <span>${split.fee.toLocaleString()}</span>
        </div>
        <div className="flex justify-between font-semibold text-muted-foreground">
          <span>{t("Creators can earn:")}</span>
          <span className="text-[#34C759]">${split.creators.toLocaleString()}</span>
        </div>
        <div className="flex justify-between font-bold text-sm border-t border-border/10 pt-2.5 mt-1">
          <span>{t("You pay:")}</span>
          <span className="text-foreground">${amount.toLocaleString()}</span>
        </div>
      </div>

      <PaymentElement />

      {error && (
        <p className="text-xs text-destructive font-medium leading-normal">{error}</p>
      )}

      <div className="flex gap-3 border-t border-border/10 pt-4">
        <Button
          onClick={onClose}
          variant="ghost"
          disabled={paying}
          className="w-1/2 rounded-full py-3 text-xs font-semibold cursor-pointer text-muted-foreground hover:text-foreground h-auto"
        >
          {t("Cancel")}
        </Button>
        <Button
          onClick={handlePay}
          disabled={paying || !stripe}
          className="w-1/2 rounded-full py-3 text-xs font-bold bg-[#34C759] hover:bg-[#2fb350] text-white border-0 cursor-pointer shadow-md h-auto gap-1.5"
        >
          {paying ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
          {t("Fund pool")} · ${amount.toLocaleString()}
        </Button>
      </div>
    </div>
  );
}

export function PoolPaymentModal({
  open,
  clientSecret,
  amount,
  campaignTitle,
  onSucceeded,
  onClose,
}: {
  open: boolean;
  clientSecret: string | null;
  amount: number;
  campaignTitle: string;
  onSucceeded: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  if (!open || !clientSecret) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={appleSpring}
        className="w-full max-w-md bg-card border border-border/40 rounded-3xl shadow-2xl p-8 overflow-hidden relative z-10"
      >
        <div className="flex justify-between items-start mb-6">
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-[#34C759] block mb-0.5">
              {t("Performance Pool Funding")}
            </span>
            <h3 className="text-lg font-bold text-foreground flex items-center gap-1.5">
              <Zap size={16} className="text-[#34C759]" /> {t("Fund Your Campaign")}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-secondary hover:bg-secondary/75 flex items-center justify-center cursor-pointer transition-colors"
          >
            <X size={14} className="text-muted-foreground" />
          </button>
        </div>

        <Elements
          stripe={getStripePromise()}
          options={{ clientSecret, appearance: { theme: "stripe" } }}
        >
          <PoolPaymentInner
            amount={amount}
            campaignTitle={campaignTitle}
            onSucceeded={onSucceeded}
            onClose={onClose}
          />
        </Elements>
      </motion.div>
    </div>
  );
}
