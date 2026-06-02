import type { SupabaseClient } from "@supabase/supabase-js";

export type StripeWebhookEvent = {
  type: string;
  data: { object: Record<string, unknown> };
};

/**
 * Processes verified Stripe webhook events (shared by Vercel route and Supabase Edge Function).
 * Caller must use a service-role Supabase client — never expose that key to the browser.
 */
export async function handleStripeWebhookEvent(
  supabase: SupabaseClient,
  event: StripeWebhookEvent
): Promise<void> {
  switch (event.type) {
    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object as {
        id: string;
        metadata?: {
          participationId?: string;
          transactionId?: string;
          campaignId?: string;
          kind?: string;
        };
      };

      // Performance campaign pool funding: activate the campaign on payment and
      // record the platform fee as revenue.
      if (paymentIntent.metadata?.kind === "pool_funding") {
        const campaignId = paymentIntent.metadata?.campaignId;

        // Load the campaign to compute the fee (and confirm it belongs to this PI).
        const campSel = supabase
          .from("campaigns")
          .select("id, business_id, budget_pool, platform_fee_pct, available_pool")
          .limit(1);
        const { data: camp } = await (campaignId
          ? campSel.eq("id", campaignId)
          : campSel.eq("funding_payment_intent_id", paymentIntent.id)
        ).maybeSingle();

        if (!camp) {
          console.error(
            `Pool funding PI ${paymentIntent.id}: no matching campaign to activate.`
          );
          break;
        }

        const { error: campErr } = await supabase
          .from("campaigns")
          .update({ status: "open", funded_at: new Date().toISOString() })
          .eq("id", camp.id);
        if (campErr) {
          console.error(
            `Error activating campaign ${camp.id} for pool funding:`,
            campErr.message
          );
        }

        // Record platform revenue (idempotent: unique on campaign_id).
        const pool = Number((camp as { budget_pool?: number | null }).budget_pool ?? 0);
        const feePct = Number((camp as { platform_fee_pct?: number | null }).platform_fee_pct ?? 0);
        const fee = Math.round(pool * feePct * 100) / 100;
        if (fee > 0) {
          const { error: feeErr } = await supabase
            .from("platform_transactions")
            .upsert(
              {
                campaign_id: camp.id,
                business_id: (camp as { business_id: string }).business_id,
                amount: fee,
                fee_pct: feePct,
                type: "platform_fee",
              },
              { onConflict: "campaign_id", ignoreDuplicates: true }
            );
          if (feeErr) {
            console.error(`Error recording platform fee for campaign ${camp.id}:`, feeErr.message);
          }
        }
        break;
      }

      const participationId = paymentIntent.metadata?.participationId;
      const transactionId = paymentIntent.metadata?.transactionId;

      let txQuery = supabase.from("transactions").update({ status: "succeeded" });

      if (transactionId) {
        txQuery = txQuery.eq("id", transactionId);
      } else {
        txQuery = txQuery.eq("stripe_payment_intent_id", paymentIntent.id);
      }

      const { data: txData, error: txError } = await txQuery.select().single();

      if (txError) {
        console.error(
          `Error updating transaction for PaymentIntent ${paymentIntent.id}:`,
          txError.message
        );
      }

      const targetPartId = participationId || txData?.participation_id;
      if (targetPartId) {
        const { error: partError } = await supabase
          .from("participations")
          .update({ status: "in_progress" })
          .eq("id", targetPartId);

        if (partError) {
          console.error(
            `Error updating participation ${targetPartId}:`,
            partError.message
          );
        }
      }
      break;
    }

    case "account.updated": {
      const account = event.data.object as {
        id: string;
        details_submitted?: boolean;
      };

      if (account.details_submitted) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ stripe_onboarding_completed: true })
          .eq("stripe_connect_id", account.id);

        if (profileError) {
          console.error(
            `Error updating profile for Stripe Account ${account.id}:`,
            profileError.message
          );
        }
      }
      break;
    }

    case "transfer.created": {
      const transfer = event.data.object as { id: string };
      const { error: txError } = await supabase
        .from("transactions")
        .update({ status: "succeeded" })
        .eq("stripe_payment_intent_id", transfer.id);

      if (txError) {
        console.error(`Error marking transfer succeeded:`, txError.message);
      }
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}