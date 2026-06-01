import { NextRequest, NextResponse } from "next/server";
import { stripeServer } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMockMode } from "@/lib/env";
import { verifyStripeWebhookSignature } from "@/lib/campaign-lifecycle";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") || "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  const sigCheck = verifyStripeWebhookSignature(
    !!webhookSecret,
    !!sig,
    isMockMode
  );
  if (!sigCheck.valid) {
    return NextResponse.json({ error: sigCheck.error }, { status: 401 });
  }

  let event: { type: string; data: { object: Record<string, unknown> } };

  try {
    if (isMockMode) {
      event = JSON.parse(body);
    } else {
      event = stripeServer.webhooks.constructEvent(
        body,
        sig,
        webhookSecret!
      ) as unknown as typeof event;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.error(`Webhook Error: ${message}`);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  if (isMockMode) {
    console.log(`[MOCK DB Webhook] Event received: ${event.type}`);
    return NextResponse.json({ received: true, mock: true });
  }

  const supabase = createAdminClient();

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as {
          id: string;
          metadata?: { participationId?: string; transactionId?: string };
        };
        const participationId = paymentIntent.metadata?.participationId;
        const transactionId = paymentIntent.metadata?.transactionId;

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

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    console.error("Error processing Stripe webhook event:", error);
    return NextResponse.json(
      { error: "Internal webhook handler error" },
      { status: 500 }
    );
  }
}