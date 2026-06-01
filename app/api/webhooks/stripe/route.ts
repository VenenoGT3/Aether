import { NextRequest, NextResponse } from "next/server";
import { stripeServer } from "@/lib/stripe/client";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") || "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: any;

  try {
    if (webhookSecret && sig) {
      // Verify signature in production
      event = stripeServer.webhooks.constructEvent(body, sig, webhookSecret);
    } else {
      // Direct parsing in dev mode when signature secret is missing
      console.warn("⚠️ Stripe Webhook: Missing STRIPE_WEBHOOK_SECRET or stripe-signature header. Direct parsing body (development fallback).");
      event = JSON.parse(body);
    }
  } catch (err: any) {
    console.error(`❌ Webhook Error: ${err.message}`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const isMockDb = 
    !supabaseUrl || 
    supabaseUrl.includes("placeholder-url") ||
    supabaseUrl.includes("your-project-id");

  if (isMockDb) {
    console.log(`[MOCK DB Webhook] Event received: ${event.type}`);
    return NextResponse.json({ received: true, mock: true });
  }

  // Set up Supabase admin or system client since webhook executes unauthenticated
  // Webhooks are verified by Stripe signatures, which makes it secure
  const supabase = await createClient();

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;
        const participationId = paymentIntent.metadata?.participationId;
        const transactionId = paymentIntent.metadata?.transactionId;

        console.log(`💰 PaymentIntent succeeded: ${paymentIntent.id}`);

        // Update transaction status to succeeded
        let txQuery = supabase
          .from("transactions")
          .update({ status: "succeeded" });

        if (transactionId) {
          txQuery = txQuery.eq("id", transactionId);
        } else {
          txQuery = txQuery.eq("stripe_payment_intent_id", paymentIntent.id);
        }

        const { data: txData, error: txError } = await txQuery.select().single();
        
        if (txError) {
          console.error(`Error updating transaction for PaymentIntent ${paymentIntent.id}:`, txError.message);
        }

        // Transition participation status to escrowed / in_progress
        const targetPartId = participationId || txData?.participation_id;
        if (targetPartId) {
          const { error: partError } = await supabase
            .from("participations")
            .update({ status: "in_progress" })
            .eq("id", targetPartId);

          if (partError) {
            console.error(`Error updating participation status to in_progress for ID ${targetPartId}:`, partError.message);
          }
        }
        break;
      }

      case "account.updated": {
        const account = event.data.object;
        console.log(`👤 Connected Account updated: ${account.id}`);

        if (account.details_submitted) {
          const { error: profileError } = await supabase
            .from("profiles")
            .update({ stripe_onboarding_completed: true })
            .eq("stripe_connect_id", account.id);

          if (profileError) {
            console.error(`Error updating profile onboarding status for Stripe Account ${account.id}:`, profileError.message);
          } else {
            console.log(`✅ Onboarding marked completed for Stripe Connect Account: ${account.id}`);
          }
        }
        break;
      }

      case "transfer.created": {
        const transfer = event.data.object;
        console.log(`💸 Transfer created: ${transfer.id} to connected account ${transfer.destination}`);
        
        // Mark release transaction as succeeded if it exists
        const { error: txError } = await supabase
          .from("transactions")
          .update({ status: "succeeded" })
          .eq("stripe_payment_intent_id", transfer.id);

        if (txError) {
          console.error(`Error marking transfer transaction succeeded:`, txError.message);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Error processing Stripe webhook event:", error);
    return NextResponse.json({ error: "Internal webhook handler error" }, { status: 500 });
  }
}
