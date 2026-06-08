"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const action = searchParams.get("action");
  const role = searchParams.get("role") as "business" | "influencer" | null;
  const safeRole = role === "business" || role === "influencer" ? role : "creator";
  const status = action === "return" ? "success" : "error";
  const errorMsg =
    action === "refresh"
      ? "The onboarding session expired. Please restart the Stripe Connect setup flow."
      : "Invalid action code received.";

  const appleSpring = {
    type: "spring" as const,
    stiffness: 300,
    damping: 30,
    mass: 0.8
  };

  useEffect(() => {
    if (action === "return") {
      toast.success("Stripe Connect returned successfully.", {
        description: "Aether is verifying your account status with Stripe."
      });
    }
  }, [action]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-secondary/10 min-h-[calc(100vh-4rem)] relative">
      <div className="absolute inset-0 bg-gradient-to-tr from-[#007AFF]/5 via-transparent to-[#34C759]/5 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={appleSpring}
        className="w-full max-w-md p-8 rounded-3xl bg-card border border-border/30 shadow-md glass-panel text-center"
      >
        <div className="flex items-center gap-2 justify-center text-[#635BFF] mb-6 font-bold select-none text-base">
          <span className="w-6 h-6 rounded bg-[#635BFF] flex items-center justify-center text-white text-[10px]">S</span>
          stripe <span className="text-muted-foreground/60 font-medium">connect</span>
        </div>

        {status === "success" && (
          <div className="py-6 flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-[#34C759]/10 text-[#34C759] flex items-center justify-center mb-5">
              <CheckCircle2 size={36} />
            </div>
            <h2 className="text-xl font-bold tracking-tight">Account Linked Successfully</h2>
            <p className="text-xs text-muted-foreground mt-2 max-w-xs leading-relaxed">
              We are verifying your Stripe Connect Express account server-side. Payouts and escrows unlock after Stripe confirms the account is ready.
            </p>
            <Button
              onClick={() => router.push(`/${safeRole === "influencer" ? "creator" : safeRole}/dashboard`)}
              className="mt-8 w-full rounded-2xl py-5 font-semibold text-sm cursor-pointer shadow-sm gap-2"
            >
              Go to Dashboard <ArrowRight size={16} />
            </Button>
          </div>
        )}

        {status === "error" && (
          <div className="py-6 flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-5">
              <AlertCircle size={36} />
            </div>
            <h2 className="text-xl font-bold tracking-tight">Setup Interrupted</h2>
            <p className="text-xs text-muted-foreground mt-2 max-w-xs leading-relaxed">
              {errorMsg}
            </p>
            <Button
              onClick={() => router.push("/dashboard")}
              variant="outline"
              className="mt-8 w-full rounded-2xl py-5 font-semibold text-sm border-border cursor-pointer hover:bg-secondary/40"
            >
              Back to Dashboard
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default function StripeCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    }>
      <CallbackContent />
    </Suspense>
  );
}
