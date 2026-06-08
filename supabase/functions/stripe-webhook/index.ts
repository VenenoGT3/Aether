/**
 * Stripe webhook handler — runs on Supabase Edge Functions.
 *
 * Secrets (Supabase Dashboard → Edge Functions → Secrets):
 *   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 * Auto-injected by Supabase:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Stripe Dashboard → Webhooks → Endpoint URL:
 *   https://<project-ref>.supabase.co/functions/v1/stripe-webhook
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

async function handleEvent(
  supabase: ReturnType<typeof createClient>,
  event: { type: string; data: { object: Record<string, unknown> } }
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

      // Performance campaign pool funding: activate the campaign and record the
      // platform-fee ledger through the same idempotent RPC used by the Vercel
      // fallback handler.
      if (paymentIntent.metadata?.kind === "pool_funding") {
        const campaignId = paymentIntent.metadata?.campaignId;
        const { error } = await supabase.rpc("settle_pool_funding_payment", {
          p_payment_intent_id: paymentIntent.id,
          p_campaign_id: campaignId ?? null,
        });
        if (error) console.error("campaign pool funding:", error.message);
        break;
      }

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
        console.error("transaction update:", txError.message);
      }

      const targetPartId = participationId || txData?.participation_id;
      if (targetPartId) {
        const { error: partError } = await supabase
          .from("participations")
          .update({ status: "accepted" })
          .eq("id", targetPartId);
        if (partError) console.error("participation update:", partError.message);
      }
      break;
    }
    case "account.updated": {
      const account = event.data.object as {
        id: string;
        details_submitted?: boolean;
      };
      if (account.details_submitted) {
        const { error } = await supabase
          .from("profiles")
          .update({ stripe_onboarding_completed: true, onboarded: true })
          .eq("stripe_connect_id", account.id);
        if (error) console.error("profile update:", error.message);
      }
      break;
    }
    case "transfer.created": {
      const transfer = event.data.object as { id: string };
      const { error } = await supabase
        .from("transactions")
        .update({ status: "succeeded" })
        .eq("stripe_payment_intent_id", transfer.id);
      if (error) console.error("transfer update:", error.message);
      break;
    }
    default:
      console.log("Unhandled event:", event.type);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!stripeSecret || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({
        error:
          "Missing STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, or Supabase runtime env",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return new Response(JSON.stringify({ error: "Missing stripe-signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: "2024-11-20.acacia" });

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret) as typeof event;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    await handleEvent(supabase, event);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
