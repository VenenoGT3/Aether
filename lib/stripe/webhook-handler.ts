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
        metadata?: { participationId?: string; transactionId?: string };
      };
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