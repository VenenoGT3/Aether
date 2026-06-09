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
import { BusinessActionButton } from "@/components/business/business-ui";
import { getStripePromise } from "@/lib/stripe/browser";
import { useTranslation } from "@/lib/translations";
import { feeBreakdown } from "@/lib/campaign-budget";
import { formatMoneyCompact } from "@/lib/currency";

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
      <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs">
        <div className="flex justify-between gap-4 font-semibold text-[var(--business-muted)]">
          <span>{t("Campaign:")}</span>
          <span className="max-w-[200px] truncate text-right text-[var(--business-text)]">
            {campaignTitle || t("New Campaign")}
          </span>
        </div>
        <div className="mt-3 flex justify-between border-t border-white/10 pt-3 font-semibold text-[var(--business-muted)]">
          <span>{t("Platform fee (10%):")}</span>
          <span>{formatMoneyCompact(split.fee)}</span>
        </div>
        <div className="flex justify-between font-semibold text-[var(--business-muted)]">
          <span>{t("Creators can earn:")}</span>
          <span className="text-[var(--business-success)]">
            {formatMoneyCompact(split.creators)}
          </span>
        </div>
        <div className="mt-2 flex justify-between border-t border-white/10 pt-3 text-sm font-semibold">
          <span>{t("You pay:")}</span>
          <span className="text-[var(--business-text)]">
            {formatMoneyCompact(amount)}
          </span>
        </div>
      </div>

      <PaymentElement />

      {error && (
        <p className="text-xs font-medium leading-normal text-[var(--business-danger)]">{error}</p>
      )}

      <div className="flex gap-3 border-t border-white/10 pt-4">
        <BusinessActionButton
          type="button"
          onClick={onClose}
          variant="ghost"
          disabled={paying}
          className="w-1/2"
        >
          {t("Cancel")}
        </BusinessActionButton>
        <BusinessActionButton
          type="button"
          onClick={handlePay}
          disabled={paying || !stripe}
          icon={paying ? Loader2 : Lock}
          className={`w-1/2 ${paying ? "[&_svg]:animate-spin" : ""}`}
        >
          {t("Fund pool")} · {formatMoneyCompact(amount)}
        </BusinessActionButton>
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
      <div className="absolute inset-0 bg-[#050914]/80 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="business-glass-elevated relative z-10 w-full max-w-md overflow-hidden rounded-2xl p-6 shadow-2xl"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--business-success)]">
              {t("Performance Pool Funding")}
            </span>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-[var(--business-text)]">
              <Zap size={17} className="text-[var(--business-success)]" /> {t("Fund Your Campaign")}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-[var(--business-muted)] transition-colors hover:text-[var(--business-text)]"
            aria-label={t("Close")}
          >
            <X size={16} />
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
