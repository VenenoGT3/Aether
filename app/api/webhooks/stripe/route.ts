import { NextRequest, NextResponse } from "next/server";
import { stripeServer } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isMockMode,
  getStripeWebhookHandler,
  getSupabaseStripeWebhookUrl,
} from "@/lib/env";
import { getStripeWebhookSecret } from "@/lib/env.server";
import { verifyStripeWebhookSignature } from "@/lib/campaign-lifecycle";
import { handleStripeWebhookEvent } from "@/lib/stripe/webhook-handler";
import { guardRateLimitOnly } from "@/lib/api/guard";

export async function POST(req: NextRequest) {
  const rateLimited = guardRateLimitOnly(req, "webhooks/stripe", "webhook");
  if (rateLimited) return rateLimited;

  if (!isMockMode && getStripeWebhookHandler() === "supabase") {
    const edgeUrl = getSupabaseStripeWebhookUrl();
    return NextResponse.json(
      {
        error:
          "Stripe webhooks are handled by the Supabase Edge Function, not this Vercel route.",
        handler: "supabase",
        configure_stripe_endpoint: edgeUrl,
        hint: "Set STRIPE_WEBHOOK_HANDLER=vercel only for legacy local testing.",
      },
      { status: 410 }
    );
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature") || "";
  const webhookSecret = isMockMode
    ? process.env.STRIPE_WEBHOOK_SECRET?.trim()
    : getStripeWebhookSecret();

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
    await handleStripeWebhookEvent(supabase, event);
    return NextResponse.json({ received: true, handler: "vercel" });
  } catch (error: unknown) {
    console.error("Error processing Stripe webhook event:", error);
    return NextResponse.json(
      { error: "Internal webhook handler error" },
      { status: 500 }
    );
  }
}